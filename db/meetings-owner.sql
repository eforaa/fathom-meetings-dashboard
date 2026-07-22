-- Per-owner storage of meetings.
-- Version 1 keeps a separate row for every person who has the meeting
-- in their Fathom. A call between two people becomes two rows.

alter table meetings
  add column if not exists owner_email text;

update meetings
  set owner_email = 'd.soloviov@aivocado.ai'
  where owner_email is null;

alter table meetings
  alter column owner_email set not null;

-- recording_id alone can no longer be unique: the same call legitimately
-- arrives once per owner
alter table meetings
  drop constraint if exists meetings_recording_id_key;

alter table meetings
  add constraint meetings_owner_recording_key
  unique (owner_email, recording_id);

create index if not exists meetings_owner_date_idx
  on meetings (owner_email, date desc);

create index if not exists participants_meeting_idx
  on participants (meeting_id);