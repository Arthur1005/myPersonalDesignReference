-- Design Orbit: visitor comments.
-- Paste this whole file into Supabase → SQL Editor → New query, change the
-- passphrase on the last line to something long that only you know, then Run.

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  entry       text not null check (char_length(entry) between 1 and 200),   -- "date|title" of the panel
  name        text check (name is null or char_length(name) <= 40),
  body        text not null check (char_length(body) between 1 and 1000),
  approved    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists comments_entry_idx on public.comments (entry, created_at);

-- Your moderation passphrase lives here. Nobody can read this table from the site.
create table if not exists public.comment_admin (key text primary key);

alter table public.comments enable row level security;
alter table public.comment_admin enable row level security;

revoke all on public.comments from anon, authenticated;
revoke all on public.comment_admin from anon, authenticated;
grant select on public.comments to anon, authenticated;
grant insert (entry, name, body) on public.comments to anon, authenticated;

drop policy if exists "read approved comments" on public.comments;
create policy "read approved comments" on public.comments
  for select to anon, authenticated using (approved);

drop policy if exists "submit a comment for approval" on public.comments;
create policy "submit a comment for approval" on public.comments
  for insert to anon, authenticated with check (approved = false);

-- Moderation (used by the site when you're unlocked): needs your passphrase.
create or replace function public.pending_comments(secret text)
returns setof public.comments
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.comment_admin a where a.key = secret) then
    raise exception 'wrong passphrase';
  end if;
  return query select c.* from public.comments c where not c.approved order by c.created_at;
end;
$$;

create or replace function public.moderate_comment(secret text, comment_id uuid, action text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.comment_admin a where a.key = secret) then
    raise exception 'wrong passphrase';
  end if;
  if action = 'approve' then
    update public.comments set approved = true where id = comment_id;
  elsif action = 'delete' then
    delete from public.comments where id = comment_id;
  else
    raise exception 'unknown action';
  end if;
end;
$$;

grant execute on function public.pending_comments(text) to anon, authenticated;
grant execute on function public.moderate_comment(text, uuid, text) to anon, authenticated;

-- CHANGE THIS to your own long passphrase before running:
insert into public.comment_admin (key) values ('change-me-to-a-long-passphrase')
  on conflict do nothing;
