# Razorpay Edge Function Secrets

Set these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

| Secret | Value |
|--------|-------|
| `RAZORPAY_KEY_ID` | `rzp_test_T1EqU7zvxFuX0r` |
| `RAZORPAY_KEY_SECRET` | `lhSh7JWJuN8DZ4ePi7p91Ubq` |

Functions deployed:
- `create-razorpay-order` — creates Razorpay order (uses key + secret)
- `verify-razorpay-payment` — verifies signature and inserts enrollment

Frontend uses `razorpayKeyId` from `environment.ts` (public key only).
