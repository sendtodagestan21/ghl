import { Router, Request, Response } from "express";
import { z } from "zod";
import { normalizePhone } from "../phone";
import { upsertContact, sendSms, GhlError } from "../ghl";
import { logger } from "../logger";
const router = Router();
const Schema = z.object({
  channelId: z.string().min(1),
  contactId: z.string().min(1),
  message: z.object({ type: z.string(), text: z.string().min(1).max(7000) }),
});
router.post("/message", async (req: Request, res: Response) => {
  const id = `req_${Date.now()}`;
  logger.info("POST /message", { id, body: req.body as Record<string,unknown> });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }
  const { contactId, message } = parsed.data;
  const { normalized: phone } = normalizePhone(contactId);
  let ghlContactId: string;
  try {
    const r = await upsertContact(phone);
    ghlContactId = r.contactId;
  } catch(e) {
    const status = e instanceof GhlError ? e.httpStatus : null;
    const body = e instanceof GhlError ? e.ghlBody : String(e);
    const h = e instanceof GhlError ? e.hint : null;
    res.status(502).json({ error: "Failed to upsert contact", hint: h, ghlStatus: status, ghlBody: body }); return;
  }
  try {
    const r = await sendSms(ghlContactId, message.text);
    res.status(200).json({ mId: r.messageId });
  } catch(e) {
    const status = e instanceof GhlError ? e.httpStatus : null;
    const body = e instanceof GhlError ? e.ghlBody : String(e);
    const h = e instanceof GhlError ? e.hint : null;
    res.status(502).json({ error: "Failed to send SMS", hint: h, ghlStatus: status, ghlBody: body });
  }
});
export default router;