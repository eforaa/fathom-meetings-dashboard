-- short readable title taken from the "meeting purpose" line of fathom's summary
-- used when our own ai title is not there yet, instead of a generic zoom title
alter table meetings add column if not exists fathom_title text;
