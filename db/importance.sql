-- user-set importance, 0 means unrated, 1..5 stars
-- editable by the owner, unlike the fathom-made fields
alter table meetings add column if not exists importance smallint not null default 0;
