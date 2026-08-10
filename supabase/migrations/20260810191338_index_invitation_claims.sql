create index invitations_claimed_by_idx
  on public.invitations (claimed_by)
  where claimed_by is not null;
