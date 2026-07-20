import { NextResponse } from 'next/server';
import { runAnalyze } from '@/lib/analyze';

export const dynamic = 'force-dynamic';
//maximum execution time
export const maxDuration = 300;

//3 meeting at once
const BATCH_SIZE = 3;
//maximum analysis time
const TIME_BUDGET_MS = 240_000;

//GET function
export async function GET(request) {
  //security check
  const secret = process.env.CRON_SECRET;

  //checking if password exists and if its valid
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  //calls analyzis function
  try {
    const result = await runAnalyze({
      limit: BATCH_SIZE,
      timeBudgetMs: TIME_BUDGET_MS,
    });
    return NextResponse.json({ ok: true, ...result });
    //error handling converting error to text
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error('analyze failed:', message);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}