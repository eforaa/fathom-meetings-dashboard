import { typeLabel, formatDate, formatDuration, meetingTypes } from './format.js';

//registry of all tags of the project
//every dropdown in the interface is built from this one list,
//so a new tag appears everywhere at once

//values() returns what the cell holds
//one cell can hold several values: a meeting may be planning and report
//sortKey() returns something comparable, one value per row

export const TAGS = {
    title: {
        label: 'Meeting',
        values: (meeting) => [meeting.ai_title || meeting.title || 'Untitled'],
        sortKey: (meeting) => (meeting.ai_title || meeting.title || '').toLowerCase(),
        kind: 'text',
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
    },

    status: {
        label: 'Status',
        values: (meeting) => [meeting.analysis_status ?? 'unknown'],
        sortKey: (meeting) => meeting.analysis_status ?? '',
        kind: 'text',
    },

    importance: {
        label: 'Priority',
        //a readable bucket: stars or "Unrated"
        values: (meeting) => [meeting.importance ? '★'.repeat(meeting.importance) : 'Unrated'],
        sortKey: (meeting) => meeting.importance ?? 0,
        kind: 'number',
    },

    date: {
        label: 'Date',
        values: (meeting) => (meeting.date ? [formatDate(meeting.date)] : []),
        sortKey: (meeting) => (meeting.date ? new Date(meeting.date).getTime() : 0),
        kind: 'number',
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
    },

    topics: {
        label: 'Topics',
        values: (meeting) => meeting.key_topics ?? [],
        sortKey: (meeting) => (meeting.key_topics ?? [])[0]?.toLowerCase() ?? '',
        kind: 'text',
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

//how many sorting columns the interface offers
export const SLOT_COUNT = 3;

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
        return values[0] ?? '—';
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

    return {
        slots,
        //empty means no grouping
        group: TAGS[searchParams.group] ? searchParams.group : '',
    };
}