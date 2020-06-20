import { Worker } from 'worker_threads';

import { WorkerMessengerFactory } from '~/common/worker-messenger-factory';
import { bufferFromUint8Array } from '~/common/utils/buffer';

export class FaviconsService {
  private invoker = WorkerMessengerFactory.createInvoker('favicons');

  constructor(worker: Worker) {
    this.invoker.initialize(worker);
  }

  public getFavicon = async (pageUrl: string) => {
    return Buffer.from(
      await this.invoker.invoke<Uint8Array>('getFavicon', pageUrl),
    );
  };

  public saveFavicon = async (pageUrl: string, faviconUrl: string) => {
    return Buffer.from(
      await this.invoker.invoke<Uint8Array>('saveFavicon', pageUrl, faviconUrl),
    );
  };
}
