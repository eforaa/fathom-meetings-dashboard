
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClientForServer, isAllowed } from '@/lib/supabase-auth';

//HAndling OAuth callback after used signed in
export async function GET(request) {
    //get url params
  const { searchParams, origin } = new URL(request.url);
  //authorisation code returned by Google after successful login
  const code = searchParams.get('code');
  //redirecting to the home pag if no page is provided 
  const next = searchParams.get('next') ?? '/';

  //if no authorisation code, login will not continue
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }
//creating supabase server client
  const supabase = createClientForServer(await cookies());
  // exchange the temporary OAuth code for a permanent user session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  //error handling
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  //checking if users email valid 
  if (!isAllowed(data.user?.email)) {
    //removing session if user not authorized
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }

  //if authenticsation successful - user getting to the home page
  return NextResponse.redirect(`${origin}${next}`);
}