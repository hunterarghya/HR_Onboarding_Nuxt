import { loadConfig } from './load-config'

// The only place in server/ that reads process.env. Importing this validates the env;
// plugins/00.config.ts imports it first so a bad env stops the server at boot.
export const config = loadConfig(process.env)
