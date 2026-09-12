# 서버 변경사항

React Native 클라이언트가 장기 Gemini API 키를 직접 사용하지 않고 Gemini Live API에 접속할 수 있도록 서버에 임시 토큰 발급 기능과 요청 보호 기능을 추가했습니다.

## 1. Gemini Live 임시 토큰 발급

`POST /api/live-token` 엔드포인트를 추가했습니다.

서버는 `GEMINI_API_KEY`를 이용해 Google의 `v1beta/auth_tokens` 엔드포인트에서 임시 토큰을 발급합니다. API 키는 서버의 환경변수에서만 읽으며 응답이나 클라이언트 설정에 포함하지 않습니다.

발급되는 토큰에는 다음 제한이 적용됩니다.

- 한 번의 Live 세션에만 사용 가능
- 새 세션 시작 가능 시간 제한
- 연결 유지 가능 시간 제한
- 서버에서 지정한 Gemini Live 모델만 사용
- 응답 모달리티를 오디오로 제한
- 입력 및 출력 오디오 전사 활성화
- React Native의 push-to-talk 동작을 위한 자동 음성 감지 비활성화

성공 응답 형식은 다음과 같습니다.

```json
{
  "token": "auth_tokens/...",
  "model": "models/gemini-3.1-flash-live-preview",
  "expiresAt": "2026-09-09T00:30:00Z"
}
```

성공 및 오류 응답에는 토큰이 브라우저나 중간 캐시에 저장되지 않도록 `Cache-Control: no-store`가 적용됩니다.

관련 파일:

- `src/main/java/com/safecall/service/token/GeminiTokenController.java`

## 2. 클라이언트 환경 allowlist

토큰 요청에는 `X-Client-Environment` 헤더가 필요합니다. 헤더 값이 `SAFECALL_ALLOWED_CLIENT_ENVIRONMENTS`에 설정된 값과 정확히 일치할 때만 요청을 허용합니다.

예시:

```http
POST /api/live-token HTTP/1.1
X-Client-Environment: development
```

헤더가 없거나 허용되지 않은 값이면 `403 Forbidden`과 오류 코드 `G003`을 반환합니다.

이 헤더는 배포된 네이티브 앱에서 비밀값으로 사용할 수 없으므로 사용자 인증을 대체하지 않습니다. 실제 서비스에서는 사용자 인증 또는 Android Play Integrity/App Attest 같은 플랫폼 검증을 추가하는 것이 권장됩니다.

## 3. CORS 및 preflight 처리

브라우저에서 실행되는 Expo 웹 클라이언트를 위해 `/api/live-token`에 다음 CORS 정책을 적용했습니다.

- `SAFECALL_ALLOWED_ORIGINS`에 등록된 정확한 Origin만 허용
- `POST`와 `OPTIONS` 메서드 허용
- `Content-Type`과 `X-Client-Environment` 요청 헤더 허용
- credential 기반 CORS 비활성화
- preflight 결과를 최대 1시간 캐시
- `OPTIONS` preflight 요청은 토큰 발급과 rate limit 처리를 실행하지 않음

CORS는 브라우저 보안 정책이므로 Android/iOS 네이티브 요청에는 적용되지 않습니다. 네이티브 요청은 `X-Client-Environment` 검증을 받습니다.

관련 파일:

- `src/main/java/com/safecall/service/token/LiveTokenWebConfiguration.java`
- `src/main/java/com/safecall/service/token/LiveTokenAccessInterceptor.java`

## 4. IP 기반 요청 제한

한 클라이언트 IP가 일정 시간 동안 과도하게 임시 토큰을 발급하지 못하도록 고정 윈도우 방식의 rate limit을 추가했습니다.

기본 설정은 IP당 60초 동안 10회입니다. 제한을 초과하면 `429 Too Many Requests`와 오류 코드 `G004`를 반환합니다.

현재 카운터는 서버 프로세스 메모리에 저장됩니다. 서버 인스턴스를 여러 개 운영하는 환경에서는 Redis 또는 API Gateway의 공용 rate limiter로 교체해야 전체 인스턴스에 동일한 제한을 적용할 수 있습니다.

## 5. 프록시 환경의 실제 클라이언트 IP 처리

클라이언트가 임의의 `X-Forwarded-For` 값을 보내 rate limit을 우회하지 못하도록 다음 전략을 사용합니다.

