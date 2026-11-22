-- NOVA MUSIC · Funciones de comunidad y estadísticas
-- Ejecutar UNA SOLA VEZ en Supabase > SQL Editor.
-- No borra ni modifica las canciones existentes.
create or replace function public.is_nova_member_approved()
returns boolean language sql stable security definer set search_path = ''
as $$
 select public.is_nova_admin() or exists(select 1 from public.user_access ua where ua.user_id=auth.uid() and ua.status='approved');
$$;
revoke all on function public.is_nova_member_approved() from public;
grant execute on function public.is_nova_member_approved() to authenticated;

create table if not exists public.nova_song_events(
 id uuid primary key default gen_random_uuid(),
 song_id uuid not null references public.songs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null check(event_type in ('play','download')),
 created_at timestamptz not null default now()
);
create index if not exists nova_song_events_song_type_idx on public.nova_song_events(song_id,event_type);
create index if not exists nova_song_events_created_idx on public.nova_song_events(created_at desc);
alter table public.nova_song_events enable row level security;
grant select,insert on public.nova_song_events to authenticated;
drop policy if exists "Approved members record own song events" on public.nova_song_events;
create policy "Approved members record own song events" on public.nova_song_events for insert to authenticated with check(user_id=auth.uid() and public.is_nova_member_approved());
drop policy if exists "Admins read song events" on public.nova_song_events;
create policy "Admins read song events" on public.nova_song_events for select to authenticated using(public.is_nova_admin());

create table if not exists public.nova_listening_history(
 user_id uuid not null references auth.users(id) on delete cascade,
 song_id uuid not null references public.songs(id) on delete cascade,
 progress_seconds integer not null default 0 check(progress_seconds>=0),
 updated_at timestamptz not null default now(),
 primary key(user_id,song_id)
);
alter table public.nova_listening_history enable row level security;
grant select,insert,update on public.nova_listening_history to authenticated;
drop policy if exists "Members manage own listening history" on public.nova_listening_history;
create policy "Members manage own listening history" on public.nova_listening_history for all to authenticated using(user_id=auth.uid() and public.is_nova_member_approved()) with check(user_id=auth.uid() and public.is_nova_member_approved());

create table if not exists public.nova_song_comments(
 id uuid primary key default gen_random_uuid(),
 song_id uuid not null references public.songs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null default 'Miembro',
 body text not null check(char_length(body) between 1 and 1000),
 created_at timestamptz not null default now()
);
create index if not exists nova_song_comments_song_created_idx on public.nova_song_comments(song_id,created_at);
alter table public.nova_song_comments enable row level security;
grant select,insert,delete on public.nova_song_comments to authenticated;
drop policy if exists "Approved members read comments" on public.nova_song_comments;
create policy "Approved members read comments" on public.nova_song_comments for select to authenticated using(public.is_nova_member_approved());
drop policy if exists "Members add own comments" on public.nova_song_comments;
create policy "Members add own comments" on public.nova_song_comments for insert to authenticated with check(user_id=auth.uid() and public.is_nova_member_approved());
drop policy if exists "Members or admin delete comments" on public.nova_song_comments;
create policy "Members or admin delete comments" on public.nova_song_comments for delete to authenticated using(user_id=auth.uid() or public.is_nova_admin());

create table if not exists public.nova_song_reports(
 id uuid primary key default gen_random_uuid(),
 song_id uuid not null references public.songs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 reporter_name text not null default 'Miembro',
 reason text not null check(reason in ('audio','metadata','cover','content','other')),
 details text check(details is null or char_length(details)<=1000),
 status text not null default 'pending' check(status in ('pending','resolved')),
 created_at timestamptz not null default now(),
 resolved_at timestamptz
);
create index if not exists nova_song_reports_status_created_idx on public.nova_song_reports(status,created_at desc);
alter table public.nova_song_reports enable row level security;
grant select,insert,update on public.nova_song_reports to authenticated;
drop policy if exists "Members create own song reports" on public.nova_song_reports;
create policy "Members create own song reports" on public.nova_song_reports for insert to authenticated with check(user_id=auth.uid() and public.is_nova_member_approved());
drop policy if exists "Members read own reports and admins read all" on public.nova_song_reports;
create policy "Members read own reports and admins read all" on public.nova_song_reports for select to authenticated using(user_id=auth.uid() or public.is_nova_admin());
drop policy if exists "Admins resolve song reports" on public.nova_song_reports;
create policy "Admins resolve song reports" on public.nova_song_reports for update to authenticated using(public.is_nova_admin()) with check(public.is_nova_admin());

create table if not exists public.nova_notifications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 song_id uuid references public.songs(id) on delete cascade,
 title text not null,body text not null,created_at timestamptz not null default now(),read_at timestamptz
);
create index if not exists nova_notifications_user_created_idx on public.nova_notifications(user_id,created_at desc);
alter table public.nova_notifications enable row level security;
grant select,update on public.nova_notifications to authenticated;
drop policy if exists "Members read own notifications" on public.nova_notifications;
create policy "Members read own notifications" on public.nova_notifications for select to authenticated using(user_id=auth.uid() and public.is_nova_member_approved());
drop policy if exists "Members mark own notifications read" on public.nova_notifications;
create policy "Members mark own notifications read" on public.nova_notifications for update to authenticated using(user_id=auth.uid() and public.is_nova_member_approved()) with check(user_id=auth.uid() and public.is_nova_member_approved());

create or replace function public.nova_notify_members_new_song()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.is_published is true then
  insert into public.nova_notifications(user_id,song_id,title,body)
  select ua.user_id,new.id,'Nueva canción en NOVA MUSIC',coalesce(new.title,'Una nueva canción')||' ya está disponible para escuchar.'
  from public.user_access ua where ua.status='approved';
 end if;
 return new;
end;
$$;
drop trigger if exists nova_song_published_notification on public.songs;
create trigger nova_song_published_notification after insert on public.songs for each row execute function public.nova_notify_members_new_song();
