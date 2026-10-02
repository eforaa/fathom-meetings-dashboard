-- ============================================================================
-- Папки встреч: своё дерево у каждого владельца.
--
-- Колонки и типы отвечают на вопрос «какая эта встреча». Папки отвечают на
-- другой: «к чему она относится» — проект, клиент, направление. Это не одно и
-- то же, и колонкой это не выражается: у проекта бывают подпроекты, а у
-- клиента — направления внутри, то есть нужна вложенность, а не список
-- значений.
--
-- Группировка строк таблицы по полям (?group=type) никуда не девается: она
-- раскладывает то, что УЖЕ есть во встрече. Папки — это то, что человек
-- раскладывает руками, и оно должно пережить перезагрузку страницы.
--
-- Безопасно запускать повторно.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Сами папки.
--
-- parent_id ссылается на ту же таблицу — отсюда дерево. Циклы («A внутри B,
-- B внутри A») база сама не запрещает: ограничение целостности на путь в
-- Postgres не выражается без триггера. Сторож стоит в приложении
-- (lib/group-tree.js → wouldCycle, проверяется и на маршруте, и в коннекторе),
-- а lib/group-tree.js вдобавок умеет читать дерево, в котором цикл уже есть:
-- испорченные данные не должны вешать страницу.
--
-- on delete set null, а не cascade: удаление папки не должно уносить с собой
-- ветку. Приложение перед удалением само поднимает детей к родителю удаляемой
-- папки (lib/groups.js → deleteGroup), а эта строчка — страховка на случай,
-- если строку удалили мимо приложения: подпапки всплывут в корень, но
-- останутся.
-- ---------------------------------------------------------------------------
create table if not exists meeting_groups (
  id uuid primary key default gen_random_uuid(),

  -- чья папка. Тот же ключ владения, что у meetings и custom_columns
  owner_email text not null,

  name text not null,

  -- null — папка верхнего уровня
  parent_id uuid references meeting_groups (id) on delete set null,

  -- порядок среди соседей; при равенстве сортировка идёт по имени
  position int not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists meeting_groups_owner_idx
  on meeting_groups (owner_email);

-- боковая панель читает всё дерево владельца разом и строит его в памяти,
-- поэтому индекс нужен именно по паре: «мои папки, разложенные по родителям»
create index if not exists meeting_groups_owner_parent_idx
  on meeting_groups (owner_email, parent_id);

-- ---------------------------------------------------------------------------
-- 2. Что в какой папке лежит.
--
-- Отдельная таблица, а не колонка group_id на встрече, — потому что встреча
-- может относиться сразу к нескольким вещам: один и тот же созвон бывает и
-- «Клиент Acme», и «Найм». Колонка заставила бы выбирать одно из двух, а
-- выбирать здесь нечего: верно и то, и другое.
--
-- owner_email дублируется из встречи намеренно. Без него любая проверка
-- «моя ли это запись» — это join к meetings, а с ним отбор членства делается
-- одним запросом по индексу. Рассинхронизации не бывает: строка пишется
-- только после того, как приложение убедилось, что и папка, и встреча
-- принадлежат этому владельцу.
--
-- Первичный ключ из пары: повторное добавление той же встречи в ту же папку —
-- это не ошибка и не дубль, а «уже там» (upsert on conflict do nothing).
--
-- on delete cascade с ОБЕИХ сторон касается только строк ЭТОЙ таблицы:
-- удалили папку — исчезла запись о членстве, сама встреча остаётся целой.
-- Ровно это и требуется: папка — способ смотреть на встречи, а не хранилище.
-- ---------------------------------------------------------------------------
create table if not exists meeting_group_members (
  group_id uuid not null references meeting_groups (id) on delete cascade,
  meeting_id uuid not null references meetings (id) on delete cascade,
  owner_email text not null,
  added_at timestamptz not null default now(),

  primary key (group_id, meeting_id)
);

-- «в каких папках лежит эта встреча» — вопрос строки таблицы
create index if not exists meeting_group_members_owner_meeting_idx
  on meeting_group_members (owner_email, meeting_id);

-- «что лежит в этой папке» — вопрос боковой панели и фильтра
create index if not exists meeting_group_members_group_idx
  on meeting_group_members (group_id);

-- ---------------------------------------------------------------------------
-- 3. Доступ.
--
-- Тот же порядок, что у custom_columns: RLS включён, политик нет. Публичный
-- anon-ключ лежит в браузерном бандле, и всё, что не закрыто, PostgREST по
-- нему отдаёт. Весь законный доступ идёт сервисным ключом с сервера
-- (lib/groups.js), а сервисный ключ RLS не касается.
-- ---------------------------------------------------------------------------
alter table meeting_groups enable row level security;
alter table meeting_group_members enable row level security;


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
