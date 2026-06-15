import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface EnrollmentDetails {
  fullName: string;
  phone: string;
  email: string;
  collegeName: string;
  degree: string;
  degreeYear: number;
  specialization: string;
  liveClassStartMonth: string;
  couponCode?: string;
  couponDiscountPercent?: number;
}

async function verifySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${orderId}|${paymentId}`));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return expected === signature;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keySecret) {
      return new Response(JSON.stringify({ error: 'Razorpay secret not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const {
      courseId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      enrollmentDetails,
      amountPaid
    } = await req.json();

    if (!courseId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: 'Missing payment details' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const valid = await verifySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      keySecret
    );

    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid payment signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: existing } = await adminClient
      .from('enrollments')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: true, alreadyEnrolled: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const details = enrollmentDetails as EnrollmentDetails | undefined;
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      course_id: courseId
    };

    if (details) {
      insertPayload.full_name = details.fullName;
      insertPayload.phone = details.phone;
      insertPayload.email = details.email;
      insertPayload.college_name = details.collegeName;
      insertPayload.degree = details.degree;
      insertPayload.degree_year = details.degreeYear;
      insertPayload.specialization = details.specialization;
      insertPayload.live_class_start_month = details.liveClassStartMonth;
      if (details.couponCode) {
        insertPayload.coupon_code_used = details.couponCode;
        insertPayload.coupon_discount_percent = details.couponDiscountPercent ?? null;
      }
    }

    if (amountPaid != null) {
      insertPayload.amount_paid = amountPaid;
    }

    const { error: enrollErr } = await adminClient.from('enrollments').insert(insertPayload);

    if (enrollErr) {
      return new Response(JSON.stringify({ error: enrollErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (details?.couponCode) {
      await adminClient.rpc('increment_coupon_usage', { p_code: details.couponCode });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
