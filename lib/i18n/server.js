import { cookies } from 'next/headers';
import { LANG_COOKIE, normalizeLang } from './index.js';

//the language of the current request, for server components and route handlers.
//kept apart from index.js because next/headers cannot be imported by client
//components — and index.js is imported by plenty of them.
export async function getLang() {
    const stored = (await cookies()).get(LANG_COOKIE)?.value;
    return normalizeLang(stored);
}
