import { db } from './supabase.js';

//column types a person can pick
export const COLUMN_TYPES = ['text', 'number', 'select', 'checkbox'];

//readable name of every type, for the dropdown
export const COLUMN_TYPE_LABELS = {
    text: 'Text',
    number: 'Number',
    select: 'Choice',
    checkbox: 'Checkbox',
};

//all columns of one owner, in the order they were placed
export async function listColumns(ownerEmail) {
    if (!ownerEmail) return [];

    const { data, error } = await db
        .from('custom_columns')
        .select('id, name, type, options, position')
        .eq('owner_email', ownerEmail)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    return data ?? [];
}

//adding a column at the end
export async function addColumn(ownerEmail, { name, type, options }) {
    const clean = String(name ?? '').trim().slice(0, 40);
    if (!clean) throw new Error('Column name is empty');

    const kind = COLUMN_TYPES.includes(type) ? type : 'text';

    //choice columns keep a short list of allowed values
    const list =
        kind === 'select' && Array.isArray(options)
            ? options.map((value) => String(value).trim()).filter(Boolean).slice(0, 20)
            : null;

    //new column goes after the current last one
    const existing = await listColumns(ownerEmail);
    const position = existing.length;

    const { data, error } = await db
        .from('custom_columns')
        .insert({ owner_email: ownerEmail, name: clean, type: kind, options: list, position })
        .select('id, name, type, options, position')
        .single();

    if (error) throw new Error(error.message);

    return data;
}

//removing a column, its values on meetings are left as ignored keys
export async function removeColumn(ownerEmail, columnId) {
    const { error } = await db
        .from('custom_columns')
        .delete()
        .eq('id', columnId)
        .eq('owner_email', ownerEmail);

    if (error) throw new Error(error.message);
}

//coercing an incoming value to the column type before it is stored
export function coerceValue(column, raw) {
    switch (column.type) {
        case 'number': {
            if (raw === '' || raw === null || raw === undefined) return null;
            const num = Number(raw);
            return Number.isFinite(num) ? num : null;
        }
        case 'checkbox':
            return raw === true || raw === 'true' || raw === 1 ? true : null;
        case 'select': {
            const value = String(raw ?? '').trim();
            //only a value the column actually offers is kept
            return value && (column.options ?? []).includes(value) ? value : null;
        }
        default: {
            const text = String(raw ?? '').trim();
            return text ? text.slice(0, 500) : null;
        }
    }
}

//setting one custom value on one meeting
//the whole custom_fields object is rewritten, so read it first
export async function setColumnValue(ownerEmail, meetingId, columnId, rawValue) {
    //the column must belong to this owner and exist
    const { data: column } = await db
        .from('custom_columns')
        .select('id, type, options')
        .eq('id', columnId)
        .eq('owner_email', ownerEmail)
        .maybeSingle();

    if (!column) throw new Error('Column not found');

    //the meeting must belong to this owner
    const { data: meeting } = await db
        .from('meetings')
        .select('custom_fields')
        .eq('id', meetingId)
        .eq('owner_email', ownerEmail)
        .maybeSingle();

    if (!meeting) throw new Error('Meeting not found');

    const value = coerceValue(column, rawValue);
    const fields = { ...(meeting.custom_fields ?? {}) };

    //null clears the cell instead of storing an empty value
    if (value === null) delete fields[columnId];
    else fields[columnId] = value;

    const { error } = await db
        .from('meetings')
        .update({ custom_fields: fields })
        .eq('id', meetingId)
        .eq('owner_email', ownerEmail);

    if (error) throw new Error(error.message);

    return { columnId, value };
}
