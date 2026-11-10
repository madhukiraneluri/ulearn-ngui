-- CRT-015: Mentor dashboard reporting (batch + CRT path readiness).
--
-- Exposes filter metadata and a paginated student report for mentors/admins.
-- Readiness matches docs/crt/readiness.md (40% practice, 40% mock, 20% topics).
--
-- Access scope (global): callers with has_permission('dashboard.view') OR
-- has_permission('students.manage') may list and report on all students who
-- belong to any batch that has a published CRT path assignment. There is no
-- per-mentor batch scoping in this schema.
--
-- Students cannot call these RPCs (dashboard.view / students.manage required).

BEGIN;

-- ─── Internal readiness (not granted to authenticated callers) ─────────────────

CREATE OR REPLACE FUNCTION public.crt_compute_path_readiness(
  p_user_id uuid,
  p_path_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_practice_accuracy numeric := 0;
  v_mock_accuracy numeric := 0;
  v_topic_coverage numeric := 0;
  v_eligible_topics integer := 0;
  v_covered_topics integer := 0;
  v_raw numeric;
BEGIN
  IF p_user_id IS NULL OR p_path_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(AVG(accuracy), 0)
    INTO v_practice_accuracy
  FROM (
    SELECT
      CASE
        WHEN a.max_score IS NOT NULL
         AND a.max_score > 0
         AND a.score IS NOT NULL
        THEN LEAST(100, GREATEST(0, (a.score / a.max_score) * 100))
        ELSE NULL
      END AS accuracy
    FROM public.crt_attempts AS a
    WHERE a.user_id = p_user_id
      AND a.path_id = p_path_id
      AND a.kind = 'practice'
      AND a.status = 'submitted'
    ORDER BY a.submitted_at DESC NULLS LAST
    LIMIT 5
  ) AS practice_rows
  WHERE accuracy IS NOT NULL;

  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN a.max_score IS NOT NULL
           AND a.max_score > 0
           AND a.score IS NOT NULL
          THEN LEAST(100, GREATEST(0, (a.score / a.max_score) * 100))
          ELSE 0
        END
      FROM public.crt_attempts AS a
      WHERE a.user_id = p_user_id
        AND a.path_id = p_path_id
        AND a.kind = 'mock'
        AND a.status = 'submitted'
      ORDER BY a.submitted_at DESC NULLS LAST
      LIMIT 1
    ),
    0
  )
  INTO v_mock_accuracy;

  SELECT COUNT(DISTINCT NULLIF(btrim(q.topic), ''))
    INTO v_eligible_topics
  FROM public.crt_questions AS q
  JOIN public.crt_modules AS m ON m.id = q.module_id
  WHERE m.path_id = p_path_id
    AND NULLIF(btrim(q.topic), '') IS NOT NULL;

  IF v_eligible_topics > 0 THEN
    SELECT COUNT(DISTINCT eligible.topic)
      INTO v_covered_topics
    FROM (
      SELECT DISTINCT NULLIF(btrim(q.topic), '') AS topic
      FROM public.crt_questions AS q
      JOIN public.crt_modules AS m ON m.id = q.module_id
      WHERE m.path_id = p_path_id
        AND NULLIF(btrim(q.topic), '') IS NOT NULL
    ) AS eligible
    WHERE EXISTS (
      SELECT 1
      FROM public.crt_attempt_answers AS ans
      JOIN public.crt_attempts AS a ON a.id = ans.attempt_id
      JOIN public.crt_questions AS q ON q.id = ans.question_id
      WHERE a.user_id = p_user_id
        AND a.path_id = p_path_id
        AND a.status = 'submitted'
        AND ans.is_correct IS TRUE
        AND NULLIF(btrim(q.topic), '') = eligible.topic
    );

    v_topic_coverage := (v_covered_topics::numeric / v_eligible_topics::numeric) * 100;
  ELSE
    v_topic_coverage := 0;
  END IF;

  v_raw := (0.4 * v_practice_accuracy)
        + (0.4 * v_mock_accuracy)
        + (0.2 * v_topic_coverage);

  RETURN LEAST(100, GREATEST(0, ROUND(v_raw)::integer));
