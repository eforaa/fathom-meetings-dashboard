//column type constants, safe to import from client components
//kept apart from columns.js so the client never pulls in the db module

//column types a person can pick
export const COLUMN_TYPES = ['text', 'number', 'select', 'multiselect', 'checkbox'];

//readable name of every type, for the dropdown
export const COLUMN_TYPE_LABELS = {
    text: 'Text',
    number: 'Number',
    select: 'Choice',
    multiselect: 'Tags',
    checkbox: 'Checkbox',
};

//types that keep a list of allowed values (options)
export const OPTION_TYPES = ['select', 'multiselect'];
