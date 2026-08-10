create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  invited_email text,
  token_hash text not null unique,
  status text not null default 'open'
    check (status in ('open', 'claimed', 'accepted', 'failed', 'revoked')),
  claimed_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (invited_email is null or invited_email = lower(invited_email)),
  check (expires_at > created_at)
);

create index invitations_created_by_recent_idx
  on public.invitations (created_by, created_at desc);
create index invitations_open_expiry_idx
  on public.invitations (expires_at)
  where status = 'open';

alter table public.invitations enable row level security;

grant select on public.invitations to authenticated;

create policy "invitations_select_created_or_claimed" on public.invitations
for select to authenticated
using (
  (select auth.uid()) = created_by
  or (select auth.uid()) = claimed_by
);

comment on table public.invitations is
  'Single-use account invitations. Only SHA-256 hashes of invite tokens are stored.';
