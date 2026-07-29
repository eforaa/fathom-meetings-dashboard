import { typeLabel, formatDate, formatDuration, meetingTypes, meetingTitle } from './format.js';

//registry of all tags of the project
//every dropdown in the interface is built from this one list,
//so a new tag appears everywhere at once

//values() returns what the cell holds
//one cell can hold several values: a meeting may be planning and report
//sortKey() returns something comparable, one value per row
//pickable marks tags worth filtering by hand: a list of dates or titles
//would be one value per row, which is a wall, not a filter

export const TAGS = {
    title: {
        label: 'Meeting',
        values: (meeting) => [meetingTitle(meeting)],
        sortKey: (meeting) => meetingTitle(meeting).toLowerCase(),
        kind: 'text',
        pickable: false,
    },

    type: {
        label: 'Type',
        //a meeting can carry several types, so this cell holds several values
        values: (meeting) => meetingTypes(meeting).map((type) => typeLabel(type)),
        //sorting takes the first type in alphabet
        sortKey: (meeting) => {
            const labels = meetingTypes(meeting)
                .map((type) => typeLabel(type).toLowerCase())
                .sort();

            return labels[0] ?? '';
        },
        kind: 'text',
        pickable: true,
        emptyGroup: 'Без типа',
    },

    importance: {
        label: 'Priority',
        //a readable bucket: stars or "Unrated"
        values: (meeting) => [meeting.importance ? '★'.repeat(meeting.importance) : 'Unrated'],
        sortKey: (meeting) => meeting.importance ?? 0,
        kind: 'number',
        pickable: true,
    },

    date: {
        label: 'Date',
        values: (meeting) => (meeting.date ? [formatDate(meeting.date)] : []),
        sortKey: (meeting) => (meeting.date ? new Date(meeting.date).getTime() : 0),
        kind: 'number',
        pickable: false,
        //grouping by day would make one group per row, months are useful
        groupKey: (meeting) =>
            meeting.date
                ? new Date(meeting.date).toLocaleDateString('en-GB', {
                      month: 'long',
                      year: 'numeric',
                  })
                : 'No date',
    },

    duration: {
        label: 'Duration',
        values: (meeting) =>
            meeting.duration_minutes == null ? [] : [formatDuration(meeting.duration_minutes)],
        sortKey: (meeting) => meeting.duration_minutes ?? -1,
        kind: 'number',
        pickable: false,
        emptyGroup: 'Без длительности',
    },

    people: {
        label: 'People',
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
        emptyGroup: 'Без участников',
    },

    topics: {
        label: 'Topics',
        values: (meeting) => meeting.key_topics ?? [],
        sortKey: (meeting) => (meeting.key_topics ?? [])[0]?.toLowerCase() ?? '',
        kind: 'text',
        pickable: true,
        emptyGroup: 'Без темы',
    },
};

//list for the dropdown
export const TAG_OPTIONS = Object.entries(TAGS).map(([id, tag]) => ({
    id,
    label: tag.label,
}));

export const DEFAULT_TAG = 'date';

//all values that really occur in the data, with counts
//the dropdown is built from the data, not from a hardcoded list,
//so it never offers a value that would give an empty table
export function collectFacets(meetings, participantsByMeeting, tagId) {
    const tag = TAGS[tagId];
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
function compareBySlot(slot, a, b, participantsByMeeting) {
    const tag = TAGS[slot.tag];
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
export function applySlots(meetings, participantsByMeeting, slots) {
    //empty slots take no part
    const active = slots.filter((slot) => TAGS[slot.tag]);
    if (!active.length) return meetings;

    let result = meetings;

    //filters of all slots hold together: a row must pass every one of them
    for (const slot of active) {
        if (!slot.filterValues.length) continue;

        const tag = TAGS[slot.tag];
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
            const order = compareBySlot(slot, a, b, participantsByMeeting);
            if (order !== 0) return order;
        }

        return 0;
    });
}

//per-column filters set from the table header: {tagId: [values...]}.
//a row must pass every column that has a selection (AND across columns,
//OR within one column). Runs alongside the slot filters.
export function applyColumnFilters(meetings, participantsByMeeting, filters) {
    let result = meetings;

    for (const [tagId, values] of Object.entries(filters)) {
        if (!values?.length) continue;
        const tag = TAGS[tagId];
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
export function groupMeetings(meetings, participantsByMeeting, groupTagId) {
    const tag = TAGS[groupTagId];
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
export function groupMeetingsTree(meetings, participantsByMeeting, groupTags) {
    const tags = groupTags.filter((id) => TAGS[id]);

    //skip any level whose value is empty for EVERY meeting here — grouping by it
    //would just make one useless "Без …" bucket. checked per subtree, so a level
    //can appear under branches that have data and vanish under those that don't.
    let idx = 0;
    let tag = null;
    for (; idx < tags.length; idx += 1) {
        const candidate = TAGS[tags[idx]];
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

    const groupOf = (meeting) => {
        const participants = participantsByMeeting.get(meeting.id) ?? [];
        if (tag.groupKey) return tag.groupKey(meeting, participants);
        return tag.values(meeting, participants)[0] ?? tag.emptyGroup ?? '—';
    };

    const buckets = new Map();
    for (const meeting of meetings) {
        const key = groupOf(meeting);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(meeting);
    }

    return [...buckets.entries()].map(([label, items]) => {
        const node = { label, count: items.length };
        if (rest.length) node.children = groupMeetingsTree(items, participantsByMeeting, rest);
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
            for (const meeting of node.items) out.push({ meeting, path });
        } else {
            out.push(...flattenTree(node.children, path));
        }
    }
    return out;
}

//reading the whole view from the address bar
//state lives in the URL so a view can be sent as a link
export function readView(searchParams) {
    const slots = [];

    for (let index = 0; index < SLOT_COUNT; index += 1) {
        const keys = slotKeys(index);
        const raw = searchParams[keys.tag];

        //the first slot always sorts by something, the others start empty
        const tag = TAGS[raw] ? raw : index === 0 ? DEFAULT_TAG : '';

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
        if (TAGS[id] && !groups.includes(id)) groups.push(id);
    }

    return {
        slots,
        groups,
        //first level kept for anything still reading a single group tag
        group: groups[0] ?? '',
    };
}