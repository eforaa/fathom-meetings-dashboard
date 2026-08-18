//column type constants, safe to import from client components
//kept apart from columns.js so the client never pulls in the db module

//column types a person can pick
export const COLUMN_TYPES = ['text', 'number', 'select', 'multiselect', 'checkbox'];

//readable names live in the dictionaries under columnType.*, so the dropdown
//follows the chosen language

//types that keep a list of allowed values (options)
export const OPTION_TYPES = ['select', 'multiselect'];
