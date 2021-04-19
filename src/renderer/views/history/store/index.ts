import { observable, computed, action, makeObservable } from 'mobx';
import {
  ISettings,
  IHistoryItem,
  IHistorySection,
  IFavicon,
  ITheme,
} from '~/interfaces';
import { getTheme } from '~/utils/themes';
import { PreloadDatabase } from '~/preloads/models/database';
import { getSectionLabel, compareDates } from '../utils';

export type QuickRange =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last-week'
  | 'last-month'
  | 'older';

export class Store {
  public faviconsDb = new PreloadDatabase<IFavicon>('favicons');

  // Observable

  @observable
  public settings: ISettings = { ...(window as any).settings };

  @observable
  public items: IHistoryItem[] = [];

  @observable
  public itemsLoaded = this.getDefaultLoaded();

  @observable
  public selectedRange: QuickRange = 'all';

  @observable
  public searched = '';

  @observable
  public selectedItems: string[] = [];

  @observable
  public favicons: Map<string, string> = new Map();

  @computed
  public get theme(): ITheme {
    return getTheme(this.settings.theme);
  }

  @computed
  public get sections() {
    const list: IHistorySection[] = [];
    let section: IHistorySection;
    let loaded = 0;

    for (let i = this.items.length - 1; i >= 0; i--) {
      if (loaded > this.itemsLoaded) break;

      const item = this.items[i];
      const date = new Date(item.date);

      if (
        this.searched !== '' &&
        !item.title.toLowerCase().includes(this.searched) &&
        !item.url.includes(this.searched)
      ) {
        continue;
      }

      if (this.range) {
        if (date.getTime() >= this.range.max) continue;
        if (date.getTime() <= this.range.min) break;
      }

      if (compareDates(section && section.date, date)) {
        section.items.push(item);
      } else {
        section = {
          label: getSectionLabel(date),
          items: [item],
          date,
        };
        list.push(section);
      }

      loaded++;
    }

    return list;
  }

  @computed
  public get range() {
    const current = new Date();
    const day = current.getDate();
    const month = current.getMonth();
    const year = current.getFullYear();

    let minDate: Date;
    let maxDate: Date;

    switch (this.selectedRange) {
      case 'today': {
        minDate = new Date(year, month, day, 0, 0, 0, 0);
        maxDate = new Date(year, month, day, 23, 59, 59, 999);
        break;
      }
      case 'yesterday': {
        minDate = new Date(year, month, day - 1, 0, 0, 0, 0);
        maxDate = new Date(year, month, day - 1, 23, 59, 59, 999);
        break;
      }
      case 'last-week': {
        let currentDay = current.getDay() - 1;
        if (currentDay === -1) currentDay = 6;
        minDate = new Date(year, month, day - currentDay - 7, 0, 0, 0, 0);
        maxDate = new Date(year, month, day - currentDay - 1, 0, 0, 0, 0);
        break;
      }
      case 'last-month': {
        minDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
        maxDate = new Date(year, month, 0, 0, 0, 0, 0);
        break;
      }
      case 'older': {
        let currentDay = current.getDay() - 1;
        if (currentDay === -1) currentDay = 6;
        minDate = new Date(0);
        maxDate = new Date(year, month, day - currentDay - 7, 0, 0, 0, 0);
        break;
      }
    }

    return (
      this.selectedRange !== 'all' && {
        min: minDate.getTime(),
        max: maxDate.getTime(),
      }
    );
  }

  public constructor() {
    makeObservable(this);

    (window as any).updateSettings = (settings: ISettings) => {
      this.settings = { ...this.settings, ...settings };
    };

    this.load();
    this.loadFavicons();

    window.addEventListener('resize', () => {
      const loaded = this.getDefaultLoaded();

      if (loaded > this.itemsLoaded) {
        this.itemsLoaded = loaded;
      }
    });
  }

  public resetLoadedItems(): void {
    this.itemsLoaded = this.getDefaultLoaded();
  }

  public getById(id: string): IHistoryItem {
    return this.items.find((x) => x._id === id);
  }

  public async load() {
    this.items = await (window as any).getHistory();
  }

  public async loadFavicons() {
    (await this.faviconsDb.get({})).forEach((favicon) => {
      const { data } = favicon;

      if (this.favicons.get(favicon.url) == null) {
        this.favicons.set(favicon.url, data);
      }
    });
  }

  public clear() {
    this.items = [];
    (window as any).removeHistory(this.items.map((x) => x._id));
  }

  public removeItems(id: string[]) {
    this.items = this.items.filter((x) => id.indexOf(x._id) === -1);
    (window as any).removeHistory(id);
  }

  @action
  public search(str: string) {
    this.searched = str.toLowerCase().toLowerCase();
    this.itemsLoaded = this.getDefaultLoaded();
  }

  public getDefaultLoaded() {
    return Math.floor(window.innerHeight / 48);
  }

  @action
  public deleteSelected() {
    this.selectedItems.forEach(item => {
      this.removeItems([item])
    });
    
    this.selectedItems = [];
  }
}

export default new Store();
