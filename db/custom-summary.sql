-- a summary edited by hand, wins over the machine summary on screen
-- the original analysis stays untouched in the summary column
alter table meetings add column if not exists custom_summary text;
