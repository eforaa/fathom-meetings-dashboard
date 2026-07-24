-- a title set by hand or by an ai agent
-- wins over the analysis title and the raw fathom title on screen
-- one editable cell both a person and claude can write to
alter table meetings add column if not exists custom_title text;
