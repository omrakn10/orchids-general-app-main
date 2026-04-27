alter table if exists public.todo_categories
add column if not exists color text;

update public.todo_categories
set color = case
  when color ~ '^#[0-9A-Fa-f]{6}$' then lower(color)
  when name = 'İş' then '#0f766e'
  when name = 'Kişisel' then '#7c3aed'
  when name = 'Günlük' then '#2563eb'
  else '#0f766e'
end;

alter table public.todo_categories
alter column color set default '#0f766e';

alter table public.todo_categories
alter column color set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'todo_categories_color_hex_check'
  ) then
    alter table public.todo_categories
      add constraint todo_categories_color_hex_check
      check (color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;
