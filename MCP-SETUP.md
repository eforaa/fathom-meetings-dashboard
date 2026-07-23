# Подключение MCP-коннектора

Коннектор позволяет Claude напрямую читать и писать встречи в базе.
Каждый токен привязан к одному владельцу — Claude видит только его встречи.

## 1. Миграция базы

В Supabase (SQL Editor) выполнить `db/meeting-notes.sql` —
добавляет колонки `notes` и `notes_updated_at` в `meetings`.

## 2. Переменная окружения MCP_TOKENS

Формат: `токен:email` через запятую, без пробелов вокруг запятых.

```
MCP_TOKENS=abc123...:d.soloviov@aivocado.ai,def456...:a.pogorelyi@aivocado.ai
```

Сгенерировать токен (PowerShell):

```powershell
-join ((1..48) | ForEach-Object { '0123456789abcdef'[(Get-Random -Max 16)] })
```

Прописать в `.env.local` и в Vercel → Settings → Environment Variables,
после чего передеплоить.

## 3. Подключение в Claude

claude.ai → Settings → Connectors → Add custom connector:

```
https://fathom-meetings-dashboard.vercel.app/api/mcp/<токен>
```

Либо в Claude Code:

```bash
claude mcp add fathom-meetings --transport http https://fathom-meetings-dashboard.vercel.app/api/mcp/<токен>
```

Заголовок `Authorization: Bearer <токен>` тоже принимается и имеет
приоритет над токеном в адресе.

## 4. Инструменты

| Инструмент | Что делает |
|---|---|
| `list_meetings` | список встреч с фильтрами: тип, даты, поиск по названию, участник |
| `get_meeting` | карточка встречи: описание, темы, задачи, заметки, участники |
| `get_transcript` | транскрипт кусками по 20 000 символов |
| `search_participants` | поиск людей по имени или почте |
| `set_meeting_notes` | заметки к встрече (не трогают машинный разбор) |
| `save_meeting_analysis` | запись разбора в базу, ставит статус done |
| `get_stats` | сводка: сколько встреч, по типам, по статусам |

## Безопасность

- Токен в URL попадает в логи Vercel. Отзыв: убрать пару из `MCP_TOKENS`
  и передеплоить.
- Каждый запрос фильтруется по владельцу токена вручную: service key
  обходит RLS, поэтому `owner_email` подставляется и в чтение, и в запись.
- Роут исключён из middleware — иначе клиент получал бы HTML логин-страницы.
