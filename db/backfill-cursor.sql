-- resumable full-archive download, one cursor per account
-- cursor is saved after every fathom page, so a timeout loses nothing
alter table fathom_accounts add column if not exists backfill_cursor text;
alter table fathom_accounts add column if not exists backfill_done boolean default false;
