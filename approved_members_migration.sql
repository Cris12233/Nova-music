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

drop policy if exists "Users can read own access status" on public.user_access;
create policy "Users can read own access status"
on public.user_access for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can read all access requests" on public.user_access;
create policy "Admins can read all access requests"
on public.user_access for select to authenticated
using (
  exists (
    select 1 from public.artist_admins a
    where a.user_id = auth.uid()
  )
);

drop policy if exists "Admins can update access requests" on public.user_access;
create policy "Admins can update access requests"
on public.user_access for update to authenticated
using (
  exists (
    select 1 from public.artist_admins a
    where a.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.artist_admins a
    where a.user_id = auth.uid()
  )
);

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

-- Las canciones existentes conservan is_published=true.
alter table public.songs
  add column if not exists is_published boolean not null default true;

-- Restringir el catálogo: solo miembros aprobados y administradores.
drop policy if exists "Public can read songs" on public.songs;
drop policy if exists "Public can read published songs" on public.songs;
drop policy if exists "Approved members and admins can read published songs" on public.songs;
create policy "Approved members and admins can read published songs"
on public.songs for select to authenticated
using (
  is_published = true
  and (
    exists (
      select 1 from public.user_access u
      where u.user_id = auth.uid() and u.status = 'approved'
    )
    or exists (
      select 1 from public.artist_admins a
      where a.user_id = auth.uid()
    )
  )
);

-- Asegurar que el cliente autenticado pueda consultar el catálogo sujeto a RLS.
grant select on public.songs to authenticated;

-- Las solicitudes no pueden cambiar su propio estado: solo el panel admin.
-- El estado pending se crea automáticamente mediante el trigger de auth.users.
