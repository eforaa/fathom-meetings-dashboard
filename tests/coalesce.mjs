// A burst of edits must cost one trip to the server, not one each.
//
// The numbers behind this: asking the list again costs 879 ms of database work
// for 222 meetings. Rating five meetings in a row used to pay that five times.
import { coalesce } from '../lib/coalesce.js';
import { check, done } from './_check.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let runs = 0;
const timer = coalesce(() => { runs += 1; }, 20);

// --- a burst collapses ------------------------------------------------------
for (let i = 0; i < 5; i += 1) timer.call();
check('nothing has run while the burst is still going', runs, 0);
check('but a run is owed', timer.waiting, true);

await wait(50);
check('five clicks cost one trip to the server', runs, 1);
check('and nothing is owed afterwards', timer.waiting, false);

// --- a later burst is its own ----------------------------------------------
timer.call();
await wait(50);
check('a separate burst later runs again', runs, 2);

// --- each call pushes the wait back -----------------------------------------
runs = 0;
timer.call();
await wait(12);
timer.call();          // before the first would have fired
await wait(12);
check('a call inside the quiet window postpones the run', runs, 0);
await wait(20);
check('and it runs once the clicking really stops', runs, 1);

// --- leaving the page --------------------------------------------------------
runs = 0;
timer.call();
timer.cancel();
await wait(40);
check('a cancelled run never fires — the component may be gone by then', runs, 0);
check('and nothing stays owed', timer.waiting, false);

done();
