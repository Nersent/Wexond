import DbService from './db';
import {
  IVisitsDetails,
  IVisitItem,
  IHistorySearchDetails,
} from '~/interfaces';
import { IHistoryDbVisitsItem, IHistoryDbItem } from '../interfaces';
import {
  convertFromChromeTime,
  convertToChromeTime,
  dateToChromeTime,
} from '~/common/utils/date';
import {
  IHistoryItem,
  IHistoryAddDetails,
  IHistoryDeleteDetails,
  IHistoryDeleteRange,
  IHistoryVisitsRemoved,
  PageTransition,
} from '~/interfaces/history';
import { getYesterdayTime } from '../utils';
import { HistoryServiceBase } from '~/common/services/history';
import { WorkerMessengerFactory } from '~/common/worker-messenger-factory';
import { registerWorkerEventPropagator } from '../worker-event-handler';
import { IHistoryPrivateChunkDetails } from '~/interfaces/history-private';

const ITEM_SELECT =
  'SELECT id, last_visit_time, title, typed_count, url, visit_count FROM urls';

const VISITS_ITEM_SELECT =
  'SELECT id, url, from_visit, visit_time, transition FROM visits';

class HistoryService extends HistoryServiceBase {
  public start() {
    const handler = WorkerMessengerFactory.createHandler('history', this);

    handler('search', this.search);
    handler('getVisits', this.getVisits);
    handler('addUrl', this.addUrl);
    handler('setTitleForUrl', this.setTitleForUrl);
    handler('deleteUrl', this.deleteUrl);
    handler('deleteRange', this.deleteRange);
    handler('deleteAll', this.deleteAll);
    handler('getChunk', this.getChunk);

    registerWorkerEventPropagator('history', ['visitRemoved'], this);
  }

  private get db() {
    return DbService.history;
  }

  private stripQualifier(type: PageTransition) {
    return type & ~PageTransition.PAGE_TRANSITION_QUALIFIER_MASK;
  }

  private getQualifier(type: PageTransition) {
    return type & PageTransition.PAGE_TRANSITION_QUALIFIER_MASK;
  }

  private getPageTransition(type: PageTransition) {
    return (
      type |
      PageTransition.PAGE_TRANSITION_CHAIN_START |
      PageTransition.PAGE_TRANSITION_CHAIN_END
    );
  }

  private getPageTransitionString(type: PageTransition) {
    const t = this.stripQualifier(type);

    switch (t) {
      case PageTransition.PAGE_TRANSITION_LINK:
        return 'link';
      case PageTransition.PAGE_TRANSITION_TYPED:
        return 'typed';
      case PageTransition.PAGE_TRANSITION_AUTO_BOOKMARK:
        return 'auto_bookmark';
      case PageTransition.PAGE_TRANSITION_AUTO_SUBFRAME:
        return 'auto_subframe';
      case PageTransition.PAGE_TRANSITION_MANUAL_SUBFRAME:
        return 'manual_subframe';
      case PageTransition.PAGE_TRANSITION_GENERATED:
        return 'generated';
      case PageTransition.PAGE_TRANSITION_AUTO_TOPLEVEL:
        return 'auto_toplevel';
      case PageTransition.PAGE_TRANSITION_FORM_SUBMIT:
        return 'form_submit';
      case PageTransition.PAGE_TRANSITION_RELOAD:
        return 'reload';
      case PageTransition.PAGE_TRANSITION_KEYWORD:
        return 'keyword';
      case PageTransition.PAGE_TRANSITION_KEYWORD_GENERATED:
        return 'keyword_generated';
    }

    return null;
  }

  private formatItem = ({
    id,
    last_visit_time,
    title,
    typed_count,
    url,
    visit_count,
  }: IHistoryDbItem): IHistoryItem => {
    return {
      id: id.toString(),
      lastVisitTime: convertFromChromeTime(last_visit_time),
      title,
      typedCount: typed_count,
      url,
      visitCount: visit_count,
    };
  };

  private formatVisitItem = ({
    id,
    url,
    from_visit,
    visit_time,
    transition,
  }: IHistoryDbVisitsItem): IVisitItem => {
    return {
      id: url.toString(),
      visitId: id.toString(),
      referringVisitId: from_visit.toString(),
      visitTime: convertFromChromeTime(visit_time),
      transition: this.getPageTransitionString(transition),
    };
  };

  private getUrlData(url: string, select = '*') {
    return this.db
      .getCachedStatement(`SELECT ${select} FROM urls WHERE url = ? LIMIT 1`)
      .get(url);
  }

  public search({
    text,
    maxResults,
    startTime,
    endTime,
  }: IHistorySearchDetails): IHistoryItem[] {
    const limit = maxResults ?? 100;
    const start = convertToChromeTime(startTime ?? getYesterdayTime());
    const end = convertToChromeTime(endTime);

    let query = `${ITEM_SELECT} WHERE hidden = 0 `;

    let dateQuery = 'AND (last_visit_time >= @start ';

    if (endTime) {
      dateQuery += 'AND last_visit_time <= @end';
    }

    query += dateQuery + ') ';

    if (text) {
      query += `AND (url LIKE @text OR title LIKE @text)`;
    }

    return this.db
      .getCachedStatement(`${query} ORDER BY last_visit_time DESC LIMIT @limit`)
      .all({
        text: text != null ? `%${text}%` : null,
        limit,
        start,
        end,
      })
      .map(this.formatItem);
  }

