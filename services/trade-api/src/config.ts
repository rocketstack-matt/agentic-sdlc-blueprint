// Every outbound or owned binding is read here, by name, from the environment.
// The names match the `env-binding` of an interface in the CALM model, which is
// what lets gates/drift-check.mjs compare this code to the architecture.
export const config = {
  port: Number(process.env.TRADE_API_PORT ?? 4001),
  storePath: process.env.TRADE_STORE_PATH ?? 'data/trades.json',
  positionServiceUrl: process.env.POSITION_SERVICE_URL ?? 'http://localhost:4002',
};
