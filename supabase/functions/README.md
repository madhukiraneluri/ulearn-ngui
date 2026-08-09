# Razorpay Edge Function Secrets

Set these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

| Secret | Value |
|--------|-------|
| `RAZORPAY_KEY_ID` | `rzp_live_T1SJOKA8QCXSV1` |
| `RAZORPAY_KEY_SECRET` | *(set in Supabase Dashboard — do not commit)* |

Functions deployed:
- `create-razorpay-order` — creates Razorpay order (uses key + secret)
- `verify-razorpay-payment` — verifies signature and inserts enrollment
- `delete-user` — admin deletes student account and related data
- `create-student` — admin creates student(s) with temp password, optional enroll & batch
- `resend-credentials` — admin resets temp password and emails student
- `livekit-token` — mints LiveKit JWT for session join links (requires LiveKit secrets)

LiveKit secrets (required for live sessions):

| Secret | Value |
|--------|-------|
| `LIVEKIT_API_KEY` | From LiveKit Cloud project settings |
| `LIVEKIT_API_SECRET` | From LiveKit Cloud project settings |
| `LIVEKIT_WS_URL` | e.g. `wss://your-project.livekit.cloud` |

Additional secrets for student provisioning (optional email):

| Secret | Value |
|--------|-------|
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | e.g. `ULearn <noreply@ulearn-edu.in>` |
| `ULEARN_LOGIN_URL` | e.g. `https://www.ulearn-edu.in/auth/login` |

Frontend uses `razorpayKeyId` from `environment.ts` (public key only).
