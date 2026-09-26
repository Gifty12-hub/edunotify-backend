// Delivery layer. One function per channel, plus deliverToParent()
// which picks the parent's preferred channel and falls back to SMS.
const nodemailer = require("nodemailer");

// Africa's Talking needs international format, e.g. +233244000000.
function normalizePhone(phone) {
  const cleaned = String(phone).replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("233")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+233${cleaned.slice(1)}`;
  return `+233${cleaned}`;
}

async function sendSms({ phone, message }) {
  const apiKey = process.env.MNOTIFY_API_KEY;
  const sender = process.env.MNOTIFY_SENDER_ID;
  if (!apiKey || !sender) throw new Error("SMS is not configured (MNOTIFY_API_KEY / MNOTIFY_SENDER_ID)");

  const recipient = normalizePhone(phone).replace(/^\+/, "");
  const body = { recipient: [recipient], sender, message };

  let res;
  let result;
  try {
    res = await fetch(`https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    result = await res.json().catch(() => ({}));
  } catch (err) {
    const detail = err.name === "TimeoutError" ? "request timed out" : err.message;
    throw new Error(`SMS provider error: ${detail}`);
  }

  const status = String(result?.status || "").toLowerCase();
  if (!res.ok || (status && !["success", "successful", "sent", "queued"].includes(status))) {
    const detail = result?.message || result?.error || result?.status || `HTTP ${res.status}`;
    throw new Error(`SMS failed: ${detail}`);
  }
  return { providerId: result?.message_id || result?.messageId || result?.id };
}

let mailer;
function getMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("Email is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS)");
  }
  if (!mailer) {
    mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return mailer;
}

async function sendEmail({ email, subject, message }) {
  const info = await getMailer().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject,
    text: message,
  });
  return { providerId: info.messageId };
}

// WhatsApp through the Twilio REST API (the Twilio sandbox works for testing).
async function sendWhatsApp({ phone, message }) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    throw new Error("WhatsApp is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM)");
  }
  const body = new URLSearchParams({
    From: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
    To: `whatsapp:${normalizePhone(phone)}`,
    Body: message,
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhatsApp failed: ${data.message || res.status}`);
  return { providerId: data.sid };
}

const senders = {
  sms: (p, parent) => sendSms({ phone: parent.phone, message: p.message }),
  whatsapp: (p, parent) => sendWhatsApp({ phone: parent.phone, message: p.message }),
  email: (p, parent) => sendEmail({ email: parent.email, subject: p.subject, message: p.message }),
};

/**
 * Sends `message` to a parent on their preferred channel.
 * If that channel is unusable (no email on file, or the provider is not
 * configured or fails), it falls back to SMS.
 * Resolves { channel, providerId, note } or throws if every attempt failed.
 */
async function deliverToParent(parent, { message, subject = "School update from EduNotify" }) {
  const payload = { message, subject };
  const preferred = parent.preferredChannel || "sms";
  let note;

  if (preferred === "email" && !parent.email) {
    note = "No email on file, sent by SMS instead";
  } else {
    try {
      const out = await senders[preferred](payload, parent);
      return { channel: preferred, providerId: out.providerId };
    } catch (err) {
      if (preferred === "sms") throw err;
      note = `${preferred} failed (${err.message}), sent by SMS instead`;
    }
  }

  const out = await senders.sms(payload, parent);
  return { channel: "sms", providerId: out.providerId, note };
}

module.exports = { deliverToParent, normalizePhone };
