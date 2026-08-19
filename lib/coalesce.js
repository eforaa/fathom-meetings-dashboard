//Many calls in a burst, one call after the burst.
//
//Rating five meetings in a row asked the server for the whole list five
//times. What the list actually needs is to be right once the person stops,
//so the calls collapse into the last one.
//
//Kept out of the component (app/refresh.js) because it is a plain timer with
//no React in it, and a rule like this should be exercisable without a browser.
export function coalesce(run, quietMs = 1200) {
    let timer = null;

    return {
        //ask for a run; anything already waiting is pushed back
        call() {
            clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                run();
            }, quietMs);
        },

        //nothing owed any more — used when the component goes away, so a
        //refresh cannot fire against a tree that is no longer there
        cancel() {
            clearTimeout(timer);
            timer = null;
        },

        //for tests, and for anyone wondering whether a run is still owed
        get waiting() {
            return timer !== null;
        },
    };
}
