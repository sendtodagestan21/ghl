import { config } from "./config";
import { logger } from "./logger";
const BASE = config.ghlBaseUrl;
const HEADERS = { Authorization: `Bearer ${config.ghlPit}`, "Content-Type": "application/json", Accept: "application/json", Version: config.ghlVersion };
export class GhlError extends Error {
  constructor(public httpStatus: number, public ghlBody: unknown, public hint: string | null) {
    super(`GHL API error ${httpStatus}`); this.name = "GhlError";
  }
}
function hint(status: number, body: unknown): string | null {
  if (status === 401) return "GHL 401: Token invalid or from wrong sub-account. Regenerate PIT inside Company Periscope sub-account with scopes: contacts.write + conversations/message.write";
  if (status === 403) return "GHL 403: Token missing scope or wrong sub-account.";
  if (status === 422) return `GHL 422: ${JSON.stringify(body)}`;
  return null;
}
async function ghlFetch(method: string, path: string, body?: object): Promise<{status:number;data:unknown}> {
  const url = `${BASE}${path}`;
  logger.debug(`GHL ${method} ${url}`, body as Record<string,unknown>);
  const res = await fetch(url, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  logger.debug(`GHL ${res.status}`, { url, data } as Record<string,unknown>);
  if (!res.ok) { const h = hint(res.status, data); if(h) logger.error(h); throw new GhlError(res.status, data, h); }
  return { status: res.status, data };
}
export async function upsertContact(phone: string): Promise<{contactId:string;isNew:boolean}> {
  logger.info("Upserting contact", { phone, locationId: config.ghlLocationId });
  try {
    const { data } = await ghlFetch("POST", "/contacts/upsert", { locationId: config.ghlLocationId, phone });
    const d = data as Record<string,unknown>;
    const contactId = (d?.contact as Record<string,string>)?.id ?? (d?.id as string) ?? "";
    if (!contactId) throw new Error("No contact id in upsert response");
    logger.info("Contact upserted", { contactId });
    return { contactId, isNew: (d?.new as boolean) ?? false };
  } catch(e) {
    if (e instanceof GhlError && (e.httpStatus === 404 || e.httpStatus === 405)) {
      logger.warn("Upsert not available, falling back to create");
      const { data } = await ghlFetch("POST", "/contacts/", { locationId: config.ghlLocationId, phone });
      const d = data as Record<string,unknown>;
      const contactId = (d?.contact as Record<string,string>)?.id ?? "";
      if (!contactId) throw new Error("No contact id in create response");
      return { contactId, isNew: true };
    }
    throw e;
  }
}
export async function sendSms(contactId: string, text: string): Promise<{messageId:string;conversationId:string}> {
  logger.info("Sending SMS", { contactId, textLength: text.length });
  const { data } = await ghlFetch("POST", "/conversations/messages", { type: "SMS", contactId, message: text });
  const d = data as Record<string,unknown>;
  const messageId = (d?.messageId as string) ?? (d?.id as string) ?? "";
  if (!messageId) throw new Error("No messageId in send response");
  logger.info("SMS sent", { messageId });
  return { messageId, conversationId: (d?.conversationId as string) ?? "" };
}