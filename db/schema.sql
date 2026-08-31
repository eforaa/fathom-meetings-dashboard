-- ============================================================================
-- Fathom Database — база с нуля.
--
-- До этого файла базу нельзя было поднять по репозиторию: миграции описывали
-- около половины колонок, остальные создавались руками, и новый инстанс —
-- тестовый, запасной, восстановление после аварии — был невозможен.
--
-- Список колонок снят с ЖИВОЙ базы 27 августа 2026 через описание, которое
-- PostgREST отдаёт сам: 34 колонки в meetings, 6 в participants, 12 в
-- fathom_accounts, 7 в custom_columns, 12 в sync_runs. То есть это не рассказ
-- о том, как задумано, а то, что есть на самом деле.
--
-- Порядок применения на пустом проекте:
--   1) этот файл — таблицы, ключи, индексы;
--   2) db/apply-all.sql — то, что добавлялось поверх (поиск, RLS, журнал);
--   3) tools/restore.mjs --write — данные из резервной копии.
--
-- Безопасно запускать повторно: всё через "if not exists".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Встречи. Ядро базы.
--
-- Четыре поля с названием и три с конспектом — это долг, а не замысел: они
-- накопились от разных источников (Fathom, разбор, ручная правка), и правило
-- «что показывать» живёт в коде. Здесь они перечислены как есть.
-- ---------------------------------------------------------------------------
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),

  -- кому принадлежит строка. Одна встреча хранится копией на каждого
  -- владельца: у каждого свой ключ Fathom и своя разметка
  owner_email text,

  -- идентификатор записи в Fathom; по нему узнаётся уже загруженная встреча
  recording_id text,
  recording_url text,

  -- названия, от самого весомого к запасному
  custom_title text,   -- вписано человеком, никогда не затирается
  title text,          -- имя из календаря
  ai_title text,       -- сгенерированное
  fathom_title text,   -- строка «о чём встреча» из конспекта Fathom

  -- конспекты
  custom_summary text,
  summary text,
  fathom_summary text,

  -- когда и сколько
  date timestamptz,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer,
  duration_seconds integer,
  fathom_created_at timestamptz,

  -- разметка
  meeting_type text,       -- одиночное значение от старого разбора
  types jsonb,             -- набор типов, что пишет интерфейс
  importance smallint,     -- 0..5
  custom_fields jsonb,     -- значения пользовательских колонок
  notes text,
  notes_updated_at timestamptz,

  -- содержимое
  raw_transcript text,
  transcript_language text,
  key_topics jsonb,
  action_items jsonb,
  fathom_action_items jsonb,

  -- остатки старого ночного разбора. Живыми их не считать: путь через
  -- стороннюю модель уперся в бесплатную квоту и остановился
  analysis_status text,
  analysis_error text,
  analyzed_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- одна запись Fathom на владельца: повторная загрузка обновляет строку,
-- а не плодит копии
create unique index if not exists meetings_owner_recording_idx
  on meetings (owner_email, recording_id);

create index if not exists meetings_owner_date_idx
  on meetings (owner_email, date desc);

-- ---------------------------------------------------------------------------
-- Участники. Строка на человека в каждой встрече.
--
-- identity — вычисляемое поле: почта, а если её нет, имя. По нему участник
-- узнаётся при повторной загрузке. Склейка «один человек под несколькими
-- никами» здесь НЕ хранится, она пока живёт только в коде.
-- ---------------------------------------------------------------------------
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  name text,
  email text,
  email_domain text,
  identity text generated always as (coalesce(email, name)) stored
);

create unique index if not exists participants_meeting_identity_idx
  on participants (meeting_id, identity);

create index if not exists participants_meeting_idx
  on participants (meeting_id);

-- ---------------------------------------------------------------------------
-- Аккаунты Fathom. По строке на человека, подключившего свой ключ.
-- Ключ хранится зашифрованным (lib/secrets.js), мастер-ключ — в переменных
-- окружения, отдельно от данных.
-- ---------------------------------------------------------------------------
create table if not exists fathom_accounts (
  id uuid primary key default gen_random_uuid(),
  user_email text not null unique,
  api_key_encrypted text not null,
  api_key_hint text not null,

  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('ok', 'failed')),
  last_sync_error text,
  meetings_count integer not null default 0,

  -- докачка архива идёт постранично и переживает обрыв
  backfill_cursor text,
  backfill_done boolean,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fathom_accounts_email_idx
  on fathom_accounts (user_email);

-- ---------------------------------------------------------------------------
-- Пользовательские колонки. У каждого владельца свой набор.
-- ---------------------------------------------------------------------------
create table if not exists custom_columns (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  type text not null default 'text',
  options jsonb,
  position int not null default 0,
  created_at timestamptz default now()
);

create index if not exists custom_columns_owner
  on custom_columns (owner_email);

-- ---------------------------------------------------------------------------
-- Журнал синхронизаций. Строка на каждый запуск сбора.
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
-- Доступ. Ни одна из этих таблиц не открыта наружу: приложение ходит
-- служебным ключом, а он RLS не касается. Политик нет намеренно — они
-- означали бы «кому-то можно», а можно только серверу.
-- ---------------------------------------------------------------------------
alter table meetings enable row level security;
alter table participants enable row level security;
alter table fathom_accounts enable row level security;
alter table custom_columns enable row level security;
alter table sync_runs enable row level security;
