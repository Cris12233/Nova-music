-- NOVA MUSIC · Alertas de actividad sospechosa durante reproducción
-- Esta tabla no modifica canciones, archivos MEGA, permisos ni membresías.

create table if not exists public.nova_security_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null default '',
  song_id uuid references public.songs(id) on delete set null,
  song_title text not null default 'Canción no identificada',
  reason text not null,
  created_at timestamptz not null default now(),
  reviewed boolean not null default false
);

create index if not exists nova_security_alerts_created_idx
  on public.nova_security_alerts (created_at desc);

alter table public.nova_security_alerts enable row level security;
revoke all on public.nova_security_alerts from public, anon;
grant select, insert on public.nova_security_alerts to authenticated;

drop policy if exists "Approved members can submit own security alerts" on public.nova_security_alerts;
create policy "Approved members can submit own security alerts"
on public.nova_security_alerts for insert to authenticated
with check (
  user_id = auth.uid()
  and public.is_nova_member_approved()
);

drop policy if exists "Admins read security alerts" on public.nova_security_alerts;
create policy "Admins read security alerts"
on public.nova_security_alerts for select to authenticated
using (public.is_nova_admin());
