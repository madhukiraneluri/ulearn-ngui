# Razorpay Edge Function Secrets

Set these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

| Secret | Value |
|--------|-------|
| `RAZORPAY_KEY_ID` | `rzp_live_T1SJOKA8QCXSV1` |
| `RAZORPAY_KEY_SECRET` | *(set in Supabase Dashboard — do not commit)* |

Functions deployed:
- `create-razorpay-order` — creates Razorpay order (uses key + secret)
- `verify-razorpay-payment` — verifies signature and inserts enrollment

Frontend uses `razorpayKeyId` from `environment.ts` (public key only).
