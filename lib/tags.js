import { typeLabel, formatDate, formatDuration } from './format.js';

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
        values: (meeting) => (meeting.meeting_type ? [typeLabel(meeting.meeting_type)] : []),
        sortKey: (meeting) => typeLabel(meeting.meeting_type ?? '').toLowerCase(),
        kind: 'text',
    },

    status: {
        label: 'Status',
        values: (meeting) => [meeting.analysis_status ?? 'unknown'],
        sortKey: (meeting) => meeting.analysis_status ?? '',
        kind: 'text',
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

//applying one slot to the list
//filter first, then sort: sorting a smaller list is cheaper
//and the order must be built on what stayed
export function applySlot(meetings, participantsByMeeting, slot) {
    const tag = TAGS[slot.tag] ?? TAGS[DEFAULT_TAG];

    const valuesOf = (meeting) =>
        tag.values(meeting, participantsByMeeting.get(meeting.id) ?? []);

    let result = meetings;

    //filter works only when something is chosen
    if (slot.filterValues.length) {
        const chosen = new Set(slot.filterValues);

        result = result.filter((meeting) => {
            const hit = valuesOf(meeting).some((value) => chosen.has(value));
            //keep leaves the matching rows, exclude removes them
            return slot.filterMode === 'exclude' ? !hit : hit;
        });
    }

    //sorting
    const keyOf = (meeting) =>
        tag.sortKey(meeting, participantsByMeeting.get(meeting.id) ?? []);

    const direction = slot.direction === 'asc' ? 1 : -1;

    //copy first, sort() changes the array in place
    return [...result].sort((a, b) => {
        const left = keyOf(a);
        const right = keyOf(b);

        //numbers and dates compare directly
        if (tag.kind === 'number') {
            return (left - right) * direction;
        }

        //text compares by locale, otherwise Cyrillic goes after Latin
        return String(left).localeCompare(String(right)) * direction;
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

//reading the slot from the address bar
//state lives in the URL so a view can be sent as a link
export function readSlot(searchParams) {
    const tag = TAGS[searchParams.tag] ? searchParams.tag : DEFAULT_TAG;

    const filterValues = searchParams.fval
        ? String(searchParams.fval).split('~').filter(Boolean)
        : [];

    //empty means no grouping
    const group = TAGS[searchParams.group] ? searchParams.group : '';

    return {
        tag,
        direction: searchParams.dir === 'asc' ? 'asc' : 'desc',
        filterMode: searchParams.fmode === 'exclude' ? 'exclude' : 'keep',
        filterValues,
        group,
    };
}