import { db } from './supabase.js';
import { MEETING_TYPES } from './format.js';
import { MAX_TYPES } from './format.js';
import { listColumns, setColumnValue, addColumn, removeColumn, COLUMN_TYPES } from './columns.js';

//protocol version for the initialize handshake
const PROTOCOL_VERSION = '2025-06-18';
//server name shown to the client
const SERVER_INFO = { name: 'fathom-meetings', version: '1.0.0' };

//guidance sent to every client on connect (MCP `instructions`), so any Claude
//that connects knows how to use the base and how to name meetings — no separate
//skill install needed. Keep it short and practical.
const SERVER_INSTRUCTIONS = `Это база встреч из Fathom. Ты видишь и меняешь только встречи владельца токена. Показывай результаты человеку таблицей (Markdown), а не сырым JSON. id встреч и колонок бери только из инструментов, не придумывай.

Читать:
- list_meetings — список с фильтрами (тип, даты, поиск по названию, участник).
- get_meeting — карточка встречи (саммари, темы, задачи, участники).
- get_transcript — транскрипт кусками. search_participants — поиск людей. get_stats — сводка.

Находи ВСЁ, а не примеры:
- Когда дают параметры (участник, тип, период) — обработай ВСЕ подходящие встречи, а не пару штук. Если их много — пройди все страницами (list_meetings offset), не останавливайся на первой.
- Один человек может быть записан под НЕСКОЛЬКИМИ именами и почтами (Fathom фиксирует по-разному — рабочая почта, личная, имя без почты, кириллица/латиница). Поиск по одному email пропустит часть встреч.
- Правильный порядок: сначала search_participants по фамилии/имени (пробуй и латиницу, и кириллицу, и почту) — он вернёт ВСЕ алиасы; затем собери встречи по каждому алиасу (list_meetings participant=... для каждого) и объедини, убрав дубли по id.
- Не полагайся на один идентификатор и не отвечай «нашёл N», пока не проверил все алиасы.

Править:
- set_meeting_title / set_meeting_summary — название и саммари.
- set_meeting_importance — важность 0–5. set_meeting_types — типы встречи (до 4).
- Колонки: list_custom_columns, create_column (text/number/select/multiselect/checkbox), delete_column, set_meeting_field. Для multiselect (теги) значение — массив.
- Перед массовой правкой покажи, что собираешься менять, и дождись подтверждения.

Как устроено название (три поля, дашборд показывает по порядку):
- title — ОРИГИНАЛ из Fathom, его НЕ трогаем никогда.
- ai_title — сгенерированное тобой имя. Пиши через set_meeting_title с generated:true. Показывается с меткой 🤖, пользователь может вернуть оригинал.
- custom_title — ручное имя, которое явно продиктовал человек (generated:false). Оно главнее всех.
- Порядок показа: custom_title → настоящее календарное имя (оригинал title) → ai_title (🤖) → fathom_title → «No name». Ручное имя главнее всех; настоящее календарное имя стоит ВЫШЕ 🤖, чтобы генерация не затирала уже названную встречу. Поэтому у встречи с реальным именем 🤖-имя НЕ покажется по умолчанию, пока человек не закрепит его через пикер названия.

Короткие названия безымянным встречам («Impromptu Zoom Meeting»):
- Заголовок = суть темы (3–5 слов, без глаголов) + ИНИЦИАЛЫ 1–3 ключевых участников в скобках. Инициалы = первые буквы имени и фамилии (2 буквы), как в корпоративных встречах «(АЮ, ГТ, СД)». Пиши их на том же алфавите, что и имя (неважно кириллица или латиница). Примеры: «Плагин Fathom — синхронизация данных (ПА, ОА, ВС)», «Онбординг стажёра (ПА, СВ)».
- СУТЬ ТЕМЫ БЕРИ ИЗ ЦЕЛИ ВСТРЕЧИ, а не из key_topics и не выдумывай из транскрипта. Цель лежит в get_meeting → fathom_summary — это первая строка под заголовком «Цель встречи»/«Purpose». Опирайся на неё, убери глаголы, оставь суть. Цель уже есть в саммари — не спрашивай её у человека.
- Пиши на языке саммари, один алфавит (не мешай кириллицу и латиницу), одного человека всегда одинаково.
- НЕ вставляй эмодзи и значки в текст названия (никаких 🤖, 🥑 и т.п.) — только слова и инициалы. Метку 🤖 добавляет сам интерфейс.
- Регулярные встречи (одинаковые время/состав/тема из месяца в месяц) обычно уже имеют принятое имя — не выдумывай новое. Генерируй короткое название только для действительно разовых безымянных встреч.
- Пиши сгенерированные имена через set_meeting_title с generated:true (метка 🤖). Оригинал (title) при этом не трогается и не теряется.
- ПО УМОЛЧАНИЮ генерируй имя только безымянным встречам («No name»/«Impromptu Zoom Meeting»): у уже названной встречи календарное имя всё равно показывается поверх 🤖, так что смысла нет.
- НО ЕСЛИ ЧЕЛОВЕК ЯВНО ПРОСИТ переименовать всё («переименуй все», «сгенерируй имена для всех встреч», «обнови названия у этих» и т.п.) — генерируй ai_title для ВСЕХ указанных встреч, ВКЛЮЧАЯ уже названные. Правило имени то же: суть темы + инициалы участников в скобках («АЮ, ГТ, СД»). Оригинал остаётся в title, а 🤖-имя человек включит там, где захочет, через пикер названия.
- Порядок работы всегда один: сначала покажи «старое → новое» для 3–5 штук, дождись «ок», затем проходи ОСТАЛЬНЫЕ пачками до конца списка (list_meetings offset), не останавливайся на примере.`;

