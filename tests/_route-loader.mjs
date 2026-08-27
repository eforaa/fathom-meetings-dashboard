// An ESM loader (node --loader / module.register) that lets a bare node test
// import the REAL app/api route handlers. It rewrites only the specifiers a
// route cannot resolve outside Next, and the DB/auth boundary, to the shared
// mocks in _route-mocks.mjs. Everything else — including the real guards
// @/lib/http and @/lib/rate-limit — resolves normally.
//
// This is test-process-local wiring, not a source edit: no file under app/ or
// lib/ is changed; the routes run exactly as written.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as pathResolve, basename, extname } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = pathResolve(here, '..');
const mocksUrl = pathToFileURL(pathResolve(here, '_route-mocks.mjs')).href;

// specifier -> which named exports the virtual shim should re-export from mocks
const SHIMS = {
    'next/server': ['NextResponse'],
    'next/headers': ['cookies'],
    '@/lib/supabase-auth': ['createClientForServer', 'createClientForBrowser', 'isAllowed'],
    '@/lib/supabase': ['db'],
};

export async function resolve(specifier, context, nextResolve) {
    if (SHIMS[specifier]) {
        return { url: `mock:${specifier}`, shortCircuit: true };
    }
    // rewrite the @/ alias for everything else to the real project files.
    // Next resolves extensionless aliases (@/lib/http) to .js; mirror that.
    if (specifier.startsWith('@/')) {
        let p = pathResolve(projectRoot, specifier.slice(2));
        if (!extname(basename(p)) && existsSync(`${p}.js`)) p += '.js';
        return resolve(pathToFileURL(p).href, context, nextResolve);
    }
    const resolved = await nextResolve(specifier, context);
    // lib modules import the db via a RELATIVE './supabase.js' — catch that too
    // so a route that goes through lib/columns.js still hits the mock db, never
    // the real client (which would open a socket on await).
    if (resolved.url.endsWith('/lib/supabase.js')) {
        return { url: 'mock:@/lib/supabase', shortCircuit: true };
    }
    return resolved;
}

export async function load(url, context, nextLoad) {
    if (url.startsWith('mock:')) {
        const specifier = url.slice('mock:'.length);
        const names = SHIMS[specifier];
        const source = `export { ${names.join(', ')} } from ${JSON.stringify(mocksUrl)};`;
        return { format: 'module', shortCircuit: true, source };
    }
    return nextLoad(url, context);
}