  public getVisits({ url }: IVisitsDetails): IVisitItem[] {
    const id = this.getUrlData(url, 'id')?.id;

    if (!id) return [];

    return this.db
      .getCachedStatement(
        `${VISITS_ITEM_SELECT} WHERE url = ? ORDER BY visit_time ASC`,
      )
      .all(id)
      .map(this.formatVisitItem);
  }

  public setTitleForUrl(url: string, title: string) {
    this.db
      .getCachedStatement(`UPDATE urls SET title = @title WHERE url = @url`)
      .run({ url, title });
  }

  public addUrl({ url, title, transition }: IHistoryAddDetails) {
    if (!title) title = '';

    if (!transition) transition = PageTransition.PAGE_TRANSITION_LINK;
    transition = this.getPageTransition(transition);

    let item = this.getUrlData(url, 'id, visit_count');

    const time = dateToChromeTime(new Date());

    if (item) {
      this.db
        .getCachedStatement(
          `UPDATE urls SET title = @title, visit_count = @visitCount WHERE id = @id`,
        )
        .run({ id: item.id, visitCount: item.visit_count + 1, title });
    } else {
      this.db
        .getCachedStatement(
          `INSERT INTO urls (url, visit_count, last_visit_time, title) VALUES (@url, @visitCount, @lastVisitTime, @title)`,
        )
        .run({
          url,
          visitCount: 1,
          lastVisitTime: time,
          title,
        });

      item = this.getUrlData(url, 'id');
    }

    this.db
      .getCachedStatement(
        'INSERT INTO visits (url, visit_time, transition, from_visit, segment_id) VALUES (@url, @visitTime, @transition, 0, 0)',
      )
      .run({ url: item.id, visitTime: time, transition });
  }

  public deleteUrl({ url }: IHistoryDeleteDetails) {
    const { id } = this.getUrlData(url, 'id');

    this.db.getCachedStatement('DELETE FROM urls WHERE id = @id').run({ id });
    this.db
      .getCachedStatement('DELETE FROM visits WHERE url = @url')
      .run({ url: id });

    this.emit('visitRemoved', {
      allHistory: false,
      urls: [url],
    } as IHistoryVisitsRemoved);
  }

  public deleteRange({ startTime, endTime }: IHistoryDeleteRange) {
    const start = convertToChromeTime(startTime);
    const end = convertToChromeTime(endTime);

    const range = { start, end };

    const pages = this.db
      .getCachedStatement(
        `SELECT id, url FROM urls WHERE (last_visit_time >= @start AND last_visit_time <= @end)`,
      )
      .all(range);

    const visitQuery = this.db.getCachedStatement(
      `SELECT visit_time FROM visits WHERE url = @url`,
    );

    const removeUrl = this.db.getCachedStatement(
      'DELETE FROM urls where id = @id',
    );
    const removeVisit = this.db.getCachedStatement(
      'DELETE FROM visits where url = @url',
    );

    const urls: string[] = [];

    const count = this.db.transaction((pages: any[]) => {
      pages.forEach(({ id, url }) => {
        const visits: IVisitItem[] = visitQuery.all({ url: id });

        const inRange =
          visits.find((r) => r.visitTime < start || r.visitTime > end) == null;

        if (inRange) {
          urls.push(url);

          removeVisit.run({ url: id });
          removeUrl.run({ id });
        }
      });
    });

    count(pages);

    this.emit('visitRemoved', {
      allHistory: false,
      urls,
    } as IHistoryVisitsRemoved);
  }

  public deleteAll() {
    const urls: string[] = this.db
      .getCachedStatement('SELECT url FROM urls')
      .all()
      .map((r) => r.url);

    this.db.getCachedStatement('DELETE FROM urls').run();
    this.db.getCachedStatement('DELETE FROM visits').run();
    this.db.getCachedStatement('DELETE FROM visit_source').run();

    this.emit('visitRemoved', {
      allHistory: true,
      urls,
    } as IHistoryVisitsRemoved);
  }

  public getChunk(details: IHistoryPrivateChunkDetails): IHistoryItem[] {
    const limit = 32;
    const offset = (details.offset ?? 0) * limit;

    return this.db
      .getCachedStatement(
        `
      SELECT visits.id, urls.url, urls.title, visits.visit_time as last_visit_time FROM visits
      INNER JOIN urls
        ON urls.id = visits.url
      WHERE visits.transition = @transition
      ORDER BY visits.visit_time DESC LIMIT 100 OFFSET 0
    `,
      )
      .all({
        limit,
        offset,
        transition: this.getPageTransition(PageTransition.PAGE_TRANSITION_LINK),
      })
      .map(this.formatItem);
  }
}

export default new HistoryService();
