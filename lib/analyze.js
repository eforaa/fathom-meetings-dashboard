import { db } from './supabase.js';
import { analyzeTranscript } from './ai.js';

//creating a delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runAnalyze({
  //3 meetings at time
  limit = 3,
  //maximum running time
  timeBudgetMs = 50_000,
  //2 second between meetings
  delayMs = 2000,
  //sortings control
  oldestFirst = false,
  onProgress,
} = {}) {
  //points at function start
  const startedAt = Date.now();
  //getting meetings from the database
  const { data: queue, error } = await db
    .from('meetings')
    .select('id, recording_id, title, ai_title, raw_transcript')
    .eq('analysis_status', 'pending')
    .not('raw_transcript', 'is', null)
    .neq('raw_transcript', '')
    .order('date', { ascending: oldestFirst })
    .limit(limit);

    //error handling
  if (error) throw new Error(`Cannot read the queue: ${error.message}`);

  let processed = 0;
  let failed = 0;

  for (const meeting of queue ?? []) {
    //checking time limit 
    // if limit reached - stop
    if (Date.now() - startedAt > timeBudgetMs) break;

    //getting participants
    try {
      const { data: participants } = await db
        .from('participants')
        .select('name, email')
        .eq('meeting_id', meeting.id);

        //sending transcript, maatings and participants to AI 
      const analysis = await analyzeTranscript(meeting.raw_transcript, {
        title: meeting.title,
        participants: participants ?? [],
      });

      const { error: updateError } = await db
        .from('meetings')
        .update({
          //keep a name already set by the series matcher; only generate one
          //when the meeting still has no ai name of its own
          ai_title: meeting.ai_title || analysis.title || null,
          summary: analysis.summary,
          key_topics: analysis.key_topics,
          meeting_type: analysis.meeting_type,
          action_items: analysis.action_items,
          analysis_status: 'done',
          analysis_error: null,
          analyzed_at: new Date().toISOString(),
        })
        .eq('id', meeting.id);

      if (updateError) throw new Error(updateError.message);

      //success count
      processed += 1;
      onProgress?.({ ok: true, title: meeting.title, type: analysis.meeting_type });
    } catch (caught) {
      failed += 1;
      const message = caught instanceof Error ? caught.message : String(caught);
      console.error(`analyze: ${meeting.recording_id} — ${message}`);

      // everything back into the queue once the daily quota resets.
      await db
        .from('meetings')
        .update({
          analysis_status: 'failed',
          analysis_error: message.slice(0, 500),
        })
        .eq('id', meeting.id);

      onProgress?.({ ok: false, title: meeting.title, error: message });
    }

    //wait before next meeting
    if (delayMs) await sleep(delayMs);
  }

  //remain meetings count
  const { count: remaining } = await db
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .eq('analysis_status', 'pending');

    //returning result
  return {
    processed,
    failed,
    remaining: remaining ?? 0,
    seconds: Math.round((Date.now() - startedAt) / 1000),
  };
}