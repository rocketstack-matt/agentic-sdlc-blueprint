import { config } from './config.ts';
import { createApp } from './app.ts';
import { PositionStore } from './store.ts';

createApp(new PositionStore(config.storePath)).listen(config.port, () =>
  console.log(`position-service listening on :${config.port}`),
);
