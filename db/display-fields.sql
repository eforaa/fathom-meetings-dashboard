-- Одно название и один конспект вместо семи полей.
--
-- Сейчас у встречи четыре названия (custom_title, title, ai_title,
-- fathom_title) и три конспекта (custom_summary, summary, fathom_summary), а
-- правило «что показывать» живёт в коде. Каждый новый потребитель обязан
-- повторить ту же лесенку: страница, выгрузка, коннектор, скрипты. Кто-нибудь
-- однажды повторит её иначе — и увидит другое название той же встречи.
--
-- Эти две колонки считает сама база. Значение пересчитывается при каждой
-- записи, забыть обновить нельзя, а потребителю достаточно прочитать поле.
--
-- Что НЕ переехало: закрепление источника (custom_fields->>'__title_choice').
-- Это выбор человека для одной встречи, он редкий и остаётся в коде — иначе
-- пришлось бы прятать в вычисляемую колонку ещё и его исключения.
--
-- Безопасно запускать повторно.

alter table meetings
  add column if not exists display_title text
  generated always as (
    coalesce(
      nullif(btrim(custom_title), ''),
      nullif(btrim(title), ''),
      nullif(btrim(ai_title), ''),
      nullif(btrim(fathom_title), '')
    )
  ) stored;

-- порядок тот же, что в коде: своё, затем разбор. fathom_summary сюда
-- намеренно не входит — в интерфейсе он тоже не показывается как конспект
alter table meetings
  add column if not exists display_summary text
  generated always as (
    coalesce(
      nullif(btrim(custom_summary), ''),
      nullif(btrim(summary), '')
    )
  ) stored;

-- «без названия» и «без конспекта» — самые частые запросы к списку, и теперь
-- они выражаются одним условием вместо четырёх
create index if not exists meetings_owner_display_title_idx
  on meetings (owner_email) where display_title is null;

create index if not exists meetings_owner_display_summary_idx
  on meetings (owner_email) where display_summary is null;
