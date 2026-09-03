-- Run this in the Supabase SQL Editor and paste the full output back.
-- Read-only — does not modify anything.
-- Everything is bundled into ONE result row (as JSON) so the SQL Editor's
-- "only shows the last statement's result" behavior doesn't hide anything.

select jsonb_build_object(
  'columns', (
    select jsonb_agg(jsonb_build_object(
      'table', table_name, 'column', column_name, 'type', data_type,
      'nullable', is_nullable, 'default', column_default
    ) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
  ),
  'check_constraints', (
    select jsonb_agg(jsonb_build_object(
      'table', conrelid::regclass::text, 'name', conname, 'definition', pg_get_constraintdef(oid)
    ) order by conrelid::regclass::text)
    from pg_constraint
    where contype = 'c' and connamespace = 'public'::regnamespace
  ),
  'rls_policies', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'policy', policyname, 'cmd', cmd, 'using', qual, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object(
      'table', event_object_table, 'trigger', trigger_name,
      'timing', action_timing, 'event', event_manipulation, 'statement', action_statement
    ) order by event_object_table, trigger_name)
    from information_schema.triggers
    where trigger_schema = 'public'
  ),
  'functions', (
    select jsonb_agg(proname order by proname)
    from pg_proc
    where pronamespace = 'public'::regnamespace
  ),
  'rls_enabled', (
    select jsonb_agg(jsonb_build_object('table', relname, 'rls_enabled', relrowsecurity) order by relname)
    from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r'
  ),
  'notification_types', (
    select jsonb_agg(jsonb_build_object('type', type, 'count', count))
    from (select type, count(*) from notifications group by type order by type) t
  )
) as full_schema;