END;
$$;

REVOKE ALL ON FUNCTION public.crt_compute_path_readiness(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- ─── Access guard ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crt_mentor_dashboard_require_access()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (
    public.has_permission('dashboard.view')
    OR public.has_permission('students.manage')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crt_mentor_dashboard_require_access()
  FROM PUBLIC, anon, authenticated;

-- ─── Filter metadata ─────────────────────────────────────────────────────────
-- Same global scope as crt_mentor_dashboard_report: all batches with published
-- CRT path assignments (not limited to the caller's batches).

CREATE OR REPLACE FUNCTION public.crt_mentor_dashboard_filters()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.crt_mentor_dashboard_require_access();

  RETURN jsonb_build_object(
    'batches', COALESCE((
      SELECT jsonb_agg(batch_row ORDER BY batch_row->>'name')
      FROM (
        SELECT jsonb_build_object(
          'id', b.id,
          'name', b.name,
          'paths', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object('id', cp.id, 'title', cp.title)
              ORDER BY cp.title
            )
            FROM public.crt_path_assignments AS cpa
            JOIN public.crt_paths AS cp ON cp.id = cpa.path_id
            WHERE cpa.batch_id = b.id
              AND cp.status = 'published'
          ), '[]'::jsonb)
        ) AS batch_row
        FROM (
          SELECT DISTINCT b.id, b.name
          FROM public.batches AS b
          JOIN public.crt_path_assignments AS cpa ON cpa.batch_id = b.id
          JOIN public.crt_paths AS cp ON cp.id = cpa.path_id
          WHERE cp.status = 'published'
        ) AS b
      ) AS batches
    ), '[]'::jsonb)
  );
END;
$$;

-- ─── Paginated report ────────────────────────────────────────────────────────
-- Readiness is computed set-based for the full filtered cohort (correct filter
-- totals) before OFFSET/LIMIT. Status labels use a default 7-day activity
-- window when p_inactive_days is NULL; when p_inactive_days is set, the same
-- value is used both to filter inactive students and to label active/inactive.

