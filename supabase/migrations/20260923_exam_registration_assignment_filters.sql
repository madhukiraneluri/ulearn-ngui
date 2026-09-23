-- Multiple-roles tracking + portal filters (assignment type & multi-exam email)

ALTER TABLE public.exam_registrations
  ADD COLUMN IF NOT EXISTS from_multiple_roles boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_exam_registrations_from_multiple_roles
  ON public.exam_registrations (from_multiple_roles)
  WHERE from_multiple_roles;

-- Heuristic backfill: non-technical multi-exam bundles from recruitment import
WITH multi_email AS (
  SELECT email
  FROM public.exam_registrations
  WHERE role_slug IN (
    'business-development-executive',
    'associate-lead-generation-specialist',
    'relationship-executive'
  )
  GROUP BY email
  HAVING count(DISTINCT exam_id) >= 2
)
UPDATE public.exam_registrations er
SET from_multiple_roles = true
FROM multi_email m
WHERE er.email = m.email
  AND er.role_slug IN (
    'business-development-executive',
    'associate-lead-generation-specialist',
    'relationship-executive'
  );

CREATE OR REPLACE FUNCTION public.admin_exam_portal_matching_emails(
  p_role_slug text DEFAULT NULL,
  p_exam_id uuid DEFAULT NULL,
  p_multi_exam_filter text DEFAULT 'all'
)
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_multi_exam_filter IS NULL OR p_multi_exam_filter = 'all' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT er.email, er.exam_id, er.from_multiple_roles
    FROM public.exam_registrations er
    WHERE (p_role_slug IS NULL OR er.role_slug = p_role_slug)
      AND (p_exam_id IS NULL OR er.exam_id = p_exam_id)
  ),
  by_email AS (
    SELECT
      email,
      count(DISTINCT exam_id)::int AS exam_count,
      bool_or(NOT from_multiple_roles) AS has_non_multi_row
    FROM base
    GROUP BY email
  )
  SELECT be.email
  FROM by_email be
  WHERE
    (p_multi_exam_filter = 'multi-exam' AND be.exam_count >= 2)
    OR (
      p_multi_exam_filter = 'multi-exam-other'
      AND be.exam_count >= 2
      AND be.has_non_multi_row
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_exam_portal_stats(
  p_role_slug text DEFAULT NULL,
  p_exam_id uuid DEFAULT NULL,
  p_assignment_filter text DEFAULT 'all',
  p_multi_exam_filter text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registrations bigint;
  v_submitted bigint;
  v_not_started bigint;
  v_in_progress bigint;
  v_not_provisioned bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT count(*) INTO v_registrations
  FROM public.exam_registrations er
  WHERE (p_role_slug IS NULL OR er.role_slug = p_role_slug)
    AND (p_exam_id IS NULL OR er.exam_id = p_exam_id)
    AND (
      p_assignment_filter IS NULL
      OR p_assignment_filter = 'all'
      OR (p_assignment_filter = 'multiple-roles' AND er.from_multiple_roles)
      OR (p_assignment_filter = 'single-role' AND NOT er.from_multiple_roles)
    )
    AND (
      p_multi_exam_filter IS NULL
      OR p_multi_exam_filter = 'all'
      OR er.email IN (
        SELECT public.admin_exam_portal_matching_emails(
          p_role_slug,
          p_exam_id,
          p_multi_exam_filter
        )
      )
    );

  SELECT count(*) INTO v_submitted
  FROM public.exam_results r
  WHERE (p_role_slug IS NULL OR r.role_slug = p_role_slug)
    AND (p_exam_id IS NULL OR r.exam_id = p_exam_id)
    AND (
      p_assignment_filter IS NULL
      OR p_assignment_filter = 'all'
      OR EXISTS (
        SELECT 1
        FROM public.exam_registrations er
        WHERE er.email = r.student_email
          AND er.exam_id = r.exam_id
          AND (
            (p_assignment_filter = 'multiple-roles' AND er.from_multiple_roles)
            OR (p_assignment_filter = 'single-role' AND NOT er.from_multiple_roles)
          )
      )
    )
    AND (
      p_multi_exam_filter IS NULL
      OR p_multi_exam_filter = 'all'
      OR r.student_email IN (
        SELECT public.admin_exam_portal_matching_emails(
          p_role_slug,
          p_exam_id,
          p_multi_exam_filter
        )
      )
    );

  SELECT count(*) INTO v_not_started
  FROM public.exam_registrations er
  WHERE er.user_id IS NOT NULL
    AND er.exam_id IS NOT NULL
    AND (p_role_slug IS NULL OR er.role_slug = p_role_slug)
    AND (p_exam_id IS NULL OR er.exam_id = p_exam_id)
    AND (
      p_assignment_filter IS NULL
      OR p_assignment_filter = 'all'
      OR (p_assignment_filter = 'multiple-roles' AND er.from_multiple_roles)
      OR (p_assignment_filter = 'single-role' AND NOT er.from_multiple_roles)
    )
    AND (
      p_multi_exam_filter IS NULL
      OR p_multi_exam_filter = 'all'
      OR er.email IN (
        SELECT public.admin_exam_portal_matching_emails(
          p_role_slug,
          p_exam_id,
          p_multi_exam_filter
        )
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.exam_attempts ea
      WHERE ea.user_id = er.user_id
        AND ea.exam_id = er.exam_id
    );

  SELECT count(*) INTO v_in_progress
  FROM public.exam_attempts ea
  INNER JOIN public.exam_registrations er
    ON er.user_id = ea.user_id
    AND er.exam_id = ea.exam_id
  WHERE ea.status = 'in_progress'
    AND (p_role_slug IS NULL OR er.role_slug = p_role_slug)
    AND (p_exam_id IS NULL OR er.exam_id = p_exam_id)
    AND (
      p_assignment_filter IS NULL
      OR p_assignment_filter = 'all'
      OR (p_assignment_filter = 'multiple-roles' AND er.from_multiple_roles)
      OR (p_assignment_filter = 'single-role' AND NOT er.from_multiple_roles)
    )
    AND (
      p_multi_exam_filter IS NULL
      OR p_multi_exam_filter = 'all'
      OR er.email IN (
        SELECT public.admin_exam_portal_matching_emails(
          p_role_slug,
          p_exam_id,
          p_multi_exam_filter
        )
      )
    );

  SELECT count(*) INTO v_not_provisioned
  FROM public.exam_registrations er
  WHERE er.user_id IS NULL
    AND (p_role_slug IS NULL OR er.role_slug = p_role_slug)
    AND (p_exam_id IS NULL OR er.exam_id = p_exam_id)
    AND (
      p_assignment_filter IS NULL
      OR p_assignment_filter = 'all'
      OR (p_assignment_filter = 'multiple-roles' AND er.from_multiple_roles)
      OR (p_assignment_filter = 'single-role' AND NOT er.from_multiple_roles)
    )
    AND (
      p_multi_exam_filter IS NULL
      OR p_multi_exam_filter = 'all'
      OR er.email IN (
        SELECT public.admin_exam_portal_matching_emails(
          p_role_slug,
          p_exam_id,
          p_multi_exam_filter
        )
      )
    );

  RETURN jsonb_build_object(
    'registrations', v_registrations,
    'submitted', v_submitted,
    'notStarted', v_not_started,
    'inProgress', v_in_progress,
    'notProvisioned', v_not_provisioned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_exam_portal_matching_emails(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_exam_portal_matching_emails(text, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_exam_portal_stats(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_exam_portal_stats(text, uuid, text, text) TO authenticated;

-- Drop old 2-arg overload if present
DROP FUNCTION IF EXISTS public.admin_exam_portal_stats(text, uuid);
