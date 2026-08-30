-- Check the exact RLS policy conditions
SELECT 
  schemaname, 
  tablename, 
  policyname,
  permissive,
  roles,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'deposits'
ORDER BY policyname;