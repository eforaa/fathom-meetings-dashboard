//A cap on how often one caller may hit a route.
//
//Nothing stopped a loop from calling /api/meetings/<id>/title a thousand times
//a second. Every one of those is a write to the database and, for sync, a call
//to Fathom's API on our key.
//
//WHAT THIS IS NOT: a global limit. The counters live in the memory of one
//serverless instance, and Vercel runs several, so a caller spread across
//instances gets the limit times the number of instances. It stops a runaway
//script and a bored person with curl; it is not a defence against a
//distributed flood. A real limit needs shared storage (Postgres or Redis) and
//a round trip on every request — worth doing when there is a reason, not
//before.

const buckets = new Map();

//a fixed window: the first hit starts the clock, the counter resets when it
//runs out. Simpler than a sliding window and honest enough at this size.
export function hit(key, { max, windowMs }, now = Date.now()) {
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, remaining: max - 1, retryAfter: 0 };
    }

    bucket.count += 1;
    if (bucket.count > max) {
        return {
            ok: false,
            remaining: 0,
            retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        };
    }

    return { ok: true, remaining: max - bucket.count, retryAfter: 0 };
}

//expired windows would otherwise pile up for every caller ever seen
function sweep(now = Date.now()) {
    for (const [key, bucket] of buckets) {
        if (now >= bucket.resetAt) buckets.delete(key);
    }
}

//who is calling: the signed-in person if we know them, otherwise the address
//the request came from. Behind Vercel the real client is first in the list.
export function callerKey(request, identity) {
    if (identity) return `user:${identity}`;
    const forwarded = request.headers.get('x-forwarded-for') ?? '';
    const ip = forwarded.split(',')[0].trim() || 'unknown';
    return `ip:${ip}`;
}

//The 429 to return, or null to carry on.
//
//  const tooMany = rateLimit(request, { bucket: 'title', identity: user.email, ...WRITE });
//  if (tooMany) return tooMany;
export function rateLimit(request, { bucket, identity, max, windowMs }) {
    if (buckets.size > 5000) sweep();

    const result = hit(`${bucket}:${callerKey(request, identity)}`, { max, windowMs });
    if (result.ok) return null;

    return Response.json(
        { error: 'Too many requests, slow down' },
        { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
    );
}

//--- the shapes used across the routes -------------------------------------

//ordinary edits from the interface: a person clicking quickly is nowhere near
//this, a script is
export const WRITE = { max: 60, windowMs: 60_000 };

//touching the Fathom key, and deleting things
export const SENSITIVE = { max: 10, windowMs: 60_000 };

//pulls the whole archive over someone else's API on our key
export const EXPENSIVE = { max: 5, windowMs: 10 * 60_000 };

//Claude through the connector: chattier than a person, still bounded
export const CONNECTOR = { max: 120, windowMs: 60_000 };

//guessing a secret should not be free
export const GUESSING = { max: 20, windowMs: 60_000 };

//tests reach for this; nothing else should
export function _reset() {
    buckets.clear();
}
