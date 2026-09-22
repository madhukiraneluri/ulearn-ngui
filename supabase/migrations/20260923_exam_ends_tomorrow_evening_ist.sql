-- Extend recruitment exam windows to tomorrow end of day IST (23:59:59 IST = 18:29:59 UTC on 2026-09-23)
UPDATE public.exams
SET
  ends_at = '2026-09-23T18:29:59+00'::timestamptz,
  updated_at = now()
WHERE recruitment_slug IS NOT NULL
  AND recruitment_slug <> 'test-assessment-madhu';

-- In-progress attempts: align attempt deadline with extended exam window
UPDATE public.exam_attempts ea
SET ends_at = e.ends_at
FROM public.exams e
WHERE ea.exam_id = e.id
  AND ea.status = 'in_progress'
  AND e.recruitment_slug IS NOT NULL
  AND e.recruitment_slug <> 'test-assessment-madhu'
  AND ea.ends_at < e.ends_at;
