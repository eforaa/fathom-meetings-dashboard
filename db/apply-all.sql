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

-- ---------------------------------------------------------------------------
-- Поиск по индексу вместо чтения расшифровок (см. db/search-index.sql).
--   search_doc — слова всех текстовых полей, GIN-индекс по ней,
--   trigram-индексы для поиска участников по подстроке.
-- ---------------------------------------------------------------------------
alter table meetings
  add column if not exists search_doc tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(ai_title, '') || ' ' ||
      coalesce(custom_title, '') || ' ' ||
      coalesce(fathom_title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(custom_summary, '') || ' ' ||
      coalesce(fathom_summary, '') || ' ' ||
      coalesce(raw_transcript, '')
    )
  ) stored;

create index if not exists meetings_search_doc_idx
  on meetings using gin (search_doc);

create extension if not exists pg_trgm;

create index if not exists participants_name_trgm_idx
  on participants using gin (name gin_trgm_ops);

create index if not exists participants_email_trgm_idx
  on participants using gin (email gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 5. Журнал синхронизаций: по строке на каждый запуск сбора встреч.
--    В fathom_accounts лежит только последний результат, и он перезаписывается;
--    история отвечает на вопрос «сбор молчит второй день или второй месяц».
--    Подробности и рассуждения — в db/sync-log.sql.
-- ---------------------------------------------------------------------------
create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  source text not null check (source in ('cron', 'manual', 'backfill')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  error text,
  fetched integer,
  inserted integer,
  skipped integer,
  people_refreshed integer,
  meetings_total integer
);

create index if not exists sync_runs_email_started_idx
  on sync_runs (user_email, started_at desc);

-- ---------------------------------------------------------------------------
-- 6. Доступ к custom_columns.
--    Единственная таблица, стоявшая без RLS: публичный anon-ключ (он лежит в
--    браузерном бандле) читал и писал её. Политики не нужны — весь законный
--    доступ идёт сервисным ключом с сервера, а он RLS не касается.
-- ---------------------------------------------------------------------------
alter table custom_columns enable row level security;

-- ---------------------------------------------------------------------------
-- 7. Папки встреч: дерево у каждого владельца + членство встреч в папках.
--    Рассуждения целиком — в db/meeting-groups.sql; здесь та же схема, чтобы
--    новая база поднималась одним скриптом.
--
--    Циклы в дереве база не запрещает (на путь ограничение не выражается);
--    сторож стоит в lib/group-tree.js и вызывается и маршрутом, и коннектором.
--    Удаление папки НЕ трогает встречи: каскад уносит только строки членства.
-- ---------------------------------------------------------------------------
create table if not exists meeting_groups (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  parent_id uuid references meeting_groups (id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists meeting_groups_owner_idx
  on meeting_groups (owner_email);
create index if not exists meeting_groups_owner_parent_idx
  on meeting_groups (owner_email, parent_id);

create table if not exists meeting_group_members (
  group_id uuid not null references meeting_groups (id) on delete cascade,
  meeting_id uuid not null references meetings (id) on delete cascade,
  owner_email text not null,
  added_at timestamptz not null default now(),
  primary key (group_id, meeting_id)
);

create index if not exists meeting_group_members_owner_meeting_idx
  on meeting_group_members (owner_email, meeting_id);
create index if not exists meeting_group_members_group_idx
  on meeting_group_members (group_id);

alter table meeting_groups enable row level security;
alter table meeting_group_members enable row level security;

-- ---------------------------------------------------------------------------
-- 8. Поля показа и люди — см. db/display-fields.sql и db/people.sql.
--    Здесь только напоминание: эти два файла применяются отдельно, потому что
--    первый переписывает все строки meetings (вычисляемая колонка), а второй
--    требует последующего заполнения через tools/people-sync.mjs.
-- ---------------------------------------------------------------------------


-- Serialize hierarchy edits per owner and enforce ownership/cycles at the
-- database boundary too. UI and MCP requests may arrive concurrently.
create or replace function public.guard_meeting_group_tree()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  cursor_id uuid;
  cursor_owner text;
  parent_depth int := 0;
  branch_height int := 0;
  visited uuid[] := array[]::uuid[];
begin
  if tg_op = 'DELETE' then
    perform pg_advisory_xact_lock(hashtextextended(old.owner_email, 137));
    return old;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner_email, 137));
  if tg_op = 'UPDATE' and new.owner_email is distinct from old.owner_email then
    raise exception 'Group owner cannot be changed';
  end if;
  if btrim(new.name) = '' or char_length(new.name) > 60 then
    raise exception 'Group name must contain 1 to 60 characters';
  end if;
  cursor_id := new.parent_id;
  while cursor_id is not null loop
    if cursor_id = new.id or cursor_id = any(visited) then
      raise exception 'Group hierarchy cannot contain a cycle';
    end if;
    visited := array_append(visited, cursor_id);
    select owner_email, parent_id into cursor_owner, cursor_id
      from public.meeting_groups where id = cursor_id;
    if not found or cursor_owner is distinct from new.owner_email then
      raise exception 'Parent group not found';
    end if;
    parent_depth := parent_depth + 1;
  end loop;
  with recursive descendants as (
    select id, 0 as depth, array[id] as path from public.meeting_groups where id = new.id
    union all
    select g.id, d.depth + 1, d.path || g.id
      from public.meeting_groups g join descendants d on g.parent_id = d.id
      where not g.id = any(d.path)
  ) select coalesce(max(depth), 0) into branch_height from descendants;
  if parent_depth + branch_height >= 10 then
    raise exception 'Groups cannot nest deeper than 10 levels';
  end if;
  return new;
end;
$$;
drop trigger if exists meeting_groups_tree_guard on public.meeting_groups;
create trigger meeting_groups_tree_guard before insert or update or delete
  on public.meeting_groups for each row execute function public.guard_meeting_group_tree();

create or replace function public.guard_meeting_group_membership()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.meeting_groups where id = new.group_id and owner_email = new.owner_email)
    or not exists(select 1 from public.meetings where id = new.meeting_id and owner_email = new.owner_email) then
    raise exception 'Group and meeting must belong to the same owner';
  end if;
  return new;
end;
$$;
drop trigger if exists meeting_group_members_owner_guard on public.meeting_group_members;
create trigger meeting_group_members_owner_guard before insert or update
  on public.meeting_group_members for each row execute function public.guard_meeting_group_membership();
