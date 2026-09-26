// A small, dependency-free CSV reader and writer.
// Handles quoted fields, commas inside quotes, escaped quotes (""), and
// both \n and \r\n line endings. Good enough for spreadsheet exports;
// not a full RFC 4180 implementation.

/** Parses CSV text into an array of row objects, keyed by the header row. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  // Strip a UTF-8 BOM, which Excel adds when it saves CSV files.
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // Skip; the following \n (if any) ends the row.
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  const raw = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (raw.length === 0) return { headers: [], records: [] };
  const headers = raw[0].map((h) => h.trim());
  const records = raw.slice(1).map((cells) => {
    const record = {};
    headers.forEach((h, i) => { record[h] = (cells[i] ?? "").trim(); });
    return record;
  });
  return { headers, records };
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds CSV text from an array of header strings and an array of row arrays. */
function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((r) => r.map(csvEscape).join(","));
  return lines.join("\r\n") + "\r\n";
}

module.exports = { parseCsv, toCsv };
