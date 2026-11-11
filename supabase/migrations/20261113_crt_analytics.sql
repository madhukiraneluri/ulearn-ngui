-- CRT-017: Admin CRT analytics dashboard.
--
-- One reporting RPC. It does not change RLS policies or readiness math.
-- Readiness for the student count is public.crt_compute_path_readiness().
-- Authorization is public.crt_mentor_dashboard_require_access().

BEGIN;

CREATE OR REPLACE FUNCTION public.crt_analytics_dashboard(
  p_readiness_threshold numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_practice_started bigint;
  v_practice_submitted bigint;
  v_mocks_submitted bigint;
  v_students_at_or_above bigint;
  v_weak_questions jsonb;
BEGIN
  PERFORM public.crt_mentor_dashboard_require_access();

  IF p_readiness_threshold IS NULL
     OR p_readiness_threshold < 0
     OR p_readiness_threshold > 100 THEN
    RAISE EXCEPTION 'invalid readiness_threshold' USING ERRCODE = '22023';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE a.kind = 'practice'),
    COUNT(*) FILTER (WHERE a.kind = 'practice' AND a.status = 'submitted'),
    COUNT(*) FILTER (WHERE a.kind = 'mock' AND a.status = 'submitted')
  INTO v_practice_started, v_practice_submitted, v_mocks_submitted
  FROM public.crt_attempts AS a;

  SELECT COUNT(*)::bigint
    INTO v_students_at_or_above
  FROM (
    SELECT DISTINCT pairs.user_id
    FROM (
      SELECT DISTINCT bm.user_id, cpa.path_id
      FROM public.batch_members AS bm
      JOIN public.profiles AS p ON p.id = bm.user_id
      JOIN public.crt_path_assignments AS cpa ON cpa.batch_id = bm.batch_id
      JOIN public.crt_paths AS cp ON cp.id = cpa.path_id
      WHERE cp.status = 'published'
        AND COALESCE(p.role, 'USER') <> 'ADMIN'
    ) AS pairs
    WHERE public.crt_compute_path_readiness(pairs.user_id, pairs.path_id)
          >= p_readiness_threshold
  ) AS ready_students;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'questionId', ranked.question_id,
        'stem', ranked.stem,
        'topic', ranked.topic,
        'answerCount', ranked.answer_count,
        'wrongAnswerRate', ranked.wrong_answer_rate
      )
      ORDER BY ranked.wrong_answer_rate DESC, ranked.wrong_count DESC, ranked.question_id
    ),
    '[]'::jsonb
  )
  INTO v_weak_questions
  FROM (
    SELECT
      q.id AS question_id,
      q.stem,
      NULLIF(btrim(q.topic), '') AS topic,
      COUNT(*)::integer AS answer_count,
      COUNT(*) FILTER (WHERE ans.is_correct IS FALSE)::integer AS wrong_count,
      ROUND(
        COUNT(*) FILTER (WHERE ans.is_correct IS FALSE)::numeric / COUNT(*)::numeric,
        4
      ) AS wrong_answer_rate
    FROM public.crt_attempt_answers AS ans
    JOIN public.crt_attempts AS a ON a.id = ans.attempt_id
    JOIN public.crt_questions AS q ON q.id = ans.question_id
    WHERE a.status = 'submitted'
      AND ans.is_correct IS NOT NULL
    GROUP BY q.id, q.stem, q.topic
    HAVING COUNT(*) >= 10
    ORDER BY wrong_answer_rate DESC, wrong_count DESC, q.id
    LIMIT 10
  ) AS ranked;

  RETURN jsonb_build_object(
    'practiceStarted', v_practice_started,
    'practiceSubmitted', v_practice_submitted,
    'mocksSubmitted', v_mocks_submitted,
    'studentsAtOrAboveThreshold', v_students_at_or_above,
    'weakQuestions', v_weak_questions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crt_analytics_dashboard(numeric)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.crt_analytics_dashboard(numeric)
  TO authenticated;

COMMIT;
