import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from "libphonenumber-js";
import { config } from "./config";
import { logger } from "./logger";
export function normalizePhone(raw: string): { normalized: string; ok: boolean } {
  try {
    const country = config.defaultCountry as CountryCode;
    const parsed = parsePhoneNumber(raw, country);
    if (!parsed || !isValidPhoneNumber(raw, country)) {
      logger.warn("Phone validation failed", { raw });
      return { normalized: raw, ok: false };
    }
    const normalized = parsed.format("E.164");
    logger.debug("Phone normalized", { raw, normalized });
    return { normalized, ok: true };
  } catch(e) {
    logger.warn("Phone normalization error", { raw, error: String(e) });
    return { normalized: raw, ok: false };
  }
}