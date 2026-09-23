-- Admin dashboard: registration / submitted / not-started counts (respects role + exam filters)

CREATE OR REPLACE FUNCTION public.admin_exam_portal_stats(
  p_role_slug text DEFAULT NULL,
  p_exam_id uuid DEFAULT NULL
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
    AND (p_exam_id IS NULL OR er.exam_id = p_exam_id);

  SELECT count(*) INTO v_submitted
  FROM public.exam_results r
  WHERE (p_role_slug IS NULL OR r.role_slug = p_role_slug)
    AND (p_exam_id IS NULL OR r.exam_id = p_exam_id);

  SELECT count(*) INTO v_not_started
  FROM public.exam_registrations er
  WHERE er.user_id IS NOT NULL
    AND er.exam_id IS NOT NULL
    AND (p_role_slug IS NULL OR er.role_slug = p_role_slug)
    AND (p_exam_id IS NULL OR er.exam_id = p_exam_id)
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
    AND (p_exam_id IS NULL OR er.exam_id = p_exam_id);

  SELECT count(*) INTO v_not_provisioned
  FROM public.exam_registrations er
  WHERE er.user_id IS NULL
    AND (p_role_slug IS NULL OR er.role_slug = p_role_slug)
    AND (p_exam_id IS NULL OR er.exam_id = p_exam_id);

  RETURN jsonb_build_object(
    'registrations', v_registrations,
    'submitted', v_submitted,
    'notStarted', v_not_started,
    'inProgress', v_in_progress,
    'notProvisioned', v_not_provisioned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_exam_portal_stats(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_exam_portal_stats(text, uuid) TO authenticated;
