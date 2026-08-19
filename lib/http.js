//Guards for the API routes: read a request body without trusting it, and say
//no in one voice.
//
//Every route used to do its own `await request.json().catch(() => ({}))` and
//then pick fields out by hand. That let two things through: a malformed body
//turned into a 500 instead of a 400 (app/api/account), and nothing anywhere
//looked at the size — a fifty-megabyte body was parsed into memory before the
//first field was read.
//
//Plain web Response, no next import, so this file can be tested with node
//alone. Route handlers may return a standard Response.

//64 KB is far above anything the interface sends: the longest field is a
//summary capped at 5000 characters.
export const MAX_BODY_BYTES = 64 * 1024;

export function fail(message, status = 400) {
    return Response.json({ error: message }, { status });
}

//The parsed body, or a Response to hand straight back.
//
//  const body = await readJson(request);
//  if (body instanceof Response) return body;
export async function readJson(request, { maxBytes = MAX_BODY_BYTES } = {}) {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > maxBytes) return fail('Body is too large', 413);

    let text;
    try {
        text = await request.text();
    } catch {
        return fail('Could not read the body');
    }

    //content-length can lie or be missing (chunked), so measure what arrived
    if (text.length > maxBytes) return fail('Body is too large', 413);
    if (!text.trim()) return {};

    try {
        const value = JSON.parse(text);
        //a body of `null`, `7` or `[1,2]` is not something any route here
        //expects, and picking fields off it silently yields undefined
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            return fail('Body must be a JSON object');
        }
        return value;
    } catch {
        return fail('Body is not valid JSON');
    }
}

//Postgres rejects a malformed uuid with an error of its own, which surfaces as
//a 500. The id comes from the URL, so a typo is the caller's mistake: 400.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => UUID.test(String(value ?? ''));

//--- field readers ---------------------------------------------------------
//Each returns a usable value, never undefined, so a route can write straight
//into the database with what comes back.

export function text(value, { max = 200, fallback = '' } = {}) {
    if (typeof value !== 'string') return fallback;
    return value.trim().slice(0, max);
}

export function int(value, { min = 0, max = 100, fallback = 0 } = {}) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

export function oneOf(value, allowed, fallback = null) {
    return allowed.includes(value) ? value : fallback;
}

//a list of allowed values: unknown entries dropped, duplicates collapsed,
//length capped
export function listOf(value, allowed, { max = 10 } = {}) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item) => allowed.includes(item)))].slice(0, max);
}
