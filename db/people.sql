-- Люди в базе, а не в памяти запроса.
--
-- Один человек живёт под несколькими записями: рабочая почта, личная, имя
-- латиницей, имя кириллицей. lib/people.js сводит их вместе — union-find плюс
-- транслитерация — но делает это ЗАНОВО при каждом запросе и только для тех
-- строк, что попали в выборку.
--
-- Отсюда две беды. Первая: любой путь мимо этого кода — фильтр по участнику,
-- коннектор, скрипты — снова видит человека расщеплённым. Вторая: работа
-- повторяется на каждой отрисовке страницы.
--
-- Эта таблица переносит склейку в базу. Считает её по-прежнему код (правила
-- сложные и живут в lib/people.js), но результат теперь хранится.
--
-- Заполняется: tools/people-sync.mjs — сначала отчётом, потом с --write.
-- Безопасно запускать повторно.

create table if not exists people (
  id uuid primary key default gen_random_uuid(),

  -- ключ человека: первая по алфавиту почта, а если почт нет — «name:имя».
  -- Тот же ключ, что в адресе страницы /people/<key>, поэтому ссылки, уже
  -- разосланные людьми, продолжают работать
  key text not null unique,

  -- как показывать: настоящее имя выигрывает у адреса, самое частое написание
  -- выигрывает у редкого
  label text not null,

  -- все известные адреса и написания имени — то, из чего склейка собрана.
  -- Хранятся, чтобы человека можно было найти по любому из них без разбора
  -- всей истории заново
  emails jsonb not null default '[]'::jsonb,
  names jsonb not null default '[]'::jsonb,

  updated_at timestamptz not null default now()
);

-- строка участника показывает, кем она в итоге оказалась
alter table participants
  add column if not exists person_id uuid references people (id) on delete set null;

create index if not exists participants_person_idx
  on participants (person_id);

alter table people enable row level security;
