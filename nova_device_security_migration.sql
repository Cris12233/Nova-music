-- NOVA MUSIC: límite de 2 dispositivos simultáneos por miembro
-- Ejecutar una sola vez en Supabase SQL Editor después de revisar el PR.
-- No modifica canciones, archivos MEGA ni datos históricos.

alter table public.user_access add column if not exists suspension_reason text;

create table if not exists public.nova_device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, device_id)
);

create index if not exists nova_device_sessions_user_active_idx
  on public.nova_device_sessions (user_id, last_seen desc)
  where revoked_at is null;

alter table public.nova_device_sessions enable row level security;
revoke all on public.nova_device_sessions from public, anon;
grant select on public.nova_device_sessions to authenticated;

drop policy if exists "Members can read own device sessions" on public.nova_device_sessions;
create policy "Members can read own device sessions"
on public.nova_device_sessions for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can read all device sessions" on public.nova_device_sessions;
create policy "Admins can read all device sessions"
on public.nova_device_sessions for select to authenticated
using (public.is_nova_admin());

create or replace function public.nova_register_device(
  p_device_id uuid,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_count integer;
  v_existing boolean;
begin
  if v_user_id is null or p_device_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;

  if exists (
    select 1 where public.is_nova_admin()
  ) then
    return jsonb_build_object('ok', true, 'admin', true, 'active_devices', 0);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select ua.status into v_status
  from public.user_access ua
  where ua.user_id = v_user_id
  for update;

  if v_status is distinct from 'approved' then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_status, 'not_approved'));
  end if;

  delete from public.nova_device_sessions
  where user_id = v_user_id
    and (revoked_at is not null or last_seen < now() - interval '3 minutes');

  select exists (
    select 1 from public.nova_device_sessions ds
    where ds.user_id = v_user_id
      and ds.device_id = p_device_id
      and ds.revoked_at is null
  ) into v_existing;

  if v_existing then
    update public.nova_device_sessions
    set last_seen = now(),
        device_label = left(coalesce(nullif(trim(p_device_label), ''), device_label), 120)
    where user_id = v_user_id and device_id = p_device_id and revoked_at is null;
  else
    select count(*) into v_count
    from public.nova_device_sessions ds
    where ds.user_id = v_user_id and ds.revoked_at is null;

    if v_count >= 2 then
      update public.user_access
      set status = 'suspended', suspension_reason = 'device_limit_exceeded', updated_at = now()
      where user_id = v_user_id;

      return jsonb_build_object(
        'ok', false,
        'reason', 'device_limit_exceeded',
        'active_devices', v_count,
        'approval_required', true
      );
    end if;

    insert into public.nova_device_sessions(user_id, device_id, device_label)
    values (v_user_id, p_device_id, left(nullif(trim(p_device_label), ''), 120));
  end if;

  select count(*) into v_count
  from public.nova_device_sessions ds
  where ds.user_id = v_user_id and ds.revoked_at is null;

  return jsonb_build_object('ok', true, 'active_devices', v_count, 'limit', 2);
end;
$$;

revoke all on function public.nova_register_device(uuid, text) from public;
grant execute on function public.nova_register_device(uuid, text) to authenticated;

create or replace function public.nova_touch_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_device_id is null then
    return false;
  end if;

  if exists (
    select 1 where public.is_nova_admin()
  ) then
    return true;
  end if;

  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = v_user_id and ua.status = 'approved'
  ) then
    return false;
  end if;

  update public.nova_device_sessions
  set last_seen = now()
  where user_id = v_user_id
    and device_id = p_device_id
    and revoked_at is null;

  return found;
end;
$$;

revoke all on function public.nova_touch_device(uuid) from public;
grant execute on function public.nova_touch_device(uuid) to authenticated;


-- Al volver a aprobar una cuenta, el administrador reinicia sus dispositivos.
create or replace function public.nova_admin_clear_devices(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_deleted integer;
begin
  if not public.is_nova_admin() then
    raise exception 'admin_required';
  end if;

  delete from public.nova_device_sessions
  where user_id = p_user_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.nova_admin_clear_devices(uuid) from public;
grant execute on function public.nova_admin_clear_devices(uuid) to authenticated;
