// Every outbound or owned binding is read here, by name, from the environment.
// The names match the `env-binding` of an interface in the CALM model, which is
// what lets gates/drift-check.mjs compare this code to the architecture.
export const config = {
  port: Number(process.env.POSITION_SERVICE_PORT ?? 4002),
  storePath: process.env.POSITION_STORE_PATH ?? 'data/positions.json',
};
