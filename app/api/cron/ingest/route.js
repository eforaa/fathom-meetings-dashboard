import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest';
import { rateLimit, GUESSING } from '@/lib/rate-limit';

//always executing the route 
export const dynamic = 'force-dynamic';
//route run for 60 seconds
export const maxDuration = 60;

export async function GET(request) {
  //Порядок здесь важен, и раньше он был обратным.
  //
  //Счётчик попыток стоял ПЕРЕД проверкой секрета, а ключ счётчика берётся из
  //заголовка x-forwarded-for, который подделывается тривиально. Значит, чужой
  //мог исчерпать лимит и не пустить настоящий ночной сбор — не зная секрета
  //вовсе.
  //
  //Теперь сначала секрет. Правильный запрос проходит всегда, а считаются
  //только неудачные попытки — ровно то, ради чего счётчик и заводился: секрет
  //подбирается по одной попытке за раз.
  const secret = process.env.CRON_SECRET;

  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    const tooMany = rateLimit(request, { bucket: 'cron', identity: null, ...GUESSING });
    if (tooMany) return tooMany;

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