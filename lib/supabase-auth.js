import { createBrowserClient, createServerClient } from '@supabase/ssr';

// supabase project settings from environment variables
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// check if user's email is in the allowed list
export function isAllowed(email) {
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  // no emails in the list means nobody can access
  if (!allowed.length) return false;

  return allowed.includes((email ?? '').toLowerCase());
}

// create supabase client for browser usage
export function createClientForBrowser() {
  return createBrowserClient(url, anonKey);
}

// create supabase client for server usage with cookies
export function createClientForServer(cookieStore) {
  return createServerClient(url, anonKey, {
    cookies: {
      // get current auth cookies
      getAll() {
        return cookieStore.getAll();
      },

      // update auth cookies when supabase refreshes the session
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // ignore cookie errors in server components
        }
      },
    },
  });
}
