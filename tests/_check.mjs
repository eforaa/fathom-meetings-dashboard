// The whole test harness. No framework: these are pure functions, and a
// dependency that has to be installed is a dependency that stops being run.
//
// A test file imports check(), calls it, and ends with done(). tests/run.mjs
// runs every file and adds the results up.

let failed = 0;
let passed = 0;

export function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) passed += 1;
    else failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
    if (!ok) {
        console.log(`        got  ${JSON.stringify(got)}`);
        console.log(`        want ${JSON.stringify(want)}`);
    }
}

//for a claim that is true or false on its own
export const isTrue = (label, got) => check(label, got === true, true);

export function done() {
    console.log(failed ? `\n${failed} of ${passed + failed} failed` : `\nall ${passed} passed`);
    process.exit(failed ? 1 : 0);
}
