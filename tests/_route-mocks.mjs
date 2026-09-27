// Shared, mutable mock state for driving the real app/api route handlers in a
// bare node process. NOT a source edit: these mocks live only in the test
// process and are wired in by tests/_route-loader.mjs, which redirects the
// routes' `next/*` and `@/lib/supabase*` imports here. The REAL guards
// (@/lib/http, @/lib/rate-limit) are left untouched and run for real.
//
// A test sets `mock.user` and `mock.rows`, then inspects `mock.calls` — the
// exact query chain the handler asked the database to build — to prove whether
// a guard ran before the DB was ever touched.

export const mock = {
    // who auth.getUser() reports; null = signed out
    user: { email: 'owner@x.io' },
    // canned rows the fake query builder resolves to
    rows: { single: { custom_fields: {} }, maybeSingle: null, list: [] },
    // per-table overrides of the same three shapes, e.g.
    //   mock.byTable = { meeting_groups: { list: [...], maybeSingle: {...} } }
    // needed once a handler touches more than one table in a single call
    byTable: {},
    // recorded database interactions, in order
    calls: [],
    reset() {
        this.user = { email: 'owner@x.io' };
        this.rows = { single: { custom_fields: {} }, maybeSingle: null, list: [] };
        this.byTable = {};
        this.calls = [];
    },
};

// --- next/server -----------------------------------------------------------
export const NextResponse = {
    json(body, init) {
        return Response.json(body, init);
    },
};

// --- next/headers ----------------------------------------------------------
export async function cookies() {
    return { getAll: () => [], set: () => {}, get: () => undefined };
}

// --- @/lib/supabase-auth ---------------------------------------------------
export function createClientForServer() {
    return {
        auth: {
            async getUser() {
                return { data: { user: mock.user }, error: null };
            },
        },
    };
}
export function createClientForBrowser() {
    return createClientForServer();
}
export function isAllowed(email) {
    return Boolean(mock.user) && email === mock.user.email;
}

// --- @/lib/supabase (the db spy) -------------------------------------------
// A thenable query builder that records every method it is asked to chain, then
// resolves to a canned {data,error}. It records the *terminal* shape so a test
// can assert, e.g., that an owner_email filter was applied before the write.
function builder(table) {
    const record = { table, chain: [] };
    mock.calls.push(record);

    const step = (name) => (...args) => {
        record.chain.push({ name, args });
        return api;
    };

    const resolveWith = (kind) => {
        record.terminal = kind;
        // a test can answer per table instead of once for the whole process:
        // the group code reads meeting_groups, meeting_group_members and
        // meetings inside ONE call, and a single canned list cannot be all three
        const canned = mock.byTable?.[table];
        const pick = (which) =>
            canned && Object.hasOwn(canned, which) ? canned[which] : mock.rows[which];

        const data =
            kind === 'single' ? pick('single')
                : kind === 'maybeSingle' ? pick('maybeSingle')
                    : pick('list');
        return Promise.resolve({ data, error: null, count: Array.isArray(data) ? data.length : null });
    };

    const api = {
        select: step('select'),
        insert: step('insert'),
        update: step('update'),
        delete: step('delete'),
        upsert: step('upsert'),
        eq: step('eq'),
        neq: step('neq'),
        is: step('is'),
        not: step('not'),
        or: step('or'),
        in: step('in'),
        gte: step('gte'),
        lte: step('lte'),
        order: step('order'),
        range: step('range'),
        limit: step('limit'),
        single: () => resolveWith('single'),
        maybeSingle: () => resolveWith('maybeSingle'),
        // a bare `await query` (used after .range/.order) resolves as a list
        then: (onOk, onErr) => resolveWith('list').then(onOk, onErr),
    };
    return api;
}

export const db = {
    from(table) {
        return builder(table);
    },
};

// helper for assertions: did any recorded call filter by owner_email=value?
export function filteredByOwner(value) {
    return mock.calls.some((c) =>
        c.chain.some((s) => s.name === 'eq' && s.args[0] === 'owner_email' && s.args[1] === value));
}
// helper: every recorded call against one table
export function callsTo(table) {
    return mock.calls.filter((c) => c.table === table);
}
// helper: did any call against `table` chain a step named `name`?
export function didStep(table, name) {
    return callsTo(table).some((c) => c.chain.some((s) => s.name === name));
}
// helper: the value passed to an eq('owner_email', ?) in the first call
export function ownerFilterValues() {
    const out = [];
    for (const c of mock.calls)
        for (const s of c.chain)
            if (s.name === 'eq' && s.args[0] === 'owner_email') out.push(s.args[1]);
    return out;
}
