import * as dotenv from "dotenv";
dotenv.config();
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) { console.error(`[FATAL] Missing: ${name}`); process.exit(1); }
  return val.trim();
}
export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  logLevel: (process.env.LOG_LEVEL ?? "info").toLowerCase(),
  ghlPit: requireEnv("GHL_PIT"),
  ghlLocationId: requireEnv("GHL_LOCATION_ID"),
  defaultCountry: process.env.DEFAULT_COUNTRY ?? "US",
  ghlBaseUrl: "https://services.leadconnectorhq.com",
  ghlVersion: "2021-07-28",
};