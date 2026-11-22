-- NOVA MUSIC 2.0 · migración aditiva de perfiles, reacciones y auditoría
-- No elimina ni modifica canciones, metadatos existentes ni archivos de MEGA.
-- Ejecutar una sola vez en Supabase SQL Editor.

create table if not exists public.nova_artist_profiles (
  artist_name text primary key,
  bio text not null default '',
  genre text not null default '',
  avatar_url text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nova_artist_profiles_updated_at_idx
  on public.nova_artist_profiles(updated_at desc);

alter table public.nova_artist_profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nova_artist_profiles' and policyname='NOVA approved members read artist profiles') then
    create policy "NOVA approved members read artist profiles"
      on public.nova_artist_profiles for select to authenticated
      using (public.is_nova_member_approved() or public.is_nova_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nova_artist_profiles' and policyname='NOVA admin manages artist profiles') then
    create policy "NOVA admin manages artist profiles"
      on public.nova_artist_profiles for all to authenticated
      using (public.is_nova_admin())
      with check (public.is_nova_admin());
  end if;
end $$;

grant select, insert, update, delete on public.nova_artist_profiles to authenticated;

create table if not exists public.nova_comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.nova_song_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint nova_comment_likes_comment_user_unique unique(comment_id,user_id)
);

create index if not exists nova_comment_likes_comment_idx
  on public.nova_comment_likes(comment_id);

alter table public.nova_comment_likes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nova_comment_likes' and policyname='NOVA approved members read comment likes') then
    create policy "NOVA approved members read comment likes"
      on public.nova_comment_likes for select to authenticated
      using (public.is_nova_member_approved() or public.is_nova_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nova_comment_likes' and policyname='NOVA members like comments as themselves') then
    create policy "NOVA members like comments as themselves"
      on public.nova_comment_likes for insert to authenticated
      with check (user_id = auth.uid() and public.is_nova_member_approved());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nova_comment_likes' and policyname='NOVA members remove own comment likes') then
    create policy "NOVA members remove own comment likes"
      on public.nova_comment_likes for delete to authenticated
      using (user_id = auth.uid() or public.is_nova_admin());
  end if;
end $$;

grant select, insert, delete on public.nova_comment_likes to authenticated;

create table if not exists public.nova_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists nova_admin_audit_log_created_at_idx
  on public.nova_admin_audit_log(created_at desc);

alter table public.nova_admin_audit_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nova_admin_audit_log' and policyname='NOVA admins read audit log') then
    create policy "NOVA admins read audit log"
      on public.nova_admin_audit_log for select to authenticated
      using (public.is_nova_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nova_admin_audit_log' and policyname='NOVA admins write audit log') then
    create policy "NOVA admins write audit log"
      on public.nova_admin_audit_log for insert to authenticated
      with check (public.is_nova_admin() and admin_user_id = auth.uid());
  end if;
end $$;

grant select, insert on public.nova_admin_audit_log to authenticated;


-- Permite al administrador revocar un dispositivo individual sin expulsar los demás.
create or replace function public.nova_admin_revoke_device(p_user_id uuid, p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $
declare
  affected integer;
begin
  if not public.is_nova_admin() then
    raise exception 'not_authorized';
  end if;
  update public.nova_device_sessions
     set revoked_at = now()
   where user_id = p_user_id
     and device_id = p_device_id
     and revoked_at is null;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$;

revoke all on function public.nova_admin_revoke_device(uuid, uuid) from public, anon;
grant execute on function public.nova_admin_revoke_device(uuid, uuid) to authenticated;

-- Habilita notificaciones en tiempo real sin duplicar la tabla en la publicación.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='nova_notifications'
     ) then
    alter publication supabase_realtime add table public.nova_notifications;
  end if;
end $$;
