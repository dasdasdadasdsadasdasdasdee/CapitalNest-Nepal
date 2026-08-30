-- Fix Storage RLS Policies for payment-proofs bucket
-- Allows authenticated users and service role to upload files
-- Note: Use Supabase Dashboard > Storage > Policies UI instead of SQL if you get permission errors

-- First, try to use the Supabase Storage policy UI:
-- 1. Go to Supabase Dashboard > Storage tab
-- 2. Select "payment-proofs" bucket
-- 3. Click "Policies" tab
-- 4. Remove any restrictive policies
-- 5. Add these new policies:

-- POLICY: Public Select (anyone can read)
-- SELECT USING: bucket_id = 'payment-proofs'
-- ✓ Target roles: anon, authenticated

-- POLICY: Authenticated Insert (users can upload)
-- INSERT WITH CHECK: bucket_id = 'payment-proofs' AND auth.role() = 'authenticated'
-- ✓ Target roles: authenticated

-- POLICY: Authenticated Update (users can modify their files)
-- UPDATE USING: bucket_id = 'payment-proofs' AND auth.role() = 'authenticated'
-- UPDATE WITH CHECK: bucket_id = 'payment-proofs' AND auth.role() = 'authenticated'
-- ✓ Target roles: authenticated

-- POLICY: Authenticated Delete (users can delete their files)
-- DELETE USING: bucket_id = 'payment-proofs' AND auth.role() = 'authenticated'
-- ✓ Target roles: authenticated

-- Alternative: If you have SQL permission, run this through Supabase CLI:
-- supabase db push

-- Fallback SQL (if you are project owner in SQL editor):
-- DROP POLICY IF EXISTS "Authenticated users can upload payment proofs" ON storage.objects;
-- DROP POLICY IF EXISTS "Payment proofs are publicly readable" ON storage.objects;
-- CREATE POLICY "payment_proofs_public_select" ON storage.objects FOR SELECT USING (bucket_id = 'payment-proofs');
-- CREATE POLICY "payment_proofs_authenticated_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payment-proofs' AND auth.role() = 'authenticated');
-- CREATE POLICY "payment_proofs_authenticated_update" ON storage.objects FOR UPDATE USING (bucket_id = 'payment-proofs') WITH CHECK (bucket_id = 'payment-proofs');
-- CREATE POLICY "payment_proofs_authenticated_delete" ON storage.objects FOR DELETE USING (bucket_id = 'payment-proofs');

-- Ensure bucket settings are correct (this should work without permission errors)
UPDATE storage.buckets
SET 
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/avif']
WHERE id = 'payment-proofs';
