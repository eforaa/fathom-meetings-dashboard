-- fathom's own ai summary and action items, taken for free at ingest
-- kept apart from our ai fields so the two never overwrite each other
alter table meetings add column if not exists fathom_summary text;
alter table meetings add column if not exists fathom_action_items jsonb;
alter table meetings add column if not exists transcript_language text;