//transcript is returned in chunks so one reply stays small
const TRANSCRIPT_CHUNK = 20_000;

//list limits
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

//columns safe for lists: no transcript, no notes
const LIST_COLUMNS = [
  'id',
  'recording_id',
  'title',
  'ai_title',
  'custom_title',
  'date',
  'duration_minutes',
  'meeting_type',
  'types',
  'importance',
  'key_topics',
  'analysis_status',
  'recording_url',
  'custom_fields',
].join(', ');

//full meeting card, still without the transcript
const DETAIL_COLUMNS = [
  'id',
  'recording_id',
  'title',
  'ai_title',
  'custom_title',
  'date',
  'start_time',
  'end_time',
  'duration_minutes',
  'meeting_type',
  'summary',
  'custom_summary',
  'key_topics',
  'action_items',
  'types',
  'importance',
  'fathom_summary',
  'fathom_action_items',
  'transcript_language',
  'recording_url',
  'analysis_status',
  'analysis_error',
  'analyzed_at',
  'custom_fields',
].join(', ');

//maps a connector token to the owner email
//MCP_TOKENS format: token:email,token:email
export function resolveOwner(token) {
  if (!token) return null;

  const pairs = String(process.env.MCP_TOKENS ?? '').split(',');

  for (const pair of pairs) {
    const [candidate, email] = pair.split(':').map((part) => part?.trim());
    if (candidate && email && candidate === token) return email;
  }

  return null;
}

//reverse of resolveOwner: the connector token issued to this email, if any.
//used by the Connect page to show a person their own ready-to-paste link.
export function tokenForOwner(email) {
  if (!email) return null;

  const pairs = String(process.env.MCP_TOKENS ?? '').split(',');

  for (const pair of pairs) {
    const [candidate, mail] = pair.split(':').map((part) => part?.trim());
    if (candidate && mail && mail.toLowerCase() === email.toLowerCase()) return candidate;
  }

  return null;
}

//user input goes into supabase .or() filters
//commas and parentheses would break the filter syntax
function cleanTerm(value) {
  return String(value ?? '').replace(/[,()%]/g, ' ').trim();
}

//meeting must belong to the token owner
//service key bypasses rls, so the check is done by hand
async function ownedMeeting(id, ownerEmail, columns = 'id') {
  const { data, error } = await db
    .from('meetings')
    .select(columns)
    .eq('id', id)
    .eq('owner_email', ownerEmail)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Meeting not found');

  return data;
}

