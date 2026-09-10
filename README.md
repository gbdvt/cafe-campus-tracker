## cafe campus ticket tracker
node script that checks a café campus event every 5 seconds and logs when ticket availability changes.

polls the event's internal rates endpoint directly and classifies it as:
- AVAILABLE
- SOLD_OUT
- IN_QUEUE
- NO_RATES

it saves every check in polls.csv and only actual changes in changes.csv.

### usage

make sure you have node installed, then run:

node tracker.js

to track another event, change:

const EVENT_ID = 537025;
const EVENT_NAME = "...";

also keeps a .session file so the site doesn't treat every request as a completely new visitor.
