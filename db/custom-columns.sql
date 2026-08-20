-- user-defined columns, each owner has their own set
-- a person adds "Status", "Deal size", "Client" and so on by hand
create table if not exists custom_columns (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  -- text | number | select | checkbox
  type text not null default 'text',
  -- for a select column: the list of allowed values
  options jsonb,
  position int not null default 0,
  created_at timestamptz default now()
);

create index if not exists custom_columns_owner on custom_columns (owner_email);

-- values live on the meeting, one json object keyed by column id
-- a deleted column simply leaves an ignored key behind, nothing breaks
alter table meetings add column if not exists custom_fields jsonb;

-- ---------------------------------------------------------------------------
-- Доступ. Эта таблица единственная стояла без RLS, и это была настоящая дыра:
-- публичный anon-ключ лежит в браузерном бандле, а PostgREST отдаёт по нему
-- всё, что не закрыто. Проверено запросом с этим ключом: SELECT возвращал
-- чужие колонки вместе с owner_email, INSERT создавал строку.
--
-- Политик нет и не нужно: весь законный доступ идёт сервисным ключом с
-- сервера (lib/columns.js), а сервисный ключ RLS не касается. Остальные
-- таблицы — meetings, participants, fathom_accounts, sync_runs — устроены
-- так же: RLS включён, политик нет, anon получает пустоту.
--
-- Строка живёт здесь, а не только в консоли Supabase, иначе следующая база,
-- поднятая по этим файлам, повторит ту же дыру.
-- ---------------------------------------------------------------------------
alter table custom_columns enable row level security;
