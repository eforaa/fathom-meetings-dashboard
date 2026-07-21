import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isAllowed } from './lib/supabase-auth.js';

//making constant that will define accesible pages
const PUBLIC_PATHS = ['/login', '/auth/callback'];

//runs requests for every incoming request that matches the middleware config
export async function middleware(request) {
    //current path
  const { pathname } = request.nextUrl;

  //ignoring cron 
  if (pathname.startsWith('/api/cron')) 
    return NextResponse.next();

  //creating default response 
  let response = NextResponse.next({ request });

  //creaqting supabase server client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    //coockies handling
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  //getting current user 
  const {
    data: { user },
  } = await supabase.auth.getUser();

  //checking if the page is public
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  //checking if the user signed in
  const signedIn = user && isAllowed(user.email);

  //if user info is not valid redirecting to the main page
  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  //if user info is valid - send him to the home page
  if (signedIn && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
//It runs for all application routes 
// except static files 
// (images, fonts, favicon, and Next.js internal assets), since those don't need authentication
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)',
  ],
};