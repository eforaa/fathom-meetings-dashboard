//column type constants, safe to import from client components
//kept apart from columns.js so the client never pulls in the db module

//column types a person can pick
export const COLUMN_TYPES = ['text', 'number', 'select', 'multiselect', 'checkbox'];

//readable names live in the dictionaries under columnType.*, so the dropdown
//follows the chosen language

//types that keep a list of allowed values (options)
export const OPTION_TYPES = ['select', 'multiselect'];

//what a value must look like before it is stored in a cell.
//
//Two callers write here and they behave nothing alike: the interface sends
//clean values from its own pickers, while Claude sends whatever the
//conversation produced — a number as text, a tag list as "a, b", or an option
//the column never offered. This is the one place that decides, and it lives
//with the constants rather than in columns.js so it can be exercised without a
//database.
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
        case 'multiselect': {
            //accept an array (from the UI) or a comma/tilde string (from Claude)
            const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,~]/);
            const allowed = column.options ?? [];
            const kept = [];
            for (const item of list) {
                const value = String(item ?? '').trim();
                //keep only offered values, no duplicates
                if (value && allowed.includes(value) && !kept.includes(value)) kept.push(value);
            }
            return kept.length ? kept : null;
        }
        default: {
            const text = String(raw ?? '').trim();
            return text ? text.slice(0, 500) : null;
        }
    }
}