//tool: list meetings with filters
async function listMeetings(args, ownerEmail) {
  const limit = Math.min(Math.max(Number(args?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(Number(args?.offset) || 0, 0);

  let query = db
    .from('meetings')
    .select(LIST_COLUMNS, { count: 'exact' })
    .eq('owner_email', ownerEmail);

  //filter by meeting type
  if (args?.type) query = query.eq('meeting_type', args.type);
  //filter by date range. a date-only "date_to" (YYYY-MM-DD) means "through the
  //end of that day" — as-is it lands at 00:00 and drops every meeting on that
  //day (a single-day filter returns empty), so extend it to the day's end.
  if (args?.date_from) query = query.gte('date', args.date_from);
  if (args?.date_to) {
    const to = /^\d{4}-\d{2}-\d{2}$/.test(args.date_to)
      ? `${args.date_to}T23:59:59.999Z`
      : args.date_to;
    query = query.lte('date', to);
  }

  //search in both titles
  const term = cleanTerm(args?.search);
  if (term) {
    query = query.or(`title.ilike.%${term}%,ai_title.ilike.%${term}%`);
  }

  //filter by participant name or email
  const person = cleanTerm(args?.participant);
  if (person) {
    const { data: rows } = await db
      .from('participants')
      .select('meeting_id')
      .or(`name.ilike.%${person}%,email.ilike.%${person}%`);

    const ids = [...new Set((rows ?? []).map((row) => row.meeting_id))];
    if (!ids.length) return { meetings: [], total: 0 };

    query = query.in('id', ids);
  }

  const { data, count, error } = await query
    .order('date', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  return { meetings: data ?? [], total: count ?? 0, offset, limit };
}

//tool: one meeting with participants, without transcript
async function getMeeting(args, ownerEmail) {
  if (!args?.id) throw new Error('id is required');

  const meeting = await ownedMeeting(args.id, ownerEmail, DETAIL_COLUMNS);

  const { data: participants } = await db
    .from('participants')
    .select('name, email, email_domain')
    .eq('meeting_id', args.id);

  return { meeting, participants: participants ?? [] };
}

//tool: transcript in chunks of TRANSCRIPT_CHUNK characters
async function getTranscript(args, ownerEmail) {
  if (!args?.id) throw new Error('id is required');

  const row = await ownedMeeting(args.id, ownerEmail, 'id, raw_transcript');
  const transcript = row.raw_transcript ?? '';

  if (!transcript) return { text: '', offset: 0, total_chars: 0, has_more: false };

  const offset = Math.max(Number(args?.offset) || 0, 0);
  const text = transcript.slice(offset, offset + TRANSCRIPT_CHUNK);
  const nextOffset = offset + text.length;

  return {
    text,
    offset,
    total_chars: transcript.length,
    has_more: nextOffset < transcript.length,
    next_offset: nextOffset < transcript.length ? nextOffset : null,
  };
}

//tool: find people across the owner's meetings
async function searchParticipants(args, ownerEmail) {
  const term = cleanTerm(args?.query);
  if (!term) throw new Error('query is required');

  //participants are not owner-scoped, so owner meetings go first
  const { data: owned, error } = await db
    .from('meetings')
    .select('id')
    .eq('owner_email', ownerEmail);

  if (error) throw new Error(error.message);

  const meetingIds = (owned ?? []).map((row) => row.id);
  if (!meetingIds.length) return { people: [] };

  const { data: rows } = await db
    .from('participants')
    .select('name, email, meeting_id')
    .in('meeting_id', meetingIds)
    .or(`name.ilike.%${term}%,email.ilike.%${term}%`);

  //group matches by person
  const byPerson = new Map();
  for (const row of rows ?? []) {
    const key = row.email || row.name;
    if (!key) continue;

    const entry = byPerson.get(key) ?? { name: row.name, email: row.email, meeting_ids: [] };
    entry.meeting_ids.push(row.meeting_id);
    byPerson.set(key, entry);
  }

  return {
    people: [...byPerson.values()].map((person) => ({
      name: person.name,
      email: person.email,
      meetings_count: person.meeting_ids.length,
      meeting_ids: person.meeting_ids.slice(0, 50),
    })),
  };
}

//tool: rename a meeting.
//generated:true → writes ai_title (shown with a 🤖 mark, user can revert).
//generated:false (default) → writes custom_title, a deliberate manual name.
//the dashboard shows custom_title → ai_title → original, so a manual name
//always wins and the original recorded name is never overwritten.
async function setMeetingTitle(args, ownerEmail) {
  if (!args?.id) throw new Error('id is required');

  await ownedMeeting(args.id, ownerEmail);

  const title = String(args?.title ?? '').trim().slice(0, 120);
  const field = args?.generated ? 'ai_title' : 'custom_title';

  const { error } = await db
    .from('meetings')
    .update({ [field]: title || null })
    .eq('id', args.id)
    .eq('owner_email', ownerEmail);

  if (error) throw new Error(error.message);

  return { ok: true, title: title || null, field };
}

//tool: edit the summary, the same editable text a person sets by hand
async function setMeetingSummary(args, ownerEmail) {
  if (!args?.id) throw new Error('id is required');

  await ownedMeeting(args.id, ownerEmail);

  const summary = String(args?.summary ?? '').trim().slice(0, 5000);

  const { error } = await db
    .from('meetings')
    .update({ custom_summary: summary || null })
    .eq('id', args.id)
    .eq('owner_email', ownerEmail);

  if (error) throw new Error(error.message);

  return { ok: true, summary: summary || null };
}

//tool: set the importance stars, 0..5, the same rating shown in the list
async function setMeetingImportance(args, ownerEmail) {
  if (!args?.id) throw new Error('id is required');

  await ownedMeeting(args.id, ownerEmail);

  //clamp to 0..5, anything else becomes 0
  const importance = Math.min(Math.max(Math.round(Number(args?.importance) || 0), 0), 5);

  const { error } = await db
    .from('meetings')
    .update({ importance })
    .eq('id', args.id)
    .eq('owner_email', ownerEmail);

  if (error) throw new Error(error.message);

  return { ok: true, importance };
}

//tool: set the meeting types, known values only, up to MAX_TYPES
async function setMeetingTypes(args, ownerEmail) {
  if (!args?.id) throw new Error('id is required');

  await ownedMeeting(args.id, ownerEmail);

  //keep known values only, drop duplicates, cap the count
  const types = Array.isArray(args?.types)
    ? [...new Set(args.types.filter((type) => MEETING_TYPES.includes(type)))].slice(0, MAX_TYPES)
    : [];

  const { error } = await db
    .from('meetings')
    .update({ types: types.length ? types : null })
    .eq('id', args.id)
    .eq('owner_email', ownerEmail);

  if (error) throw new Error(error.message);

  return { ok: true, types };
}

//tool: write the analysis into the same columns the night pipeline uses
async function saveMeetingAnalysis(args, ownerEmail) {
  if (!args?.id) throw new Error('id is required');

  const summary = String(args?.summary ?? '').trim();
  if (!summary) throw new Error('summary is required');

  await ownedMeeting(args.id, ownerEmail);

  //same normalization rules as lib/ai.js
  const meetingType = MEETING_TYPES.includes(args?.meeting_type) ? args.meeting_type : 'other';

  const keyTopics = Array.isArray(args?.key_topics)
    ? args.key_topics
        .filter((topic) => typeof topic === 'string' && topic.trim())
        .map((topic) => topic.trim())
        .slice(0, 10)
    : [];

  const actionItems = Array.isArray(args?.action_items)
    ? args.action_items
        .map((item) =>
          typeof item === 'string'
            ? { assignee: null, task: item.trim() }
            : { assignee: item?.assignee || null, task: String(item?.task ?? '').trim() },
        )
        .filter((item) => item.task)
    : [];

  const { error } = await db
    .from('meetings')
    .update({
      ai_title: String(args?.title ?? '').trim().slice(0, 120) || null,
      summary,
      key_topics: keyTopics,
      meeting_type: meetingType,
      action_items: actionItems,
      analysis_status: 'done',
      analysis_error: null,
      analyzed_at: new Date().toISOString(),
    })
    .eq('id', args.id)
    .eq('owner_email', ownerEmail);

  if (error) throw new Error(error.message);

  return { ok: true, meeting_type: meetingType };
}

//tool: the owner's custom columns, so claude knows what it can fill
async function listCustomColumns(args, ownerEmail) {
  const columns = await listColumns(ownerEmail);
  return { columns };
}

//tool: set a custom-column value on a meeting
async function setMeetingField(args, ownerEmail) {
  if (!args?.id) throw new Error('id is required');
  if (!args?.column_id) throw new Error('column_id is required');

  const result = await setColumnValue(ownerEmail, args.id, args.column_id, args.value);
  return { ok: true, ...result };
}

//tool: add a custom column, the same one a person adds in the table header
async function createColumn(args, ownerEmail) {
  const column = await addColumn(ownerEmail, {
    name: args?.name,
    type: args?.type,
    options: args?.options,
  });
  return { ok: true, column };
}

//tool: delete a custom column; its values on meetings stay as ignored keys
async function deleteColumn(args, ownerEmail) {
  if (!args?.column_id) throw new Error('column_id is required');

  await removeColumn(ownerEmail, args.column_id);
  return { ok: true };
}

//tool: quick numbers about the owner's archive
async function getStats(args, ownerEmail) {
  const { data, error } = await db
    .from('meetings')
    .select('meeting_type, analysis_status, date, duration_minutes')
    .eq('owner_email', ownerEmail)
    .limit(5000);

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byType = {};
  const byStatus = {};
  let minutes = 0;
  let earliest = null;
  let latest = null;

  for (const row of rows) {
    byType[row.meeting_type ?? 'unknown'] = (byType[row.meeting_type ?? 'unknown'] ?? 0) + 1;
    byStatus[row.analysis_status ?? 'unknown'] = (byStatus[row.analysis_status ?? 'unknown'] ?? 0) + 1;
    minutes += row.duration_minutes ?? 0;

    if (row.date && (!earliest || row.date < earliest)) earliest = row.date;
    if (row.date && (!latest || row.date > latest)) latest = row.date;
  }

  return {
    total: rows.length,
    by_type: byType,
    by_status: byStatus,
    total_minutes: minutes,
    earliest_date: earliest,
    latest_date: latest,
  };
}

//tool descriptions sent to the client on tools/list
const TOOLS = [
  {
    name: 'list_meetings',
    description:
      'List meetings of the connected account. Supports filtering by type, date range, title search and participant. Returns meetings without transcripts.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: MEETING_TYPES, description: 'Filter by meeting type' },
        search: { type: 'string', description: 'Substring to look for in titles' },
        participant: { type: 'string', description: 'Participant name or email substring' },
        date_from: { type: 'string', description: 'ISO date, inclusive' },
        date_to: { type: 'string', description: 'ISO date, inclusive' },
        limit: { type: 'number', description: `Page size, max ${MAX_LIMIT}` },
        offset: { type: 'number', description: 'Rows to skip for paging' },
      },
    },
  },
  {
    name: 'get_meeting',
    description:
      'Get one meeting by id: summary, topics, action items, notes and participants. Transcript is not included, use get_transcript.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Meeting id' } },
      required: ['id'],
    },
  },
  {
    name: 'get_transcript',
    description: `Get the raw transcript of a meeting in chunks of ${TRANSCRIPT_CHUNK} characters. Pass next_offset from the previous reply to continue reading.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting id' },
        offset: { type: 'number', description: 'Character offset to start from, default 0' },
      },
      required: ['id'],
    },
  },
  {
    name: 'search_participants',
    description: 'Find people across all meetings of the connected account by name or email substring.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Name or email substring' } },
      required: ['query'],
    },
  },
  {
    name: 'set_meeting_title',
    description:
      'Rename a meeting. Set generated:true for a name YOU produced from the transcript/goal — it is stored as an ai suggestion, marked 🤖 for the user, who can revert to the original. Set generated:false (or omit) only for a deliberate name a human dictated. Empty string clears the field. Only name calls that have no real name (Impromptu Zoom Meeting / No name); never rewrite a meeting that already has a proper name.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting id' },
        title: { type: 'string', description: 'New title, up to 120 characters' },
        generated: {
          type: 'boolean',
          description: 'true if you generated this name (stored as 🤖 ai suggestion); false/omit for a human-dictated name',
        },
      },
      required: ['id', 'title'],
    },
  },
  {
    name: 'set_meeting_summary',
    description:
      'Edit the summary of a meeting. The edited text shows in place of the machine summary and wins over it. Pass an empty string to fall back to the automatic summary.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting id' },
        summary: { type: 'string', description: 'New summary text' },
      },
      required: ['id', 'summary'],
    },
  },
  {
    name: 'set_meeting_importance',
    description:
      'Set the importance of a meeting as 0 to 5 stars. 0 clears it. Shown as stars in the list, the same rating a person sets by hand.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting id' },
        importance: { type: 'number', description: '0 to 5, higher is more important' },
      },
      required: ['id', 'importance'],
    },
  },
  {
    name: 'set_meeting_types',
    description: `Set the types of a meeting. Pass an array of up to ${MAX_TYPES} values from the allowed list; unknown values are dropped. An empty array clears all types.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting id' },
        types: {
          type: 'array',
          items: { type: 'string', enum: MEETING_TYPES },
          description: `Up to ${MAX_TYPES} meeting types`,
        },
      },
      required: ['id', 'types'],
    },
  },
  {
    name: 'save_meeting_analysis',
    description:
      'Write a meeting analysis into the database: title, summary, key topics, meeting type and action items. Marks the meeting as analyzed. Overwrites the previous analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting id' },
        title: { type: 'string', description: '3-6 words about what the meeting was about' },
        summary: { type: 'string', description: '3-5 sentences: what was discussed and decided' },
        key_topics: { type: 'array', items: { type: 'string' }, description: '3-7 short phrases' },
        meeting_type: { type: 'string', enum: MEETING_TYPES },
        action_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              assignee: { type: ['string', 'null'] },
              task: { type: 'string' },
            },
            required: ['task'],
          },
        },
      },
      required: ['id', 'summary'],
    },
  },
  {
    name: 'list_custom_columns',
    description:
      "The account's custom columns: their id, name and type (text, number, select, multiselect, checkbox). Call this first to learn which fields you may fill with set_meeting_field.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_meeting_field',
    description:
      'Set a custom-column value on a meeting. Get the column_id from list_custom_columns. An empty value (or empty array) clears the cell. For a select column the value must be one the column offers. For a multiselect (tags) column pass an array of offered values.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting id' },
        column_id: { type: 'string', description: 'Custom column id from list_custom_columns' },
        value: {
          type: ['string', 'number', 'boolean', 'array', 'null'],
          description: 'The value to store, matching the column type. For a multiselect column, an array of allowed values.',
        },
      },
      required: ['id', 'column_id'],
    },
  },
  {
    name: 'create_column',
    description:
      'Add a custom column to the table, the same one a person adds by hand. Types: text, number, select (one choice), multiselect (several tags in one cell), checkbox. For select and multiselect columns pass options as the list of allowed values.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Column name, up to 40 characters' },
        type: { type: 'string', enum: COLUMN_TYPES, description: 'Column type' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allowed values, for select and multiselect columns',
        },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'delete_column',
    description:
      'Delete a custom column by id. Get the column_id from list_custom_columns. Values already stored on meetings are left in place but no longer shown.',
    inputSchema: {
      type: 'object',
      properties: {
        column_id: { type: 'string', description: 'Custom column id from list_custom_columns' },
      },
      required: ['column_id'],
    },
  },
  {
    name: 'get_stats',
    description: 'Totals for the connected account: meetings by type, by analysis status, minutes recorded, date range.',
    inputSchema: { type: 'object', properties: {} },
  },
];

