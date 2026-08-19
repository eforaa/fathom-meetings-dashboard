'use client';

import { useEffect, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { coalesce } from '@/lib/coalesce';

//Asking the server for the list again — once the person stops fiddling.
//
//Every row control used to call router.refresh() the moment its request came
//back. That re-runs the whole page on the server: all the meetings, all the
//participants, the identity resolution and the sorting. Measured against the
//live database, that is 879 ms for 222 meetings and 553 ms for 383 — for a
//click that changed one cell. Rating five meetings in a row paid it five
//times, and each answer landed while the person was already clicking the next
//star.
//
//The controls already show the new value from their own state, so nothing on
//screen is waiting for that round trip. What it is actually for is the numbers
//derived from the whole list: the summary in the sidebar, the group counts,
//the "needs a name" badge. Those can be a moment behind.
//
//So: keep the instant local update, and let one refresh follow the last edit
//instead of one following each. Inside a transition, so React keeps the page
//interactive while it runs rather than freezing the row under the cursor.
export function useDeferredRefresh() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const timer = useMemo(
        () => coalesce(() => startTransition(() => router.refresh())),
        [router],
    );

    //a refresh still owed when the component goes away would fire against a
    //tree that is no longer mounted
    useEffect(() => () => timer.cancel(), [timer]);

    return [timer.call, pending];
}
