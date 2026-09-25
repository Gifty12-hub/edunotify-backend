// Text to speech for Ghanaian languages, using the Khaya AI API (GhanaNLP).
// Gives back a WAV file. Long text is split into sentences, spoken piece by
// piece, and joined into one file.
const crypto = require("crypto");

// Our language codes to Khaya's TTS codes
const TTS_CODES = { en: "eng", tw: "twi", ga: "gaa", ee: "ewe", dag: "dag" };

const cache = new Map(); // key -> Buffer, newest last
const CACHE_LIMIT = 200;

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isConfigured() {
  return Boolean(process.env.KHAYA_API_KEY);
}

/** Splits text into pieces of at most `max` characters, at sentence ends where possible. */
function splitText(text, max = Number(process.env.KHAYA_MAX_CHARS) || 250) {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  const pieces = [];
  let current = "";
  const push = () => { if (current.trim()) pieces.push(current.trim()); current = ""; };

  for (let sentence of sentences) {
    while (sentence.length > max) {
      let cut = sentence.lastIndexOf(" ", max);
      if (cut < max / 2) cut = max;
      if ((current + " " + sentence.slice(0, cut)).trim().length > max) push();
      current = `${current} ${sentence.slice(0, cut)}`.trim();
      push();
      sentence = sentence.slice(cut).trim();
    }
    if ((current + " " + sentence).trim().length > max) push();
    current = `${current} ${sentence}`.trim();
  }
  push();
  return pieces;
}

async function synthesizeChunk(text, code) {
  const base = process.env.KHAYA_BASE_URL || "https://translation-api.ghananlp.org";
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(`${base}/tts/v1/tts`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.KHAYA_API_KEY,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ text, language: code }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      lastError = fail(`Voice service could not be reached: ${err.message}`, 502);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw fail("Voice service rejected the API key (KHAYA_API_KEY)", 502);
    if (res.status === 429 || res.status >= 500) {
      lastError = fail(`Voice service is busy (status ${res.status}). Try again in a moment.`, 502);
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw fail(`Voice service error ${res.status}: ${body.slice(0, 150)}`, 502);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("audio/") && audio.toString("ascii", 0, 4) !== "RIFF") {
      throw fail("Voice service did not return audio", 502);
    }
    return audio;
  }
  throw lastError;
}

function parseWav(buf) {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw fail("Voice service returned an unexpected audio format", 502);
  }
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const start = pos + 8;
    if (id === "fmt ") fmt = buf.subarray(start, start + size);
    if (id === "data") {
      const end = size === 0 || size === 0xffffffff ? buf.length : Math.min(start + size, buf.length);
      data = buf.subarray(start, end);
      break;
    }
    pos = start + size + (size % 2);
  }
  if (!fmt || !data) throw fail("Voice service returned an unexpected audio format", 502);
  return { fmt, data };
}

/** Joins several WAV files (same format) into one, with a short pause between them. */
function mergeWav(buffers) {
  if (buffers.length === 1) return buffers[0];
  const parts = buffers.map(parseWav);
  const { fmt } = parts[0];
  const byteRate = fmt.readUInt32LE(8);
  const blockAlign = fmt.readUInt16LE(12) || 1;
  const pause = Buffer.alloc(Math.round((byteRate * 0.3) / blockAlign) * blockAlign);
  const data = Buffer.concat(parts.flatMap((p, i) => (i < parts.length - 1 ? [p.data, pause] : [p.data])));

  const header = Buffer.alloc(12 + 8 + fmt.length + 8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(header.length - 8 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(fmt.length, 16);
  fmt.copy(header, 20);
  header.write("data", 20 + fmt.length, "ascii");
  header.writeUInt32LE(data.length, 24 + fmt.length);
  return Buffer.concat([header, data]);
}

/** Speaks `text` in `language` ("en", "tw", "ga", "ee", "dag"). Returns a WAV Buffer. */
async function synthesize(text, language = "en") {
  if (!isConfigured()) throw fail("Voice is not set up (KHAYA_API_KEY)", 503);
  const code = TTS_CODES[language];
  if (!code) throw fail(`Voice is not available for language "${language}"`, 400);
  if (!text || !text.trim()) throw fail("There is no text to read aloud", 400);

  const key = `${language}|${crypto.createHash("sha1").update(text).digest("hex")}`;
  if (cache.has(key)) return cache.get(key);

  const chunks = [];
  for (const piece of splitText(text)) chunks.push(await synthesizeChunk(piece, code));
  const audio = mergeWav(chunks);

  cache.set(key, audio);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return audio;
}

module.exports = { isConfigured, synthesize, splitText, mergeWav, TTS_CODES };
