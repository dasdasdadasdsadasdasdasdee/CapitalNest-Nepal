-- Check if deposits table exists and show its schema
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='deposits'
ORDER BY ordinal_position;

-- Check RLS policies on deposits
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'deposits';