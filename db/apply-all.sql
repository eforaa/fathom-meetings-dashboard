-- ============================================================================
-- Fathom Meetings Explorer — все миграции одним скриптом.
-- Вставь целиком в Supabase → SQL Editor → Run.
-- Безопасно запускать повторно: всё через "if not exists" / "or replace" /
-- "drop ... if exists". Предполагается, что базовые таблицы meetings и
-- participants уже существуют.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Владелец встречи (owner_email) + уникальность и индексы.
--    Одна встреча хранится строкой на каждого владельца.
-- ---------------------------------------------------------------------------
alter table meetings
  add column if not exists owner_email text;

-- backfill: строки без владельца уходят Даниилу (только там, где null)
update meetings
  set owner_email = 'd.soloviov@aivocado.ai'
  where owner_email is null;

alter table meetings
  alter column owner_email set not null;

-- старое ограничение на один recording_id больше не годится
alter table meetings
  drop constraint if exists meetings_recording_id_key;

-- пересоздаём уникальность (owner_email, recording_id) идемпотентно
alter table meetings
  drop constraint if exists meetings_owner_recording_key;
alter table meetings
  add constraint meetings_owner_recording_key
  unique (owner_email, recording_id);

create index if not exists meetings_owner_date_idx
  on meetings (owner_email, date desc);

create index if not exists participants_meeting_idx
  on participants (meeting_id);

-- ---------------------------------------------------------------------------
-- 2. Дополнительные колонки на meetings (редактируемые + данные Fathom).
-- ---------------------------------------------------------------------------
-- название и саммари, заданные руками или Claude (главнее машинных)
alter table meetings add column if not exists custom_title text;
alter table meetings add column if not exists custom_summary text;

-- готовые данные Fathom, взятые бесплатно при загрузке
alter table meetings add column if not exists fathom_summary text;
alter table meetings add column if not exists fathom_action_items jsonb;
alter table meetings add column if not exists transcript_language text;
alter table meetings add column if not exists fathom_title text;

-- важность 0..5 звёзд (0 = без оценки)
alter table meetings add column if not exists importance smallint not null default 0;

-- заметки Claude через MCP-коннектор
alter table meetings add column if not exists notes text;
alter table meetings add column if not exists notes_updated_at timestamptz;

-- типы встречи, до 4 на встречу
alter table meetings add column if not exists types jsonb;

-- значения пользовательских колонок: один json по id колонки
alter table meetings add column if not exists custom_fields jsonb;

-- ---------------------------------------------------------------------------
-- 3. Пользовательские колонки (свой набор у каждого владельца).
-- ---------------------------------------------------------------------------
create table if not exists custom_columns (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  type text not null default 'text',   -- text | number | select | checkbox
  options jsonb,                        -- список вариантов для select
  position int not null default 0,
  created_at timestamptz default now()
);

create index if not exists custom_columns_owner on custom_columns (owner_email);

-- ---------------------------------------------------------------------------
-- 4. Fathom-аккаунты (по одному на человека; ключ хранится зашифрованным).
-- ---------------------------------------------------------------------------
create table if not exists fathom_accounts (
  id uuid primary key default gen_random_uuid(),
  user_email text not null unique,
  api_key_encrypted text not null,       -- iv:tag:ciphertext из lib/secrets.js
  api_key_hint text not null,            -- последние 4 символа для интерфейса
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('ok', 'failed')),
  last_sync_error text,
  meetings_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fathom_accounts_email_idx
  on fathom_accounts (user_email);

-- курсор докачки полного архива (по аккаунту)
alter table fathom_accounts add column if not exists backfill_cursor text;
alter table fathom_accounts add column if not exists backfill_done boolean default false;

-- updated_at обновляется при каждом изменении строки
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

-- ---------------------------------------------------------------------------
-- analysis_status: «в очереди» больше не существует (см. db/analysis-status.sql).
--   NULL — разбор не запрашивали, 'done' — сохранён, 'failed' — не вышло.
-- ---------------------------------------------------------------------------
alter table meetings
  alter column analysis_status drop default;

update meetings
   set analysis_status = null
 where analysis_status = 'pending';
