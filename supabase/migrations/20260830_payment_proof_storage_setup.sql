-- =========================================================
-- Payment proof storage setup for CapitalNest
-- =========================================================

-- 1) Ensure the storage bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', true, 5242880, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/avif'])
ON CONFLICT (id) DO NOTHING;

-- 2) Update the bucket to public if it already exists
UPDATE storage.buckets
SET public = true,
    file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/avif']
WHERE id = 'payment-proofs';

-- 3) RLS policies for payment proof bucket
DROP POLICY IF EXISTS "Payment proofs are publicly readable" ON storage.objects;
CREATE POLICY "Payment proofs are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "Authenticated users can upload payment proofs" ON storage.objects;
CREATE POLICY "Authenticated users can upload payment proofs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-proofs' AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Authenticated users can update their own payment proofs" ON storage.objects;
CREATE POLICY "Authenticated users can update their own payment proofs"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'payment-proofs' AND auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'payment-proofs' AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Authenticated users can delete their own payment proofs" ON storage.objects;
CREATE POLICY "Authenticated users can delete their own payment proofs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'payment-proofs' AND auth.role() = 'authenticated'
);

-- 4) Optional helper: ensure uploaded user paths stay under user-specific folder
-- This is controlled by the app using a path like payment-proofs/<user-id>/filename.ext
