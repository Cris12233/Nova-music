-- NOVA MUSIC: acceso por membresía aprobada
-- Ejecuta este archivo UNA SOLA VEZ en Supabase > SQL Editor.
-- No elimina ni modifica las canciones existentes.

create table if not exists public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_access enable row level security;

grant select, update on public.user_access to authenticated;

-- Comprueba el rol admin sin depender de permisos/RLS directos sobre artist_admins.
create or replace function public.is_nova_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as 'select exists (select 1 from public.artist_admins a where a.user_id = auth.uid())';
revoke all on function public.is_nova_admin() from public;
grant execute on function public.is_nova_admin() to authenticated;

drop policy if exists "Users can read own access status" on public.user_access;
create policy "Users can read own access status"
on public.user_access for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can read all access requests" on public.user_access;
create policy "Admins can read all access requests"
on public.user_access for select to authenticated
using (
  public.is_nova_admin()
);

drop policy if exists "Admins can update access requests" on public.user_access;
create policy "Admins can update access requests"
on public.user_access for update to authenticated
using (public.is_nova_admin())
with check (public.is_nova_admin());

create or replace function public.create_pending_user_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_access (user_id, email, display_name, status)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    'pending'
  )
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, public.user_access.display_name);
  return new;
end;
$$;

drop trigger if exists nova_create_pending_user_access on auth.users;
create trigger nova_create_pending_user_access
after insert on auth.users
for each row execute function public.create_pending_user_access();

-- Las cuentas existentes que no son administradoras también empiezan pendientes.
insert into public.user_access (user_id, email, display_name, status)
select
  u.id,
  coalesce(u.email, ''),
  nullif(u.raw_user_meta_data ->> 'display_name', ''),
  'pending'
from auth.users u
where not exists (
  select 1 from public.artist_admins a where a.user_id = u.id
)
on conflict (user_id) do nothing;

-- Las canciones existentes conservan is_published=true.
alter table public.songs
  add column if not exists is_published boolean not null default true;

-- Restringir el catálogo: solo miembros aprobados y administradores.
drop policy if exists "Public can read songs" on public.songs;
drop policy if exists "Public can read published songs" on public.songs;
drop policy if exists "Approved members and admins can read published songs" on public.songs;

-- Retira cualquier otra política SELECT pública/anon que pudiera seguir abriendo el catálogo.
do $migration$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'songs'
      and cmd = 'SELECT'
      and ('public' = any(roles) or 'anon' = any(roles))
  loop
    execute format('drop policy %I on public.songs', existing_policy.policyname);
  end loop;
end;
$migration$;

create policy "Approved members and admins can read published songs"
on public.songs for select to authenticated
using (
  is_published = true
  and (
    exists (
      select 1 from public.user_access u
      where u.user_id = auth.uid() and u.status = 'approved'
    )
    or public.is_nova_admin()
  )
);

-- Asegurar que solo sesiones autenticadas puedan consultar el catálogo.
revoke select on public.songs from public;
revoke select on public.songs from anon;
grant select on public.songs to authenticated;

-- El bucket de audio también queda privado por si existen archivos antiguos allí.
update storage.buckets
set public = false
where id = 'music';

drop policy if exists "Public can read music" on storage.objects;
drop policy if exists "Approved members can read music" on storage.objects;
create policy "Approved members can read music"
on storage.objects for select to authenticated
using (
  bucket_id = 'music'
  and (
    exists (
      select 1 from public.user_access u
      where u.user_id = auth.uid() and u.status = 'approved'
    )
    or public.is_nova_admin()
  )
);

-- Las solicitudes no pueden cambiar su propio estado: solo el panel admin.
-- El estado pending se crea automáticamente mediante el trigger de auth.users.
