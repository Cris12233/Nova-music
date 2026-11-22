-- NOVA MUSIC · permisos individuales de descarga
-- Todas las cuentas existentes y futuras comienzan sin permiso de descarga.
-- No modifica canciones, metadatos ni archivos de MEGA.

alter table public.user_access
  add column if not exists download_enabled boolean not null default false;

update public.user_access
   set download_enabled = false
 where download_enabled is null;