CREATE OR REPLACE FUNCTION public.crt_mentor_dashboard_report(
  p_batch_id uuid DEFAULT NULL,
  p_path_id uuid DEFAULT NULL,
  p_readiness_below numeric DEFAULT NULL,
  p_inactive_days integer DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  -- Default 7-day window for status when p_inactive_days is omitted (see header).
  v_status_days integer := GREATEST(COALESCE(p_inactive_days, 7), 0);
  v_result jsonb;
BEGIN
  PERFORM public.crt_mentor_dashboard_require_access();

  IF p_readiness_below IS NOT NULL AND (
    p_readiness_below < 0 OR p_readiness_below > 100
  ) THEN
    RAISE EXCEPTION 'invalid readiness_below' USING ERRCODE = '22023';
  END IF;

  IF p_inactive_days IS NOT NULL AND p_inactive_days < 0 THEN
    RAISE EXCEPTION 'invalid inactive_days' USING ERRCODE = '22023';
  END IF;

  IF p_path_id IS NOT NULL
     AND p_batch_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.crt_path_assignments AS cpa
       WHERE cpa.batch_id = p_batch_id
         AND cpa.path_id = p_path_id
     ) THEN
    RAISE EXCEPTION 'path is not assigned to batch' USING ERRCODE = '22023';
  END IF;

  WITH cohort AS (
    SELECT
      bm.user_id,
      p.full_name,
      p.email,
      bm.batch_id,
      b.name AS batch_name,
      cpa.path_id,
      cp.title AS path_title
    FROM public.batch_members AS bm
    JOIN public.batches AS b ON b.id = bm.batch_id
    JOIN public.crt_path_assignments AS cpa ON cpa.batch_id = bm.batch_id
    JOIN public.crt_paths AS cp ON cp.id = cpa.path_id
    JOIN public.profiles AS p ON p.id = bm.user_id
    WHERE cp.status = 'published'
      AND COALESCE(p.role, 'USER') <> 'ADMIN'
      AND (p_batch_id IS NULL OR bm.batch_id = p_batch_id)
      AND (p_path_id IS NULL OR cpa.path_id = p_path_id)
  ),
  cohort_pairs AS (
    SELECT DISTINCT c.user_id, c.path_id
    FROM cohort AS c
  ),
  last_attempts AS (
    SELECT
      a.user_id,
      a.path_id,
      MAX(a.submitted_at) AS last_attempt_at
    FROM public.crt_attempts AS a
    INNER JOIN cohort_pairs AS cp
      ON cp.user_id = a.user_id
     AND cp.path_id = a.path_id
    WHERE a.status = 'submitted'
    GROUP BY a.user_id, a.path_id
  ),
  practice_scored AS (
    SELECT
      a.user_id,
      a.path_id,
      CASE
        WHEN a.max_score IS NOT NULL
         AND a.max_score > 0
         AND a.score IS NOT NULL
        THEN LEAST(100, GREATEST(0, (a.score / a.max_score) * 100))
        ELSE NULL
      END AS accuracy,
      ROW_NUMBER() OVER (
        PARTITION BY a.user_id, a.path_id
        ORDER BY a.submitted_at DESC NULLS LAST, a.id DESC
      ) AS rn
    FROM public.crt_attempts AS a
    INNER JOIN cohort_pairs AS cp
      ON cp.user_id = a.user_id
     AND cp.path_id = a.path_id
    WHERE a.kind = 'practice'
      AND a.status = 'submitted'
  ),
  practice_accuracy AS (
    SELECT
      ps.user_id,
      ps.path_id,
      COALESCE(AVG(ps.accuracy), 0) AS practice_accuracy
    FROM practice_scored AS ps
    WHERE ps.rn <= 5
      AND ps.accuracy IS NOT NULL
    GROUP BY ps.user_id, ps.path_id
  ),
  mock_ranked AS (
    SELECT
      a.user_id,
      a.path_id,
      CASE
        WHEN a.max_score IS NOT NULL
         AND a.max_score > 0
         AND a.score IS NOT NULL
        THEN LEAST(100, GREATEST(0, (a.score / a.max_score) * 100))
        ELSE 0
      END AS mock_accuracy,
      ROW_NUMBER() OVER (
        PARTITION BY a.user_id, a.path_id
        ORDER BY a.submitted_at DESC NULLS LAST, a.id DESC
      ) AS rn
    FROM public.crt_attempts AS a
    INNER JOIN cohort_pairs AS cp
      ON cp.user_id = a.user_id
     AND cp.path_id = a.path_id
    WHERE a.kind = 'mock'
      AND a.status = 'submitted'
  ),
  mock_accuracy AS (
    SELECT mr.user_id, mr.path_id, mr.mock_accuracy
    FROM mock_ranked AS mr
    WHERE mr.rn = 1
  ),
  cohort_paths AS (
    SELECT DISTINCT c.path_id
    FROM cohort AS c
  ),
  eligible_topic_counts AS (
    SELECT
      m.path_id,
      COUNT(DISTINCT NULLIF(btrim(q.topic), ''))::integer AS eligible_count
    FROM public.crt_questions AS q
    JOIN public.crt_modules AS m ON m.id = q.module_id
    INNER JOIN cohort_paths AS cp ON cp.path_id = m.path_id
    WHERE NULLIF(btrim(q.topic), '') IS NOT NULL
    GROUP BY m.path_id
  ),
  eligible_topics AS (
    SELECT DISTINCT
      m.path_id,
      NULLIF(btrim(q.topic), '') AS topic
    FROM public.crt_questions AS q
    JOIN public.crt_modules AS m ON m.id = q.module_id
    INNER JOIN cohort_paths AS cp ON cp.path_id = m.path_id
    WHERE NULLIF(btrim(q.topic), '') IS NOT NULL
  ),
  covered_topic_counts AS (
    SELECT
      a.user_id,
      a.path_id,
      COUNT(DISTINCT et.topic)::integer AS covered_count
    FROM eligible_topics AS et
    INNER JOIN cohort_pairs AS cp
      ON cp.path_id = et.path_id
    JOIN public.crt_attempts AS a
      ON a.user_id = cp.user_id
     AND a.path_id = cp.path_id
    JOIN public.crt_attempt_answers AS ans ON ans.attempt_id = a.id
    JOIN public.crt_questions AS q ON q.id = ans.question_id
    WHERE a.status = 'submitted'
      AND ans.is_correct IS TRUE
      AND NULLIF(btrim(q.topic), '') = et.topic
    GROUP BY a.user_id, a.path_id
  ),
  enriched AS (
    SELECT
      c.user_id,
      c.full_name,
      c.email,
      c.batch_id,
      c.batch_name,
      c.path_id,
      c.path_title,
      la.last_attempt_at,
      LEAST(
        100,
        GREATEST(
          0,
          ROUND(
            (
              0.4 * COALESCE(pa.practice_accuracy, 0)
              + 0.4 * COALESCE(ma.mock_accuracy, 0)
              + 0.2 * CASE
                WHEN COALESCE(etc.eligible_count, 0) > 0
                THEN (
                  COALESCE(ctc.covered_count, 0)::numeric
                  / etc.eligible_count::numeric
                ) * 100
                ELSE 0
              END
            )
          )::integer
        )
      ) AS readiness_score
    FROM cohort AS c
    LEFT JOIN last_attempts AS la
      ON la.user_id = c.user_id
     AND la.path_id = c.path_id
    LEFT JOIN practice_accuracy AS pa
      ON pa.user_id = c.user_id
     AND pa.path_id = c.path_id
    LEFT JOIN mock_accuracy AS ma
      ON ma.user_id = c.user_id
     AND ma.path_id = c.path_id
    LEFT JOIN eligible_topic_counts AS etc ON etc.path_id = c.path_id
    LEFT JOIN covered_topic_counts AS ctc
      ON ctc.user_id = c.user_id
     AND ctc.path_id = c.path_id
  ),
  classified AS (
    SELECT
      e.*,
      CASE
        WHEN e.last_attempt_at IS NULL THEN 'inactive'
        WHEN e.last_attempt_at >= (now() - (v_status_days || ' days')::interval) THEN 'active'
        ELSE 'inactive'
      END AS status
    FROM enriched AS e
  ),
  filtered AS (
    SELECT *
    FROM classified AS f
    WHERE (
      p_readiness_below IS NULL
      OR f.readiness_score < p_readiness_below
    )
    AND (
      p_inactive_days IS NULL
      OR f.last_attempt_at IS NULL
      OR f.last_attempt_at < (now() - (p_inactive_days || ' days')::interval)
    )
  ),
  totals AS (
    SELECT COUNT(*)::bigint AS total FROM filtered
  )
  SELECT jsonb_build_object(
    'page', jsonb_build_object(
      'offset', v_offset,
      'limit', v_limit,
      'total', totals.total
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'userId', page.user_id,
          'studentName', COALESCE(NULLIF(btrim(page.full_name), ''), 'Unnamed user'),
          'email', page.email,
          'batchId', page.batch_id,
          'batchName', page.batch_name,
          'pathId', page.path_id,
          'pathTitle', page.path_title,
          'lastAttemptAt', page.last_attempt_at,
          'readinessScore', page.readiness_score,
          'status', page.status
        )
        ORDER BY page.readiness_score ASC, page.student_name ASC, page.user_id
      )
      FROM (
        SELECT
          f.user_id,
          f.full_name,
          f.email,
          f.batch_id,
          f.batch_name,
          f.path_id,
          f.path_title,
          f.last_attempt_at,
          f.readiness_score,
          f.status,
          COALESCE(NULLIF(btrim(f.full_name), ''), 'Unnamed user') AS student_name
        FROM filtered AS f
        ORDER BY f.readiness_score ASC, student_name ASC, f.user_id
        OFFSET v_offset
        LIMIT v_limit
      ) AS page
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM totals;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.crt_mentor_dashboard_filters()
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.crt_mentor_dashboard_report(uuid, uuid, numeric, integer, integer, integer)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.crt_mentor_dashboard_filters()
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.crt_mentor_dashboard_report(uuid, uuid, numeric, integer, integer, integer)
  TO authenticated, service_role;

COMMIT;
