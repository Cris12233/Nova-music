-- Ejecuta este archivo UNA SOLA VEZ en Supabase > SQL Editor.
-- Añade el campo de álbum sin borrar las canciones existentes.
alter table public.songs
  add column if not exists album text;

-- Comprueba que la política pública solo muestre canciones publicadas.
-- Todas las canciones existentes quedan publicadas por el valor predeterminado.
alter table public.songs
  add column if not exists is_published boolean not null default true;

drop policy if exists "Public can read songs" on public.songs;
drop policy if exists "Public can read published songs" on public.songs;
create policy "Public can read published songs"
on public.songs
for select
using (is_published = true);

-- Permite también el MIME que algunos navegadores Android asignan a M4A.
update storage.buckets
set allowed_mime_types = array[
  'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4',
  'audio/x-m4a','audio/aac','audio/ogg','audio/flac'
]
where id = 'music';
