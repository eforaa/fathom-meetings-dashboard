import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer, isAllowed } from '@/lib/supabase-auth';

export async function GET(request) {
  // get values from the callback url
  const { searchParams, origin } = new URL(request.url);

  // google sends this code after successful login
  const code = searchParams.get('code');

  // page to return to after login
  const next = searchParams.get('next') ?? '/';

  // without the code we cannot create a session
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // create supabase client with the current user cookies
  const supabase = createClientForServer(await cookies());

  // exchange the google code for a supabase session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  // something went wrong during login
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // being able to log in does not mean the user has access
  if (!isAllowed(data.user?.email)) {
    await supabase.auth.signOut();

    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }

  // login successful, send user to the requested page
  return NextResponse.redirect(`${origin}${next}`);
}
