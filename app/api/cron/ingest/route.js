import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest';

//always executing the route 
export const dynamic = 'force-dynamic';
//route run for 60 seconds
export const maxDuration = 60;

export async function GET(request) {
  //getting the password 
  const secret = process.env.CRON_SECRET;

  //checking whether the request contains the correct header
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    //run ingestion
    const result = await runIngest();
    //success reponse 
    return NextResponse.json({ ok: true, ...result });
  } catch (caught) {
    //converting message into readble message
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error('ingest failed:', message);

    return NextResponse.json({
      ok: false,
      error: message
    },
      {
        status: 500
      });
  }
}