# Промпт для нового чата (Fathom Meetings Explorer)

Скопируй всё ниже в новый чат.

---

Продолжаю проект **Fathom Meetings Explorer**. Ты — мой инженер. Я стажёр, Windows, PowerShell, пишу на JavaScript без TypeScript. Давай файлы целиком, не куски. Комментарии в коде короткие, // на английском. Перед пушем напоминай `npm run build`. В PowerShell команды склеиваются, если вставить новую до Enter.

## Что за проект
Инструмент: забирает конференции из Fathom по API, показывает в вебе с фильтрами/сортировкой, у каждой встречи конспект/задачи/участники/транскрипт. Заказчик — Даниил (d.soloviov@aivocado.ai), с ним Александр (ceo@aivocado.ai). Живая версия: https://fathom-meetings-dashboard.vercel.app · Репозиторий: https://github.com/eforaa/fathom-meetings-dashboard, ветка **dev** · Локально: C:\Users\nehoc\projects\fathom-soritng · Supabase ref: xieywsveunlrqbqzzkhf

## Стек
Next.js 16 App Router, чистый JS, CSS-модули, Supabase (Postgres), Vercel. Алиас `@/lib/...`. Вход через Google, список в ALLOWED_EMAILS. Мои логины: сайт — ved.sofi2006@gmail.com. Env: FATHOM_API_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL, SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ALLOWED_EMAILS, ENCRYPTION_KEY, MCP_TOKENS.

## Важные правила
- **Никакого стороннего ИИ** (OpenRouter и т.п.) без моего разрешения.
- **Claude Agent SDK с входом по подписке НЕЛЬЗЯ** — против условий Anthropic (в их доках прямо запрещено). Только платный ключ Anthropic либо без ИИ.
- Middleware: в matcher исключить api/cron и api/mcp, иначе внешний клиент получит HTML логина. Статические .js/.css/.ico тоже исключены.
- Vercel рвёт функцию через 60 сек. Agent SDK не запустить на Vercel (нужен залогиненный claude).

## База (таблица meetings, ключевые колонки)
owner_email, recording_id, title, ai_title, fathom_title, custom_title, summary, custom_summary, fathom_summary, notes, notes_updated_at, key_topics(jsonb), action_items(jsonb), fathom_action_items(jsonb), meeting_type, types(jsonb), importance(smallint), custom_fields(jsonb), duration_seconds, duration_minutes, date, start_time, end_time, recording_url, transcript_language, raw_transcript, analysis_status. Уникальность owner_email+recording_id.
Таблица **custom_columns**: id, owner_email, name, type(text/number/select/checkbox), options(jsonb), position — пользовательские колонки.
Таблица **fathom_accounts**: user_email, api_key_encrypted, api_key_hint, last_synced_at, backfill_cursor, backfill_done, meetings_count.

## Что уже сделано
- Загрузка из Fathom по API, защита от дублей, окно перекрытия 10 мин. Автозагрузка всего архива при вводе ключа (батчами, курсор в fathom_accounts, кнопка «Load archive»).
- Данные Fathom берутся напрямую: fathom_summary (готовый конспект markdown с таймкодами), fathom_action_items (задачи с исполнителями), fathom_title (короткий заголовок из «Цели встречи»).
- **MCP-коннектор** (lib/mcp-server.js + app/api/mcp/[token]/route.js): Claude читает/пишет базу. Инструменты: list_meetings, get_meeting, get_transcript (кусками 20000), search_participants, set_meeting_title, set_meeting_summary, set_meeting_importance, set_meeting_types, save_meeting_analysis, list_custom_columns, set_meeting_field, create_column, delete_column, get_stats. Токен→owner_email через MCP_TOKENS, фильтр по владельцу в каждом запросе.
- **Редактируемость**: название (custom_title), саммари (custom_summary), заметки (notes), важность-звёзды (importance 1-5), типы (types, до 4, множественные), пользовательские колонки (custom_columns + custom_fields). Всё правится в интерфейсе и через Claude.
- **Список** (app/page.jsx): сетка-таблица, компактные точки типов, звёзды, длительность-полоса, аватарки, дата в 2 строки. Мобильные карточки. Группировка (Group By, сворачивание), многоуровневая сортировка (до 4 уровней, каскад), фильтры keep/exclude — панель слева, состояние в URL.
- **Страница встречи** (app/meetings/[id]/page.jsx): один карандаш (app/meeting-editor.jsx) правит название+саммари+Fathom-заметки сразу, Save/Cancel через app/api/meetings/[id]/edit. Ниже — типы, звёзды, факты, темы, задачи, участники.
- Тема в куке (light-dark), IBM Plex Sans/Mono. Дизайн в духе Linear/Fathom/Notion.

## Не выкачено / в очереди
- **~15 коммитов лежат в ветке dev локально, НЕ запушены.** Пуш отбивался (Windows помнил не тот GitHub-аккаунт). На проде только старое (коннектор + автозагрузка). MCP_TOKENS на Vercel не прописаны.
- Миграции, которые надо накатить в Supabase перед пушем (все `add column if not exists`, безопасны): notes, notes_updated_at, backfill_cursor, backfill_done, fathom_summary, fathom_action_items, transcript_language, fathom_title, importance, types, custom_title, custom_summary, custom_fields + таблица custom_columns. SQL лежит в папке db/.
- Автозаголовки: скрипт scripts/generate-titles.mjs — сейчас эвристика (строка «Цель встречи»), без ИИ. Короткие ИИ-заголовки на паузе (ждут решения про ключ Anthropic).
- Бэклог: вебхук Fathom вместо ночного опроса; древовидный фильтр (тег→субтеги); редактируемый пользовательский статус; перевод конспектов.
- Баг: duration_minutes завышены — похоже, в базу попали секунды. Проверить lib/ingest.js.

## Особенности данных
Владельцы в базе: d.soloviov@aivocado.ai (383), ceo@aivocado.ai (404, все неразобранные), ved.sofi2006@gmail.com (мои, с fathom_summary). Статусы: pending/failed/done.

Прочитай сначала lib/ai.js, lib/mcp-server.js, app/page.jsx, app/meetings/[id]/page.jsx — и продолжим.
