begin;

create extension if not exists pgcrypto;

create table if not exists public.todo_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  sort_order integer not null default 1000,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.todo_categories enable row level security;

drop policy if exists "Users can read own todo categories" on public.todo_categories;
create policy "Users can read own todo categories"
on public.todo_categories
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own todo categories" on public.todo_categories;
create policy "Users can insert own todo categories"
on public.todo_categories
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own todo categories" on public.todo_categories;
create policy "Users can update own todo categories"
on public.todo_categories
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own todo categories" on public.todo_categories;
create policy "Users can delete own todo categories"
on public.todo_categories
for delete
to authenticated
using ((select auth.uid()) = user_id);

alter table public.todos add column if not exists category_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'todos_category_id_fkey'
  ) then
    alter table public.todos
      add constraint todos_category_id_fkey
      foreign key (category_id)
      references public.todo_categories(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_todos_user_category_id on public.todos(user_id, category_id);

insert into public.todo_categories (user_id, name, is_default, sort_order)
select u.id, v.name, true, v.sort_order
from auth.users u
cross join (values ('İş', 0), ('Kişisel', 1), ('Günlük', 2)) as v(name, sort_order)
on conflict (user_id, name) do nothing;

insert into public.todo_categories (user_id, name, is_default, sort_order)
select distinct t.user_id, t.category, false, 1000
from public.todos t
where t.category is not null
  and btrim(t.category) <> ''
on conflict (user_id, name) do nothing;

update public.todos t
set category_id = c.id
from public.todo_categories c
where c.user_id = t.user_id
  and c.name = coalesce(nullif(t.category, ''), 'İş')
  and t.category_id is null;

update public.todos t
set category_id = c.id
from public.todo_categories c
where c.user_id = t.user_id
  and c.name = 'İş'
  and t.category_id is null;

do $$
declare
  rec record;
begin
  for rec in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'todos'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table public.todos drop constraint %I', rec.conname);
  end loop;
end
$$;

commit;
