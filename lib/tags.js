import { typeLabel, formatDate, formatDuration, meetingTypes, meetingTitle } from './format.js';
import { DEFAULT_LANG, LOCALES, t } from './i18n/index.js';

//registry of all tags of the project
//every dropdown in the interface is built from this one list,
//so a new tag appears everywhere at once

//values() returns what the cell holds
//one cell can hold several values: a meeting may be planning and report
//sortKey() returns something comparable, one value per row
//pickable marks tags worth filtering by hand: a list of dates or titles
//would be one value per row, which is a wall, not a filter

//the ids never change with the language — only the labels do. keeping them in
//their own list lets readView() validate a url without knowing the language
export const TAG_IDS = ['title', 'type', 'importance', 'date', 'duration', 'people', 'topics'];

//the registry is built per language: labels, empty-group names and the date
//buckets are all phrases. built once per language and reused — the object is
//read on every row of every render, so rebuilding it each time would be waste
const registryCache = new Map();

export function buildTags(lang = DEFAULT_LANG) {
    if (registryCache.has(lang)) return registryCache.get(lang);

    const tags = {
        title: {
            label: t(lang, 'tag.title'),
            values: (meeting) => [meetingTitle(meeting, lang)],
            sortKey: (meeting) => meetingTitle(meeting, lang).toLowerCase(),
            kind: 'text',
            pickable: false,
        },

        type: {
            label: t(lang, 'tag.type'),
            //a meeting can carry several types, so this cell holds several values
            values: (meeting) => meetingTypes(meeting).map((type) => typeLabel(type, lang)),
            //sorting takes the first type in alphabet
            sortKey: (meeting) => {
                const labels = meetingTypes(meeting)
                    .map((type) => typeLabel(type, lang).toLowerCase())
                    .sort();

                return labels[0] ?? '';
            },
            kind: 'text',
            pickable: true,
            emptyGroup: t(lang, 'group.noType'),
        },

        importance: {
            label: t(lang, 'tag.importance'),
            //a readable bucket: stars or "Unrated"
            values: (meeting) => [
                meeting.importance ? '★'.repeat(meeting.importance) : t(lang, 'importance.unrated'),
            ],
            sortKey: (meeting) => meeting.importance ?? 0,
            kind: 'number',
            pickable: true,
        },

        date: {
            label: t(lang, 'tag.date'),
            values: (meeting) => (meeting.date ? [formatDate(meeting.date, lang)] : []),
            sortKey: (meeting) => (meeting.date ? new Date(meeting.date).getTime() : 0),
            kind: 'number',
            pickable: false,
            //human buckets: Today / Yesterday / This week / This month, then by month
            //for anything older — the way a person actually thinks about dates
            groupKey: (meeting) => {
                if (!meeting.date) return t(lang, 'group.noDate');

                const now = new Date();
                const d = new Date(meeting.date);
                const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
                const diffDays = Math.round((day(now) - day(d)) / 86_400_000);

                if (diffDays <= 0) return t(lang, 'date.today');
                if (diffDays === 1) return t(lang, 'date.yesterday');

                //start of the current week (Monday)
                const weekStart = day(now);
                weekStart.setDate(weekStart.getDate() - ((now.getDay() + 6) % 7));
                if (day(d) >= weekStart) return t(lang, 'date.thisWeek');

                if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
                    return t(lang, 'date.thisMonth');
                }

                //older than that: the month's own name, in the chosen language
                const month = d.toLocaleDateString(LOCALES[lang] ?? LOCALES[DEFAULT_LANG], {
                    month: 'long',
                });
                return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${d.getFullYear()}`;
            },
        },

        duration: {
            label: t(lang, 'tag.duration'),
            values: (meeting) =>
                meeting.duration_minutes == null
                    ? []
                    : [formatDuration(meeting.duration_minutes, lang)],
            sortKey: (meeting) => meeting.duration_minutes ?? -1,
            kind: 'number',
            pickable: false,
            emptyGroup: t(lang, 'group.noDuration'),
        },

        people: {
            label: t(lang, 'tag.people'),
            //this is the tag with several values in one cell
            values: (meeting, participants) =>
                participants.map((person) => person.name || person.email).filter(Boolean),
            //sorting takes the first name in alphabet
            //Alexander has not decided this yet, so the simplest rule is used
            sortKey: (meeting, participants) => {
                const names = participants
                    .map((person) => (person.name || person.email || '').toLowerCase())
                    .filter(Boolean)
                    .sort();

                return names[0] ?? '';
            },
            kind: 'text',
            pickable: true,
            emptyGroup: t(lang, 'group.noPeople'),
        },

        topics: {
            label: t(lang, 'tag.topics'),
            values: (meeting) => meeting.key_topics ?? [],
            sortKey: (meeting) => (meeting.key_topics ?? [])[0]?.toLowerCase() ?? '',
            kind: 'text',
            pickable: true,
            emptyGroup: t(lang, 'group.noTopic'),
        },
    };

    registryCache.set(lang, tags);
    return tags;
}

//list for the dropdown
export function tagOptions(lang = DEFAULT_LANG) {
    const tags = buildTags(lang);
    return TAG_IDS.map((id) => ({ id, label: tags[id].label }));
}

export const DEFAULT_TAG = 'date';

//all values that really occur in the data, with counts
//the dropdown is built from the data, not from a hardcoded list,
//so it never offers a value that would give an empty table
export function collectFacets(meetings, participantsByMeeting, tagId, lang = DEFAULT_LANG) {
    const tag = buildTags(lang)[tagId];
    if (!tag) return [];

    const counts = new Map();

    for (const meeting of meetings) {
        const participants = participantsByMeeting.get(meeting.id) ?? [];

        for (const value of tag.values(meeting, participants)) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
        }
    }

    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value));
}

//how many sorting levels the interface offers
export const SLOT_COUNT = 4;

//url keys of one slot
//the first slot keeps the short names, so old links still open
function slotKeys(index) {
    const suffix = index === 0 ? '' : String(index + 1);

    return {
        tag: `tag${suffix}`,
        dir: `dir${suffix}`,
        fmode: `fmode${suffix}`,
        fval: `fval${suffix}`,
    };
}

//comparing two meetings by one slot
function compareBySlot(slot, a, b, participantsByMeeting, tags) {
    const tag = tags[slot.tag];
    const left = tag.sortKey(a, participantsByMeeting.get(a.id) ?? []);
    const right = tag.sortKey(b, participantsByMeeting.get(b.id) ?? []);
    const direction = slot.direction === 'asc' ? 1 : -1;

    //numbers and dates compare directly
    if (tag.kind === 'number') return (left - right) * direction;

    //text compares by locale, otherwise Cyrillic goes after Latin
    return String(left).localeCompare(String(right)) * direction;
}

//applying every filled slot to the list
//filter first, then sort: sorting a smaller list is cheaper
//and the order must be built on what stayed
export function applySlots(meetings, participantsByMeeting, slots, lang = DEFAULT_LANG) {
    const tags = buildTags(lang);
    //empty slots take no part
    const active = slots.filter((slot) => tags[slot.tag]);
    if (!active.length) return meetings;

    let result = meetings;

    //filters of all slots hold together: a row must pass every one of them
    for (const slot of active) {
        if (!slot.filterValues.length) continue;

        const tag = tags[slot.tag];
        const chosen = new Set(slot.filterValues);

        result = result.filter((meeting) => {
            const values = tag.values(meeting, participantsByMeeting.get(meeting.id) ?? []);
            const hit = values.some((value) => chosen.has(value));
            //keep leaves the matching rows, exclude removes them
            return slot.filterMode === 'exclude' ? !hit : hit;
        });
    }

    //cascade: the next slot only decides where the previous one saw a tie
    //copy first, sort() changes the array in place
    return [...result].sort((a, b) => {
        for (const slot of active) {
            const order = compareBySlot(slot, a, b, participantsByMeeting, tags);
            if (order !== 0) return order;
        }

        return 0;
    });
}

//per-column filters set from the table header: {tagId: [values...]}.
//a row must pass every column that has a selection (AND across columns,
//OR within one column). Runs alongside the slot filters.
export function applyColumnFilters(meetings, participantsByMeeting, filters, lang = DEFAULT_LANG) {
    const tags = buildTags(lang);
    let result = meetings;

    for (const [tagId, values] of Object.entries(filters)) {
        if (!values?.length) continue;
        const tag = tags[tagId];
        if (!tag) continue;

        const chosen = new Set(values);
        result = result.filter((meeting) => {
            const vals = tag.values(meeting, participantsByMeeting.get(meeting.id) ?? []);
            return vals.some((value) => chosen.has(value));
        });
    }

    return result;
}

//grouping the sorted list by one tag
//runs after applySlot, so the group order follows the current sort
//(sort by date, newest first → months come newest first)
export function groupMeetings(meetings, participantsByMeeting, groupTagId, lang = DEFAULT_LANG) {
    const tag = buildTags(lang)[groupTagId];
    if (!tag) return null;

    //which group a row belongs to: a special key if the tag has one,
    //otherwise its first value; rows with several values go by the first
    const groupOf = (meeting) => {
        const participants = participantsByMeeting.get(meeting.id) ?? [];
        if (tag.groupKey) return tag.groupKey(meeting, participants);

        const values = tag.values(meeting, participants);
        return values[0] ?? tag.emptyGroup ?? '—';
    };

    //Map keeps first-seen order, which is the sorted order
    const groups = new Map();
    for (const meeting of meetings) {
        const key = groupOf(meeting);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(meeting);
    }

    return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

//how many nested grouping levels the tree offers (Alexander's "3 columns")
export const GROUP_LEVELS = 3;

//multi-level grouping: group by the first tag, then group each of those by the
//next tag, and so on — a collapsible tree. leaf nodes carry `items`, inner
//nodes carry `children`. runs on the already-sorted list, so order is kept.
export function groupMeetingsTree(
    meetings,
    participantsByMeeting,
    groupTags,
    lang = DEFAULT_LANG,
) {
    const registry = buildTags(lang);
    const tags = groupTags.filter((id) => registry[id]);

    //skip any level whose value is empty for EVERY meeting here — grouping by it
    //would just make one useless "Без …" bucket. checked per subtree, so a level
    //can appear under branches that have data and vanish under those that don't.
    let idx = 0;
    let tag = null;
    for (; idx < tags.length; idx += 1) {
        const candidate = registry[tags[idx]];
        const splits = candidate.groupKey
            ? true
            : meetings.some(
                  (m) => candidate.values(m, participantsByMeeting.get(m.id) ?? []).length > 0,
              );
        if (splits) {
            tag = candidate;
            break;
        }
    }
    if (!tag) return null;

    const rest = tags.slice(idx + 1);

    //every value the row carries, not just the first. a meeting tagged
    //"automation" and "onboarding" belongs under both, and grouping by People
    //should show a meeting under each of its participants — taking values[0]
    //quietly hid it everywhere else. Notion and Airtable behave the same way.
    //A tag with a groupKey (date buckets, duration bands) has one answer by
    //definition.
    //Because of this the group counts can add up to more than the number of
    //rows: that is one meeting seen from several sides, not a duplicate.
    const groupsOf = (meeting) => {
        const participants = participantsByMeeting.get(meeting.id) ?? [];
        if (tag.groupKey) return [tag.groupKey(meeting, participants)];

        const values = [...new Set(tag.values(meeting, participants))];
        return values.length ? values : [tag.emptyGroup ?? '—'];
    };

    const buckets = new Map();
    for (const meeting of meetings) {
        for (const key of groupsOf(meeting)) {
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(meeting);
        }
    }

    return [...buckets.entries()].map(([label, items]) => {
        const node = { label, count: items.length };
        if (rest.length) {
            node.children = groupMeetingsTree(items, participantsByMeeting, rest, lang);
        }
        if (!node.children) node.items = items;
        return node;
    });
}

//flatten the group tree into an ordered list of leaf rows, each carrying its
//path of ancestor groups (label + count + a stable key per level). the outline
//gutter (Google-Sheets-style) is drawn from these paths on the client.
export function flattenTree(nodes, parentPath = []) {
    const out = [];
    for (const node of nodes) {
        const seg = {
            key: [...parentPath.map((p) => p.label), node.label].join(' ▸ '),
            label: node.label,
            count: node.count,
        };
        const path = [...parentPath, seg];
        if (node.items) {
            //a meeting can sit under several branches now, so the row needs a
            //key of its own — the same id twice would collide in React
            for (const meeting of node.items) {
                out.push({ meeting, path, key: `${seg.key} :: ${meeting.id}` });
            }
        } else {
            out.push(...flattenTree(node.children, path));
        }
    }
    return out;
}

//reading the whole view from the address bar
//state lives in the URL so a view can be sent as a link.
//tag ids are language-independent, so this needs no language: a link made in
//Ukrainian opens the same view for someone reading in English
export function readView(searchParams) {
    const slots = [];

    for (let index = 0; index < SLOT_COUNT; index += 1) {
        const keys = slotKeys(index);
        const raw = searchParams[keys.tag];

        //the first slot always sorts by something, the others start empty
        const tag = TAG_IDS.includes(raw) ? raw : index === 0 ? DEFAULT_TAG : '';

        slots.push({
            index,
            keys,
            tag,
            direction: searchParams[keys.dir] === 'asc' ? 'asc' : 'desc',
            filterMode: searchParams[keys.fmode] === 'exclude' ? 'exclude' : 'keep',
            filterValues: searchParams[keys.fval]
                ? String(searchParams[keys.fval]).split('~').filter(Boolean)
                : [],
        });
    }

    //grouping levels: group, group2, group3 — a nested tree, first valid wins
    const groupKeysList = ['group', 'group2', 'group3'];
    const groups = [];
    for (const key of groupKeysList) {
        const id = searchParams[key];
        if (TAG_IDS.includes(id) && !groups.includes(id)) groups.push(id);
    }

    return {
        slots,
        groups,
        //first level kept for anything still reading a single group tag
        group: groups[0] ?? '',
    };
}
