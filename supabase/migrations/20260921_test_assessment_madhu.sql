-- Test assessment: 40 MCQs + 2 coding questions for manual QA
-- Assigned to madhukiranchowdaryeluri2004@gmail.com

DO $$
DECLARE
  v_exam_id uuid;
  v_role_id uuid;
  v_user_id uuid := '197ff12b-815f-4370-863a-72a2e5fc4875';
  v_candidate_id uuid;
  v_i integer;
BEGIN
  INSERT INTO public.exams (
    title,
    description,
    starts_at,
    ends_at,
    duration_minutes,
    max_concurrent,
    status,
    recruitment_slug
  )
  VALUES (
    'Test Assessment — 40 MCQ + 2 Coding',
    'Practice assessment for exam portal QA (40 MCQ + 2 coding)',
    '2026-09-21T00:00:00+00'::timestamptz,
    '2026-09-28T18:30:00+00'::timestamptz,
    90,
    1000,
    'published',
    'test-assessment-madhu'
  )
  ON CONFLICT (recruitment_slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    duration_minutes = EXCLUDED.duration_minutes,
    status = 'published',
    updated_at = now()
  RETURNING id INTO v_exam_id;

  IF v_exam_id IS NULL THEN
    SELECT id INTO v_exam_id FROM public.exams WHERE recruitment_slug = 'test-assessment-madhu';
  END IF;

  INSERT INTO public.exam_roles (exam_id, name, slug, has_coding, sort_order)
  VALUES (v_exam_id, 'Test Assessment', 'test-assessment', true, 0)
  ON CONFLICT (exam_id, slug) DO UPDATE SET
    has_coding = true,
    name = EXCLUDED.name
  RETURNING id INTO v_role_id;

  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.exam_roles WHERE exam_id = v_exam_id AND slug = 'test-assessment';
  END IF;

  DELETE FROM public.exam_questions WHERE exam_role_id = v_role_id;

  FOR v_i IN 1..40 LOOP
    INSERT INTO public.exam_questions (exam_role_id, type, sort_order, payload)
    VALUES (
      v_role_id,
      'mcq',
      v_i - 1,
      jsonb_build_object(
        'stem', format('Sample MCQ %s: What is %s + %s?', v_i, v_i, v_i),
        'options', jsonb_build_array(
          v_i * 2,
          v_i + 1,
          v_i * 2 + 1,
          v_i * 3
        ),
        'correctIndex', 0,
        'marks', 1
      )
    );
  END LOOP;

  INSERT INTO public.exam_questions (exam_role_id, type, sort_order, payload)
  VALUES
    (
      v_role_id,
      'coding',
      40,
      jsonb_build_object(
        'title', 'Sum Two Numbers',
        'description', 'Read two integers from stdin (one per line or space-separated) and print their sum.',
        'starterCode', E'const fs = require(''fs'');\nconst input = fs.readFileSync(0, ''utf8'').trim().split(/\\s+/);\nconst a = Number(input[0]);\nconst b = Number(input[1]);\nconsole.log(a + b);',
        'language', 'javascript',
        'marks', 10,
        'publicTestCases', jsonb_build_array(
          jsonb_build_object('input', '2 3', 'expectedOutput', '5'),
          jsonb_build_object('input', '10\n20', 'expectedOutput', '30')
        ),
        'hiddenTestCases', jsonb_build_array(
          jsonb_build_object('input', '100 250', 'expectedOutput', '350'),
          jsonb_build_object('input', '-4 9', 'expectedOutput', '5')
        )
      )
    ),
    (
      v_role_id,
      'coding',
      41,
      jsonb_build_object(
        'title', 'Reverse a String',
        'description', 'Read a single word from stdin and print it reversed.',
        'starterCode', E'const fs = require(''fs'');\nconst word = fs.readFileSync(0, ''utf8'').trim();\nconsole.log(word.split('''').reverse().join(''''));',
        'language', 'javascript',
        'marks', 10,
        'publicTestCases', jsonb_build_array(
          jsonb_build_object('input', 'hello', 'expectedOutput', 'olleh'),
          jsonb_build_object('input', 'ULearn', 'expectedOutput', 'nraeLU')
        ),
        'hiddenTestCases', jsonb_build_array(
          jsonb_build_object('input', 'abc', 'expectedOutput', 'cba')
        )
      )
    );

  INSERT INTO public.exam_candidates (exam_id, user_id, exam_role_id)
  VALUES (v_exam_id, v_user_id, v_role_id)
  ON CONFLICT (exam_id, user_id) DO UPDATE SET
    exam_role_id = EXCLUDED.exam_role_id
  RETURNING id INTO v_candidate_id;

  IF v_candidate_id IS NULL THEN
    SELECT id INTO v_candidate_id
    FROM public.exam_candidates
    WHERE exam_id = v_exam_id AND user_id = v_user_id;
  END IF;

  INSERT INTO public.exam_registrations (
    email,
    full_name,
    role_interested,
    role_slug,
    exam_id,
    user_id,
    candidate_id,
    provision_error
  )
  VALUES (
    'madhukiranchowdaryeluri2004@gmail.com',
    'Madhu Kiran Chowdary Eluri',
    'Test Assessment',
    'test-assessment',
    v_exam_id,
    v_user_id,
    v_candidate_id,
    NULL
  )
  ON CONFLICT (email, exam_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role_interested = EXCLUDED.role_interested,
    role_slug = EXCLUDED.role_slug,
    user_id = EXCLUDED.user_id,
    candidate_id = EXCLUDED.candidate_id,
    provision_error = NULL;
END $$;
