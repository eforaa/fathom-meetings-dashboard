import { db } from './supabase.js';
import { MEETING_TYPES } from './ai.js';

//protocol version for the initialize handshake
const PROTOCOL_VERSION = '2025-06-18';
//server name shown to the client
const SERVER_INFO = { name: 'fathom-meetings', version: '1.0.0' };

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
  'key_topics',
  'analysis_status',
  'recording_url',
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
  'key_topics',
  'action_items',
  'fathom_summary',
  'fathom_action_items',
  'transcript_language',
  'recording_url',
  'analysis_status',
  'analysis_error',
  'analyzed_at',
  'notes',
  'notes_updated_at',
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
  //filter by date range
  if (args?.date_from) query = query.gte('date', args.date_from);
  if (args?.date_to) query = query.lte('date', args.date_to);

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

//tool: rename a meeting, the same editable title a person sets by hand
async function setMeetingTitle(args, ownerEmail) {
  if (!args?.id) throw new Error('id is required');

  await ownedMeeting(args.id, ownerEmail);

  const title = String(args?.title ?? '').trim().slice(0, 120);

  const { error } = await db
    .from('meetings')
    .update({ custom_title: title || null })
    .eq('id', args.id)
    .eq('owner_email', ownerEmail);

  if (error) throw new Error(error.message);

  return { ok: true, title: title || null };
}

//tool: save free-form notes without touching the machine analysis
async function setMeetingNotes(args, ownerEmail) {
  if (!args?.id) throw new Error('id is required');

  await ownedMeeting(args.id, ownerEmail);

  const { error } = await db
    .from('meetings')
    .update({
      notes: String(args?.notes ?? '').trim() || null,
      notes_updated_at: new Date().toISOString(),
    })
    .eq('id', args.id)
    .eq('owner_email', ownerEmail);

  if (error) throw new Error(error.message);

  return { ok: true };
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
      'Rename a meeting. The title shows in the list and wins over the analysis title and the raw Zoom title. Use it to give calls clear, readable names. Pass an empty string to fall back to the automatic title.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting id' },
        title: { type: 'string', description: 'New title, up to 120 characters' },
      },
      required: ['id', 'title'],
    },
  },
  {
    name: 'set_meeting_notes',
    description:
      'Save free-form notes on a meeting. Notes live next to the machine analysis and never overwrite it. Pass an empty string to clear.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting id' },
        notes: { type: 'string', description: 'Notes text, markdown allowed' },
      },
      required: ['id', 'notes'],
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
  set_meeting_notes: setMeetingNotes,
  save_meeting_analysis: saveMeetingAnalysis,
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