1. 요청을 직접 보낸 peer IP를 먼저 확인합니다.
2. peer가 `SAFECALL_TRUSTED_PROXY_CIDRS`에 포함되지 않으면 `Forwarded`와 `X-Forwarded-For`를 무시합니다.
3. 신뢰하는 프록시에서 온 요청만 전달 헤더를 파싱합니다.
4. 전달 체인을 오른쪽부터 확인해 신뢰하는 프록시 hop을 제거하고 첫 번째 비신뢰 IP를 클라이언트 IP로 사용합니다.
5. IPv4, IPv6 및 CIDR 설정을 지원합니다.

Spring/Tomcat이 전달 헤더를 먼저 적용하지 않도록 다음 설정도 추가했습니다.

```yaml
server:
  forward-headers-strategy: none
```

운영 환경에서는 로드 밸런서나 reverse proxy의 실제 내부 CIDR만 신뢰 목록에 등록해야 합니다. 클라이언트 대역이나 `0.0.0.0/0`을 등록하면 안 됩니다.

관련 파일:

- `src/main/java/com/safecall/service/token/ClientIpResolver.java`

## 6. 공통 오류 응답

Gemini 토큰 기능에서 다음 오류 코드를 사용합니다.

| HTTP 상태 | 코드 | 의미 |
| --- | --- | --- |
| `500` | `G001` | 서버에 Gemini API 키가 설정되지 않음 |
| `502` | `G002` | Google Gemini 토큰 발급 요청 실패 |
| `403` | `G003` | 허용되지 않은 클라이언트 환경 |
| `429` | `G004` | 토큰 요청 횟수 제한 초과 |
| `500` | `C999` | 처리되지 않은 서버 오류 |

모든 오류는 시간, HTTP 상태, 오류 코드, 메시지, 필드 오류 목록, 요청 경로를 포함하는 동일한 JSON 구조로 반환됩니다.

관련 파일:

- `src/main/java/com/safecall/service/common/exception/ErrorCode.java`
- `src/main/java/com/safecall/service/common/exception/ErrorResponse.java`
- `src/main/java/com/safecall/service/common/exception/BusinessException.java`
- `src/main/java/com/safecall/service/common/exception/GlobalExceptionHandler.java`

## 7. 환경변수

새로 사용하는 서버 환경변수는 다음과 같습니다.

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `GEMINI_API_KEY` | 없음 | 서버에서만 사용하는 장기 Gemini API 키 |
| `GEMINI_LIVE_MODEL` | `models/gemini-3.1-flash-live-preview` | 토큰에 고정할 Live 모델 |
| `GEMINI_EPHEMERAL_TOKEN_URL` | Google `v1beta/auth_tokens` URL | 임시 토큰 발급 URL |
| `SAFECALL_GEMINI_CONNECTION_TTL_SECONDS` | `1800` | 생성된 연결의 사용 가능 시간 |
| `SAFECALL_GEMINI_NEW_SESSION_TTL_SECONDS` | `60` | 새 세션 시작 가능 시간 |
| `SAFECALL_ALLOWED_CLIENT_ENVIRONMENTS` | `development` | 허용할 클라이언트 환경 이름 목록 |
| `SAFECALL_ALLOWED_ORIGINS` | 로컬 Expo Origin 목록 | 허용할 브라우저 Origin 목록 |
| `SAFECALL_TRUSTED_PROXY_CIDRS` | 빈 값 | 전달 IP 헤더를 신뢰할 프록시 CIDR 목록 |
| `SAFECALL_LIVE_TOKEN_RATE_LIMIT_REQUESTS` | `10` | 윈도우당 IP별 최대 요청 횟수 |
| `SAFECALL_LIVE_TOKEN_RATE_LIMIT_WINDOW_SECONDS` | `60` | rate limit 윈도우 길이 |

설정 예시는 `.env.example`에서 확인할 수 있습니다. 실제 `.env`와 `GEMINI_API_KEY`는 Git에 커밋하면 안 됩니다.

## 8. 테스트 추가

다음 동작을 검증하는 테스트를 추가했습니다.

- Gemini API 키가 없을 때 표준 `G001` 응답 반환
- 토큰이 한 번만 사용되도록 설정되는지 검증
- 모델, 오디오 응답, 전사 및 수동 음성 감지 설정 검증
- 신뢰하지 않는 peer가 보낸 전달 IP 헤더 무시
- 신뢰하는 프록시 체인에서 실제 클라이언트 IP 선택
- 클라이언트 환경 헤더 누락 및 미등록 값 거부
- IP별 요청 횟수 제한
- 허용된 Origin의 CORS preflight 처리
- 미등록 브라우저 Origin 거부
- 공통 오류 응답 직렬화

테스트 실행:

```powershell
cd server
.\gradlew.bat test
```

관련 테스트 디렉터리:

- `src/test/java/com/safecall/service/token/`
- `src/test/java/com/safecall/service/common/exception/`
