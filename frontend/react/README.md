# SafeCall Web

React + TypeScript + Vite 기반 Gemini Live 음성 대화 화면입니다.

## 실행

1. `../../server/.env`에 `GEMINI_API_KEY`를 설정하고 서버를 실행합니다.
2. 이 폴더에서 다음 명령을 실행합니다.

```powershell
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 열고 **대화 시작하기**를 누른 후 마이크를 허용합니다. 서버 기본 포트는 8080입니다. 개발 중 `/api` 요청은 Vite 프록시로 전달하므로 별도 CORS 설정 없이 실행됩니다.

## 기능

- 서버 `POST /api/live-token`에서 일회용 토큰을 받아 Gemini에 직접 WebSocket 연결
- AudioWorklet에서 16 kHz 모노 PCM으로 변환하여 100ms 단위로 전송
- 서버의 자동 발화 감지 사용, 응답 PCM을 Web Audio로 즉시 순차 재생
- 끼어들기 시 예약된 응답 오디오 재생 중단
- 실시간 입력/응답 자막, 텍스트 입력, 마이크 음소거, 연결 취소 및 종료
- 권한 거부, 연결 시간 초과, 세션 종료 오류 안내와 오디오 자원 정리

자막은 서버가 보내는 전사 내용을 표시하며 현재 페이지 메모리에만 유지됩니다. 재연결 시 이전 기록은 화면에 남지만 Gemini에는 새로운 세션으로 연결됩니다.

## 설정 및 배포

필요하면 `.env.example`을 `.env`로 복사합니다.

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 빈 값 (동일 출처) | 토큰 서버 주소 |
| `VITE_CLIENT_ENVIRONMENT` | `development` | 서버가 허용한 `X-Client-Environment` 값 |

`npm run build` 결과인 `dist/`를 배포합니다. 배포에서는 HTTPS가 필요합니다(localhost 제외). Vite 개발 프록시는 빌드에 포함되지 않으므로 웹 서버에서 `/api`를 백엔드로 프록시하거나, `VITE_API_BASE_URL`을 설정한 뒤 빌드하고 서버의 `SAFECALL_ALLOWED_ORIGINS`에 웹 출처를 등록합니다. `npm run preview`도 API 프록시를 제공하지 않습니다. 프론트엔드 환경 변수에 Gemini API 키를 넣지 마세요.

```powershell
npm test
npm run build
```

실제 음성 연결 확인에는 실행 중인 서버, Live API 접근 가능한 키, 마이크가 필요합니다. 이어폰을 사용하면 스피커 소리가 마이크로 다시 들어가는 현상을 줄일 수 있습니다.

프로토콜 참고: https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket
