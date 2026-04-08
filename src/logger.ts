import { config } from "./config";
const LEVELS: Record<string,number> = { debug:0, info:1, warn:2, error:3 };
const fmt = (l: string, m: string, meta?: object) => `[${new Date().toISOString()}] [${l.toUpperCase()}] ${m}${meta ? " "+JSON.stringify(meta) : ""}`;
const should = (l: string) => LEVELS[l] >= (LEVELS[config.logLevel] ?? 1);
export const logger = {
  debug: (m: string, meta?: object) => { if(should("debug")) console.debug(fmt("debug",m,meta)); },
  info:  (m: string, meta?: object) => { if(should("info"))  console.info(fmt("info",m,meta)); },
  warn:  (m: string, meta?: object) => { if(should("warn"))  console.warn(fmt("warn",m,meta)); },
  error: (m: string, meta?: object) => { if(should("error")) console.error(fmt("error",m,meta)); },
};