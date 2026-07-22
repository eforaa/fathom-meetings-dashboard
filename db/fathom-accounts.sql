-- Fathom accounts: one row per person who connected their own key.
-- The key itself is never stored in plain text.

create table if not exists fathom_accounts (
  id uuid primary key default gen_random_uuid(),

  -- comes from Supabase Auth
  user_email text not null unique,

  -- encrypted payload from lib/secrets.js, format: iv:tag:ciphertext
  api_key_encrypted text not null,

  -- last four characters, so the interface can show them without decrypting
  api_key_hint text not null,

  -- where the previous sync stopped for this account
  last_synced_at timestamptz,

  -- result of the last ingest run, shown on the settings page
  last_sync_status text check (last_sync_status in ('ok', 'failed')),
  last_sync_error text,
  meetings_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fathom_accounts_email_idx
  on fathom_accounts (user_email);

-- touch updated_at on every change
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fathom_accounts_touch on fathom_accounts;

create trigger fathom_accounts_touch
  before update on fathom_accounts
  for each row
  execute function touch_updated_at();