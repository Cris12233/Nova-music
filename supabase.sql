-- Ejecuta este archivo completo en Supabase > SQL Editor.
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  audio_url text not null,
  audio_path text not null,
  cover_url text,
  cover_path text,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.artist_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.songs enable row level security;
alter table public.artist_admins enable row level security;

-- Cada administrador puede consultar su propia autorización.
create policy "Admins can read own admin record" on public.artist_admins
for select to authenticated
using (auth.uid() = user_id);

-- Cualquier visitante puede ver las canciones publicadas.
create policy "Public can read songs" on public.songs
for select using (true);

-- Solo usuarios añadidos a artist_admins pueden publicar, editar o borrar.
create policy "Admins can insert songs" on public.songs
for insert to authenticated
with check (
  auth.uid() = uploaded_by and
  exists (select 1 from public.artist_admins a where a.user_id = auth.uid())
);
create policy "Admins can update songs" on public.songs
for update to authenticated
using (exists (select 1 from public.artist_admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.artist_admins a where a.user_id = auth.uid()));
create policy "Admins can delete songs" on public.songs
for delete to authenticated
using (exists (select 1 from public.artist_admins a where a.user_id = auth.uid()));

-- Buckets públicos: el público puede reproducir y descargar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music','music',true,104857600,array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/aac','audio/ogg','audio/flac'])
on conflict (id) do update set public=true, file_size_limit=104857600;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers','covers',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=10485760;

create policy "Public can read music" on storage.objects
for select using (bucket_id in ('music','covers'));

create policy "Admins can upload music and covers" on storage.objects
for insert to authenticated
with check (
  bucket_id in ('music','covers') and
  (storage.foldername(name))[1] = auth.uid()::text and
  exists (select 1 from public.artist_admins a where a.user_id = auth.uid())
);
create policy "Admins can update their files" on storage.objects
for update to authenticated
using (
  bucket_id in ('music','covers') and
  (storage.foldername(name))[1] = auth.uid()::text and
  exists (select 1 from public.artist_admins a where a.user_id = auth.uid())
)
with check (
  bucket_id in ('music','covers') and
  (storage.foldername(name))[1] = auth.uid()::text and
  exists (select 1 from public.artist_admins a where a.user_id = auth.uid())
);
create policy "Admins can delete their files" on storage.objects
for delete to authenticated
using (
  bucket_id in ('music','covers') and
  (storage.foldername(name))[1] = auth.uid()::text and
  exists (select 1 from public.artist_admins a where a.user_id = auth.uid())
);