//tool name to handler
const HANDLERS = {
  list_meetings: listMeetings,
  get_meeting: getMeeting,
  get_transcript: getTranscript,
  search_participants: searchParticipants,
  set_meeting_title: setMeetingTitle,
  set_meeting_summary: setMeetingSummary,
  set_meeting_importance: setMeetingImportance,
  set_meeting_types: setMeetingTypes,
  save_meeting_analysis: saveMeetingAnalysis,
  list_custom_columns: listCustomColumns,
  set_meeting_field: setMeetingField,
  create_column: createColumn,
  delete_column: deleteColumn,
  get_stats: getStats,
};

//jsonrpc reply helpers
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

//handles one jsonrpc message, returns {status, body} for the route
//body null means reply with an empty response (notifications)
export async function handleMcpRequest(message, ownerEmail) {
  //not a valid jsonrpc message
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') {
    return { status: 400, body: rpcError(null, -32700, 'Invalid JSON-RPC request') };
  }

  const { id, method, params } = message;

  //notifications need no reply
  if (id === undefined || id === null) {
    return { status: 202, body: null };
  }

  switch (method) {
    case 'initialize':
      return {
        status: 200,
        body: rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: SERVER_INSTRUCTIONS,
        }),
      };

    case 'ping':
      return { status: 200, body: rpcResult(id, {}) };

    case 'tools/list':
      return { status: 200, body: rpcResult(id, { tools: TOOLS }) };

    case 'tools/call': {
      const handler = HANDLERS[params?.name];
      if (!handler) {
        return { status: 200, body: rpcError(id, -32602, `Unknown tool: ${params?.name}`) };
      }

      try {
        const result = await handler(params?.arguments ?? {}, ownerEmail);
        return {
          status: 200,
          body: rpcResult(id, {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          }),
        };
      } catch (caught) {
        //tool errors go back as tool output, not protocol errors
        const text = caught instanceof Error ? caught.message : String(caught);
        return {
          status: 200,
          body: rpcResult(id, {
            content: [{ type: 'text', text }],
            isError: true,
          }),
        };
      }
    }

    default:
      return { status: 200, body: rpcError(id, -32601, `Method not found: ${method}`) };
  }
}
