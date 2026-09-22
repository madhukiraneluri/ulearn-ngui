-- Extend recruitment exam windows to midnight IST on exam day (23:59:59 IST = 18:29:59 UTC same calendar date in UTC storage)
UPDATE public.exams
SET
  ends_at = '2026-09-22T18:29:59+00'::timestamptz,
  updated_at = now()
WHERE recruitment_slug IS NOT NULL
  AND recruitment_slug <> 'test-assessment-madhu';
