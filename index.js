'use strict';
require('dotenv').config();
const express = require('express');
const { parsePhoneNumber, isValidPhoneNumber } = require('libphonenumber-js');
const { z } = require('zod');

// ── config ────────────────────────────────────────────────────────────────
const GHL_PIT = process.env.GHL_PIT;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const DEFAULT_COUNTRY = process.env.DEFAULT_COUNTRY || 'US';
const PORT = process.env.PORT || 3000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

if (!GHL_PIT)         { console.error('[FATAL] Missing GHL_PIT');         process.exit(1); }
if (!GHL_LOCATION_ID) { console.error('[FATAL] Missing GHL_LOCATION_ID'); process.exit(1); }

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_HEADERS = {
  Authorization: 'Bearer ' + GHL_PIT,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Version: '2021-07-28'
};

// ── logger ────────────────────────────────────────────────────────────────
const LEVELS = { debug:0, info:1, warn:2, error:3 };
function log(level, msg, meta) {
  if ((LEVELS[level] || 0) < (LEVELS[LOG_LEVEL] || 1)) return;
  const line = '[' + new Date().toISOString() + '] [' + level.toUpperCase() + '] ' + msg;
  console.log(meta ? line + ' ' + JSON.stringify(meta) : line);
}

// ── phone ─────────────────────────────────────────────────────────────────
function normalizePhone(raw) {
  try {
    const parsed = parsePhoneNumber(raw, DEFAULT_COUNTRY);
    if (parsed && isValidPhoneNumber(raw, DEFAULT_COUNTRY)) {
      const normalized = parsed.format('E.164');
      log('debug', 'Phone normalized', { raw, normalized });
      return normalized;
    }
  } catch(e) {}
  log('warn', 'Phone normalization failed, using raw', { raw });
  return raw;
}

// ── ghl api ───────────────────────────────────────────────────────────────
async function ghlFetch(method, path, body) {
  const url = GHL_BASE + path;
  log('debug', 'GHL ' + method + ' ' + url, body || undefined);
  const res = await fetch(url, {
    method,
    headers: GHL_HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  log('debug', 'GHL response ' + res.status, { url, data });
  if (!res.ok) {
    let hint = null;
    if (res.status === 401) hint = 'GHL 401: Token invalid. Regenerate PIT inside Company Periscope sub-account with scopes: contacts.write + conversations/message.write';
    if (res.status === 403) hint = 'GHL 403: Wrong sub-account or missing scope.';
    if (res.status === 422) hint = 'GHL 422: ' + JSON.stringify(data);
    if (hint) log('error', hint);
    const err = new Error('GHL ' + res.status);
    err.httpStatus = res.status;
    err.ghlBody = data;
    err.hint = hint;
    throw err;
  }
  return data;
}

async function upsertContact(phone) {
  log('info', 'Upserting contact', { phone, locationId: GHL_LOCATION_ID });
  try {
    const data = await ghlFetch('POST', '/contacts/upsert', { locationId: GHL_LOCATION_ID, phone });
    const contactId = (data && data.contact && data.contact.id) || (data && data.id) || '';
    if (!contactId) throw new Error('No contact id in upsert response: ' + JSON.stringify(data));
    log('info', 'Contact upserted', { contactId });
    return contactId;
  } catch(e) {
    if (e.httpStatus === 404 || e.httpStatus === 405) {
      log('warn', 'Upsert not available, trying create');
      const data = await ghlFetch('POST', '/contacts/', { locationId: GHL_LOCATION_ID, phone });
      const contactId = (data && data.contact && data.contact.id) || '';
      if (!contactId) throw new Error('No contact id in create: ' + JSON.stringify(data));
      return contactId;
    }
    throw e;
  }
}

async function sendSms(contactId, text) {
  log('info', 'Sending SMS', { contactId });
  const data = await ghlFetch('POST', '/conversations/messages', { type: 'SMS', contactId, message: text });
  const messageId = (data && (data.messageId || data.id)) || '';
  if (!messageId) throw new Error('No messageId: ' + JSON.stringify(data));
  log('info', 'SMS sent', { messageId });
  return messageId;
}

// ── express ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));

const MessageSchema = z.object({
  channelId: z.string().min(1),
  contactId: z.string().min(1),
  message: z.object({ type: z.string(), text: z.string().min(1).max(7000) })
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'respond-ghl-middleware', ts: new Date().toISOString() });
});

app.post('/message', async (req, res) => {
  const id = 'req_' + Date.now();
  log('info', 'POST /message', { id });

  const parsed = MessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  }

  const { contactId: rawPhone, message } = parsed.data;
  const phone = normalizePhone(rawPhone);

  let ghlContactId;
  try {
    ghlContactId = await upsertContact(phone);
  } catch(e) {
    log('error', 'Upsert contact failed', { id, phone, status: e.httpStatus });
    return res.status(502).json({ error: 'Failed to upsert contact', hint: e.hint || null, ghlStatus: e.httpStatus, ghlBody: e.ghlBody });
  }

  try {
    const mId = await sendSms(ghlContactId, message.text);
    log('info', 'Success', { id, phone, ghlContactId, mId });
    return res.status(200).json({ mId });
  } catch(e) {
    log('error', 'Send SMS failed', { id, ghlContactId, status: e.httpStatus });
    return res.status(502).json({ error: 'Failed to send SMS', hint: e.hint || null, ghlStatus: e.httpStatus, ghlBody: e.ghlBody });
  }
});

app.listen(PORT, () => log('info', 'respond-ghl-middleware started', { port: PORT, locationId: GHL_LOCATION_ID }));
