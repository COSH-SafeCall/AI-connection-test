# SafeCall Gemini Live demo

This workspace contains an Expo/React Native client in `frontend/` and a Spring Boot token service in `server/`. The app asks the backend for a one-use ephemeral token, then connects directly to Gemini Live. `GEMINI_API_KEY` is read only by Spring and is never shipped in the React Native bundle.

## Prerequisites

- Node.js 22.13 or newer (Expo SDK 57)
- Java 21
- Android Studio, Xcode, or a physical device for the native app
- A Gemini API key with Live API access

## 1. Configure and run the backend

Copy `server/.env.example` to `server/.env`, set `GEMINI_API_KEY`, and run:

```powershell
cd server
.\gradlew.bat bootRun
```

On macOS/Linux, use `./gradlew bootRun`. The API starts at `http://localhost:8080`.

Backend environment variables:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | none | Long-lived server-side Gemini credential. Never prefix this with `EXPO_PUBLIC_`. |
| `SAFECALL_ALLOWED_CLIENT_ENVIRONMENTS` | Yes in production | `development` | Comma-separated exact values accepted in `X-Client-Environment`. |
| `SAFECALL_ALLOWED_ORIGINS` | For web builds | local Expo origins | Comma-separated exact browser origins allowed to call `/api/live-token`. |
| `SAFECALL_TRUSTED_PROXY_CIDRS` | Behind a proxy | empty | Comma-separated CIDRs of proxies permitted to supply `Forwarded` or `X-Forwarded-For`. |
| `SAFECALL_LIVE_TOKEN_RATE_LIMIT_REQUESTS` | No | `10` | Token requests permitted per resolved client IP and window. |
| `SAFECALL_LIVE_TOKEN_RATE_LIMIT_WINDOW_SECONDS` | No | `60` | In-memory rate-limit window in seconds. |
| `SAFECALL_GEMINI_CONNECTION_TTL_SECONDS` | No | `1800` | Lifetime of an established Live connection token. Must remain within Gemini limits. |
| `SAFECALL_GEMINI_NEW_SESSION_TTL_SECONDS` | No | `60` | Time allowed to start the one permitted Live session. |
| `GEMINI_LIVE_MODEL` | No | `models/gemini-3.1-flash-live-preview` | Server-constrained Live model. |
| `GEMINI_EPHEMERAL_TOKEN_URL` | No | Google `v1beta/auth_tokens` | Token provisioning endpoint; override only for testing. |

When deployed behind a load balancer, put only the addresses/CIDRs of infrastructure you operate in `SAFECALL_TRUSTED_PROXY_CIDRS`. With an empty value—or when the immediate peer is not trusted—the service deliberately ignores forwarded-IP headers. The rate limiter is process-local; use a shared store or gateway limiter when running multiple server instances.

`X-Client-Environment` is an allowlist policy boundary, not a user credential: a distributed native app cannot keep a static secret. Production apps should additionally authenticate users or validate platform attestation before issuing tokens.

## 2. Configure and run the React Native app

Copy `frontend/.env.example` to `frontend/.env`, then choose the backend URL visible from the target:

- Android emulator: `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080`
- iOS simulator: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8080`
- Physical device: `EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_LAN_IP:8080`
- Web: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8080`

Set `EXPO_PUBLIC_CLIENT_ENVIRONMENT` to one exact value in the server's `SAFECALL_ALLOWED_CLIENT_ENVIRONMENTS`, then run:

```powershell
cd frontend
npm install
npm run android
```

Use `npm run ios` or `npm run web` for other targets. Microphone capture requires permission. A web build needs HTTPS except on localhost, and its exact origin must be included in `SAFECALL_ALLOWED_ORIGINS` so the backend can answer CORS preflight requests.

Frontend environment variables are intentionally public:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Yes outside the iOS simulator/web default | `http://localhost:8080` | Base URL of the Spring service. |
| `EXPO_PUBLIC_CLIENT_ENVIRONMENT` | Yes in production | `development` | Environment identifier sent to the backend allowlist. |

Do not add `GEMINI_API_KEY`, an API key alias, or any long-lived secret to the frontend `.env` file. Expo embeds every `EXPO_PUBLIC_*` value into the client bundle.

## Verification

```powershell
cd server
.\gradlew.bat test

cd ..\frontend
npm run typecheck
```

The client streams little-endian 16-bit mono PCM at 16 kHz and uses manual push-to-talk activity boundaries. Gemini returns 24 kHz PCM audio, which the app plays after each completed model turn while showing input and output transcriptions.
