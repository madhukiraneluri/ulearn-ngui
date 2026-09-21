import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const JUDGE0_URL = Deno.env.get('JUDGE0_CE_URL')?.trim() ?? 'https://ce.judge0.com';

const LANGUAGE_IDS: Record<string, number> = {
  javascript: 63,
  js: 63,
  python: 71,
  py: 71,
  java: 62,
  cpp: 54,
  'c++': 54,
  c: 50,
  typescript: 74,
  ts: 74
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const attemptId = String(body?.attemptId ?? '').trim();
    const questionId = String(body?.questionId ?? '').trim();
    const code = String(body?.code ?? '');

    if (!attemptId || !questionId || !code.trim()) {
      return json({ error: 'attemptId, questionId, and code are required' }, 400);
    }

    const adminClient = createAdminClient();

    const { data: attempt } = await adminClient
      .from('exam_attempts')
      .select('id, user_id, status')
      .eq('id', attemptId)
      .maybeSingle();

    if (!attempt || attempt.user_id !== auth.userId) return json({ error: 'Forbidden' }, 403);
    if (attempt.status !== 'in_progress') return json({ error: 'Attempt is closed' }, 400);

    const { data: question } = await adminClient
      .from('exam_questions')
      .select('id, type, payload')
      .eq('id', questionId)
      .maybeSingle();

    if (!question || question.type !== 'coding') return json({ error: 'Question not found' }, 404);

    const payload = question.payload as CodingPayload;
    const languageId = LANGUAGE_IDS[String(payload.language ?? 'javascript').toLowerCase()] ?? 63;
    const testCases = payload.publicTestCases ?? [];

    const results = [];
    for (const tc of testCases) {
      const passed = await judge0Run(code, languageId, tc.input ?? '', tc.expectedOutput ?? '');
      results.push({ input: tc.input, expectedOutput: tc.expectedOutput, passed });
    }

    const passedCount = results.filter((r) => r.passed).length;
    return json({ results, passedCount, total: results.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});

interface CodingPayload {
  language?: string;
  publicTestCases?: Array<{ input: string; expectedOutput: string }>;
}

async function judge0Run(
  sourceCode: string,
  languageId: number,
  stdin: string,
  expectedOutput: string
): Promise<boolean> {
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
}

async function requireUser(req: Request): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { ok: false, response: json({ error: 'Unauthorized' }, 401) };

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) return { ok: false, response: json({ error: 'Unauthorized' }, 401) };
  return { ok: true, userId: authData.user.id };
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
