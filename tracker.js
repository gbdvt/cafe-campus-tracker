const { chromium } = require("playwright");
const fs = require("fs");

const EVENT_ID = 537025;
const RATE_ID = 1804168;

const GROUP_URL = "https://lepointdevente.com/billets/cafecampus";

const POLL_MS = 5000; // every 5 seconds

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function timestamp() {
  return new Date().toISOString();
}

(async () => {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  console.log("Opening Café Campus...");
  await page.goto(GROUP_URL, {
    waitUntil: "domcontentloaded"
  });

  // Give the website time to establish its session/cookies
  await sleep(3000);

  let previousSignature = null;

  console.log("Tracking event", EVENT_ID);
  console.log("Polling every", POLL_MS / 1000, "seconds\n");

  while (true) {
    try {
      const data = await page.evaluate(async ({ EVENT_ID }) => {

        const response = await fetch(
          "/plugins/ping/?release=6a9ae508&lang=en",
          {
            method: "POST",

            headers: {
              "accept": "*/*",
              "content-type":
                "application/x-www-form-urlencoded; charset=UTF-8",
              "x-requested-with": "XMLHttpRequest",
              "cache-control": "no-cache",
              "pragma": "no-cache"
            },

            body:
              `page%5Bmodel%5D=event&` +
              `page%5Breference%5D=${EVENT_ID}`,

            credentials: "include"
          }
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        return await response.json();

      }, { EVENT_ID });

      const rate =
        data.rates?.find(r => r.id === RATE_ID) ?? null;

      let state;

      if (!rate) {
        state = {
          status: "EXHAUSTED",
          maxSelectable: 0,
          remaining: 0,
          rateName: null,
          price: null
        };
      } else {
        state = {
          status: "AVAILABLE",

          // IMPORTANT:
          // maxSelectable=2 does NOT necessarily mean
          // exactly 2 tickets remain.
          maxSelectable:
            rate.quantity?.max ?? null,

          remaining:
            rate.remaining ?? null,

          rateName:
            rate.name ?? null,

          price:
            rate.price ?? null
        };
      }

      const queue =
        data.queues?.[EVENT_ID] ??
        data.queues?.[String(EVENT_ID)] ??
        null;

      const observation = {
        timestamp: timestamp(),

        eventId: EVENT_ID,
        rateId: RATE_ID,

        ...state,

        queueUsers:
          queue?.currentUsers ?? null,

        queueState:
          queue?.state ?? null
      };

      // Save EVERY observation
      fs.appendFileSync(
        "observations.jsonl",
        JSON.stringify(observation) + "\n"
      );

      const signature = JSON.stringify({
        status: observation.status,
        maxSelectable: observation.maxSelectable,
        remaining: observation.remaining
      });

      // Only print when something changes
      if (signature !== previousSignature) {

        console.log(
          "\n🚨 CHANGE",
          observation.timestamp
        );

        console.log(
          "Status:",
          observation.status
        );

        console.log(
          "Max selectable:",
          observation.maxSelectable
        );

        console.log(
          "Reported remaining:",
          observation.remaining
        );

        console.log(
          "Queue users:",
          observation.queueUsers
        );

        console.log(
          "Ticket:",
          observation.rateName
        );

        console.log("----------------------");

        fs.appendFileSync(
          "changes.jsonl",
          JSON.stringify(observation) + "\n"
        );

        previousSignature = signature;
      }

    } catch (error) {

      console.error(
        timestamp(),
        "ERROR:",
        error.message
      );

    }

    await sleep(POLL_MS);
  }
})();