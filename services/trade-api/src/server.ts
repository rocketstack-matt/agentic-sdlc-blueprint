import { config } from './config.ts';
import { createApp } from './app.ts';
import { TradeStore } from './store.ts';

createApp({ store: new TradeStore(config.storePath), positionServiceUrl: config.positionServiceUrl }).listen(
  config.port,
  () => console.log(`trade-api listening on :${config.port}`),
);
