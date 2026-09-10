const fs = require("fs");
const path = require("path");

const EVENT_ID = 537025;
const EVENT_NAME = "Les Jeudis 2000 du Café Campus — Sept 10, 2026";
const POLL_MS = 5000;
const RATES_URL = `https://lepointdevente.com/plugins/rates/${EVENT_ID}`;
const EVENT_URL = "https://lepointdevente.com/billets/cafecampus";

const pollsFile = path.join(__dirname, "polls.csv");
const changesFile = path.join(__dirname, "changes.csv");

const HEADERS = [
  "timestamp",
  "event_id",
  "status",
  "tag",
  "rate_name",
  "remaining",
  "qty_min",
  "qty_max",
  "price",
  "queue_users",
  "message",
];

function csvEscape(value) {
  if (value == null || value === "") return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function ensureCsv(file) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, HEADERS.join(",") + "\n", "utf8");
  }
}

function toRow(record) {
  return HEADERS.map((key) => csvEscape(record[key])).join(",") + "\n";
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSoldOut(data, rate) {
  const tag = `${data.tag || ""} ${rate.tag || ""}`;
  if (/complet|sold\s*out/i.test(tag)) return true;
  if (rate.quantity && Number(rate.quantity.max) === 0) return true;
  return false;
}

function fingerprint(record) {
  return [
    record.status,
    record.tag,
    record.rate_name,
    record.remaining,
    record.qty_min,
    record.qty_max,
    record.price,
  ].join("|");
}

let lastFingerprint = null;

async function check() {
  const timestamp = new Date().toISOString();
  try {
    const response = await fetch(RATES_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 cafe-campus-tracker",
        Referer: EVENT_URL,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rate = (data.rates && data.rates[0]) || {};
    const soldOut = isSoldOut(data, rate);
    const record = {
      timestamp,
      event_id: EVENT_ID,
      status: soldOut ? "SOLD_OUT" : "AVAILABLE",
      tag: data.tag || rate.tag || "",
      rate_name: rate.name || "",
      remaining: rate.remaining == null ? "" : rate.remaining,
      qty_min: rate.quantity ? rate.quantity.min : "",
      qty_max: rate.quantity ? rate.quantity.max : "",
      price: rate.price == null ? "" : rate.price,
      queue_users:
        data.queues && data.queues[EVENT_ID]
          ? data.queues[EVENT_ID].currentUsers
          : "",
      message: stripHtml(data.message),
    };

    ensureCsv(pollsFile);
    fs.appendFileSync(pollsFile, toRow(record), "utf8");

    const current = fingerprint(record);
    if (lastFingerprint === null) {
      ensureCsv(changesFile);
      fs.appendFileSync(changesFile, toRow(record), "utf8");
      console.log(
        `${timestamp} start  ${record.status}  tag=${record.tag || "none"}  remaining=${record.remaining || "n/a"}  qty_max=${record.qty_max}`
      );
    } else if (current !== lastFingerprint) {
      ensureCsv(changesFile);
      fs.appendFileSync(changesFile, toRow(record), "utf8");
      console.log("");
      console.log(`*** CHANGE ${timestamp} -> ${record.status} ***`);
      console.log(
        `    ${record.rate_name}  tag=${record.tag || "none"}  remaining=${record.remaining || "n/a"}  can_buy=${record.qty_min}-${record.qty_max}  $${record.price || "?"}`
      );
      if (!soldOut) {
        console.log(`    TICKETS AVAILABLE  ${EVENT_URL}`);
        process.stdout.write("\x07");
      }
    } else {
      const now = new Date().toLocaleTimeString();
      process.stdout.write(
        `\r${now}  ${record.status}  remaining=${record.remaining || "n/a"}  qty_max=${record.qty_max}     `
      );
    }
    lastFingerprint = current;
  } catch (error) {
    console.error(`\n${timestamp} ERROR ${error.message}`);
  }
}

ensureCsv(pollsFile);
ensureCsv(changesFile);
console.log(`Tracking ${EVENT_NAME}`);
console.log(`Event ${EVENT_ID} every ${POLL_MS / 1000}s`);
console.log(`Polls:    ${pollsFile}`);
console.log(`Changes:  ${changesFile}`);
console.log(`Buy page: ${EVENT_URL}`);
console.log("Keep this window open. Ctrl+C to stop.\n");
check();
setInterval(check, POLL_MS);
