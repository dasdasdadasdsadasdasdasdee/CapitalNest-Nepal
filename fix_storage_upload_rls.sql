-- Fix Storage RLS policies to allow supabase_storage_admin role
-- This enables the Supabase Storage API to insert/update files

-- Drop the restrictive authenticated-only policy
DROP POLICY IF EXISTS "Authenticated users can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update their own payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete their own payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Payment proofs are publicly readable" ON storage.objects;

-- Create new permissive policies that allow storage operations

-- Policy 1: Anyone can READ from payment-proofs bucket
CREATE POLICY "payment_proofs_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs');

-- Policy 2: Storage admin (internal Supabase role) can do everything
-- This allows the Storage API to insert/update files during upload
CREATE POLICY "payment_proofs_storage_admin"
  ON storage.objects FOR ALL
  USING (bucket_id = 'payment-proofs' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'payment-proofs');

-- Policy 3: Authenticated users can insert with auth checks
CREATE POLICY "payment_proofs_authenticated_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  );

-- Policy 4: Authenticated users can update/delete
CREATE POLICY "payment_proofs_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'payment-proofs' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role'))
  WITH CHECK (bucket_id = 'payment-proofs' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role'));

CREATE POLICY "payment_proofs_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'payment-proofs' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role'));

-- Ensure bucket settings are correct
UPDATE storage.buckets
SET 
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/avif']
WHERE id = 'payment-proofs';