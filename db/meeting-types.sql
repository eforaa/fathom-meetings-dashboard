-- user-set meeting types, up to four per meeting
-- meeting_type stays as the single value written by the analysis;
-- types wins on screen once a person edits it by hand
alter table meetings add column if not exists types jsonb;
