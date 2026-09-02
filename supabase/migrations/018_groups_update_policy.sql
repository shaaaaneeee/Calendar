-- Allows a group's owner (creator) to rename it or change its colour.
-- No UPDATE policy existed on `groups` before this migration — RLS
-- defaults to deny, so every update attempt was silently rejected.

create policy "groups: updatable by owner"
  on groups for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);
