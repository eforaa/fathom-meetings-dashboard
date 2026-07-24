//column type constants, safe to import from client components
//kept apart from columns.js so the client never pulls in the db module

//column types a person can pick
export const COLUMN_TYPES = ['text', 'number', 'select', 'checkbox'];

//readable name of every type, for the dropdown
export const COLUMN_TYPE_LABELS = {
    text: 'Text',
    number: 'Number',
    select: 'Choice',
    checkbox: 'Checkbox',
};
