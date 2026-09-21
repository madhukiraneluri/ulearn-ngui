import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const JUDGE0_URL = Deno.env.get('JUDGE0_CE_URL')?.trim() ?? 'https://ce.judge0.com';

const LANGUAGE_IDS: Record<string, number> = {
  c: 50,
  cpp: 54,
  'c++': 54,
  java: 62,
  javascript: 63,
  js: 63,
  python: 71,
  py: 71
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const attemptId = String(body?.attemptId ?? '').trim();
    if (!attemptId) return json({ error: 'attemptId is required' }, 400);

    const adminClient = createAdminClient();
    const result = await evaluateAttempt(adminClient, attemptId);
    return json(result);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

interface McqPayload {
  correctIndex: number;
  marks: number;
}

interface CodingPayload {
  language?: string;
  marks: number;
  publicTestCases?: Array<{ input: string; expectedOutput: string }>;
  hiddenTestCases?: Array<{ input: string; expectedOutput: string }>;
}

export async function evaluateAttempt(
  client: SupabaseClient,
  attemptId: string
): Promise<Record<string, unknown>> {
  const { data: attempt, error: attErr } = await client
    .from('exam_attempts')
    .select(`
      id, exam_id, exam_role_id, user_id, fullscreen_exit_count, status,
      exam_roles ( slug ),
      profiles ( full_name, email )
    `)
    .eq('id', attemptId)
    .maybeSingle();

  if (attErr || !attempt) throw new Error('Attempt not found');

  const roleSlug = (attempt.exam_roles as { slug?: string } | null)?.slug ?? 'unknown';
  const profile = attempt.profiles as { full_name?: string; email?: string } | null;
  const studentName = String(profile?.full_name ?? '');
  const studentEmail = String(profile?.email ?? '');

  const { data: questions } = await client
    .from('exam_questions')
    .select('id, type, payload')
    .eq('exam_role_id', attempt.exam_role_id)
    .order('sort_order', { ascending: true });

  const { data: answers } = await client
    .from('exam_answers')
    .select('question_id, answer')
    .eq('attempt_id', attemptId);

  const answerByQ = new Map<string, Record<string, unknown>>();
  for (const a of answers ?? []) {
    answerByQ.set(String(a.question_id), a.answer as Record<string, unknown>);
  }

  let mcqScore = 0;
  let mcqMax = 0;
  let codingScore = 0;
  let codingMax = 0;
  const mcqBreakdown: unknown[] = [];
  const codingBreakdown: unknown[] = [];

  for (const q of questions ?? []) {
    if (q.type === 'mcq') {
      const payload = q.payload as McqPayload;
      const marks = Number(payload.marks ?? 1);
      mcqMax += marks;
      const selected = answerByQ.get(String(q.id))?.selectedIndex;
      const correct = selected === payload.correctIndex;
      if (correct) mcqScore += marks;
      mcqBreakdown.push({
        questionId: q.id,
        selectedIndex: selected,
        correctIndex: payload.correctIndex,
        marks,
        earned: correct ? marks : 0
      });
    } else if (q.type === 'coding') {
      const payload = q.payload as CodingPayload;
      const marks = Number(payload.marks ?? 0);
      codingMax += marks;
      const answer = answerByQ.get(String(q.id));
      const code = String(answer?.code ?? '');
      const langKey = String(answer?.language ?? payload.language ?? 'javascript').toLowerCase();
      const languageId = LANGUAGE_IDS[langKey] ?? LANGUAGE_IDS.javascript;
      const allTests = [
        ...(payload.publicTestCases ?? []),
        ...(payload.hiddenTestCases ?? [])
      ];

      let passed = 0;
      if (code.trim() && allTests.length > 0) {
        for (const tc of allTests) {
          const ok = await judge0Run(code, languageId, tc.input ?? '', tc.expectedOutput ?? '');
          if (ok) passed++;
        }
      }

      const ratio = allTests.length > 0 ? passed / allTests.length : 0;
      const earned = Math.round(marks * ratio * 100) / 100;
      codingScore += earned;
      codingBreakdown.push({
        questionId: q.id,
        passedTests: passed,
        totalTests: allTests.length,
        marks,
        earned
      });
    }
  }

  const totalScore = mcqScore + codingScore;
  const totalMax = mcqMax + codingMax;
  const percentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 10000) / 100 : 0;

  const row = {
    attempt_id: attemptId,
    exam_id: attempt.exam_id,
    user_id: attempt.user_id,
    role_slug: roleSlug,
    student_name: studentName,
    student_email: studentEmail,
    mcq_score: mcqScore,
    mcq_max: mcqMax,
    coding_score: codingScore,
    coding_max: codingMax,
    total_score: totalScore,
    total_max: totalMax,
    percentage,
    fullscreen_warnings: attempt.fullscreen_exit_count ?? 0,
    mcq_breakdown: mcqBreakdown,
    coding_breakdown: codingBreakdown,
    evaluated_at: new Date().toISOString()
  };

  const { error: upsertErr } = await client
    .from('exam_results')
    .upsert(row, { onConflict: 'attempt_id' });

  if (upsertErr) throw new Error(upsertErr.message);

  return {
    ok: true,
    mcqScore,
    mcqMax,
    codingScore,
    codingMax,
    totalScore,
    totalMax,
    percentage
  };
}

async function judge0Run(
  sourceCode: string,
  languageId: number,
  stdin: string,
  expectedOutput: string
): Promise<boolean> {
  try {
    const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin,
        expected_output: expectedOutput
      })
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status?.id === 3;
  } catch {
    return false;
  }
}

function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
