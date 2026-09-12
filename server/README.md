# SafeCall token service

This Spring Boot service provisions one-use, short-lived Gemini Live tokens without exposing `GEMINI_API_KEY` to the React Native client. It enforces a client-environment allowlist, exact-origin CORS policy, per-IP rate limit, and trusted-proxy-aware forwarded IP parsing.

See the [workspace README](../README.md) for every environment variable and complete backend/frontend setup instructions.

Successful `POST /api/live-token` response:

```json
{
  "token": "auth_tokens/...",
  "model": "models/gemini-3.1-flash-live-preview",
  "expiresAt": "2026-09-09T00:30:00Z"
}
```

The request must include `X-Client-Environment` with an exact value configured in `SAFECALL_ALLOWED_CLIENT_ENVIRONMENTS`. Browser callers must also have an exact origin in `SAFECALL_ALLOWED_ORIGINS`.
