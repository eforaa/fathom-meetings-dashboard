-- notes written by claude through the mcp connector
-- kept separate from the machine analysis so they never overwrite each other
alter table meetings add column if not exists notes text;
alter table meetings add column if not exists notes_updated_at timestamptz;
