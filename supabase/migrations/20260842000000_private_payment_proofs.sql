-- Keep payment proofs private; server-side signed URLs and authenticated admin access remain supported.
update storage.buckets
set public = false
where id = 'payment-proofs';

drop policy if exists "Payment proofs are publicly readable" on storage.objects;
drop policy if exists "payment_proofs_public_select" on storage.objects;

create policy "Authenticated users can read payment proofs"
on storage.objects for select
to authenticated
using (bucket_id = 'payment-proofs');
