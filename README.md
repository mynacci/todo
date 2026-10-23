# 할 일 관리 앱

1년 목표 → 주간 계획 → 할 일을 연결하고, 칸반 보드(할 일 / 진행 중 / 완료)에서 드래그 앤 드롭으로 상태를 바꾸면 주간·목표 진행률이 자동으로 갱신되는 앱입니다.

- Next.js 16 (App Router) · React 19 · TypeScript
- MongoDB (Mongoose) · Next.js Route Handlers (`/api/*`)
- TanStack Query (낙관적 업데이트) · @dnd-kit (드래그 앤 드롭, 키보드 지원)
- 테스트: Vitest (+ mongodb-memory-server)

문서: [PRD](docs/PRD.md) · [구현 계획](docs/PLAN.md)

## 실행 방법

```bash
npm install
```

### 방법 1. MongoDB가 없는 경우 (인메모리, 권장 시작점)

```bash
npm run dev:mem
```

`mongodb-memory-server`로 임시 MongoDB(기본 포트 27018, 변경: `MEM_MONGO_PORT`)를 띄우고 `MONGODB_URI`를 자동 설정한 뒤 `next dev`를 실행합니다. 종료하면 데이터는 사라집니다. 처음 실행 시 MongoDB 바이너리를 내려받습니다.

### 방법 2. 직접 설치한 MongoDB / Atlas / Docker

`.env.example`을 `.env.local`로 복사하고 `MONGODB_URI`를 설정합니다.

```bash
cp .env.example .env.local   # MONGODB_URI=mongodb://127.0.0.1:27017/todo
npm run dev
```

브라우저에서 <http://localhost:3000> (포트가 사용 중이면 터미널에 표시된 주소)을 열면 `/board`로 이동합니다.

## GitHub 로그인 설정 (OAuth App)

모든 `/api/*` 요청은 로그인이 필요하며(미인증 시 `401 {error:{code:"UNAUTHORIZED"}}`), 각 사용자는 자기 목표/주간 계획/할 일만 보고 수정할 수 있습니다.

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App** (<https://github.com/settings/developers>)
2. 입력값 (`APP_URL`이 `http://localhost:3000`인 경우)
   | 항목 | 값 |
   |---|---|
   | Application name | 자유 (예: `Todo (local)`) |
   | Homepage URL | `http://localhost:3000` (= `APP_URL`) |
   | Authorization callback URL | `http://localhost:3000/auth/github/callback` (= `{APP_URL}/auth/github/callback`, 정확히 일치해야 함) |
3. 생성 후 **Client ID**를 복사하고 **Generate a new client secret**으로 시크릿을 만듭니다.
4. `.env.local`에 설정합니다 (시크릿은 절대 커밋하지 않습니다. `.env*`는 `.gitignore` 대상).
   ```bash
   GITHUB_CLIENT_ID=Iv1.xxxxxxxx
   GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxx
   APP_URL=http://localhost:3000
   ```
   배포 환경에서는 `APP_URL`을 실제 공개 주소(`https://...`)로 바꾸고 OAuth App의 두 URL도 같이 바꿉니다(로컬/운영용 OAuth App을 따로 두는 것을 권장).

| 환경 변수 | 필수 | 설명 |
|---|---|---|
| `MONGODB_URI` | ✔ | MongoDB 연결 문자열 |
| `GITHUB_CLIENT_ID` | ✔ | OAuth App Client ID. 없으면 `/auth/github*`가 `500 CONFIG` 응답 |
| `GITHUB_CLIENT_SECRET` | ✔ | OAuth App Client Secret. 서버에서 GitHub 토큰 교환에만 사용 |
| `APP_URL` | 운영 필수 / 개발 권장 | 앱의 공개 기준 URL(콜백 = `{APP_URL}/auth/github/callback`). 개발·테스트에서 미설정 시 요청의 origin 사용, `NODE_ENV=production`에서 미설정이면 `/auth/github*`가 `500 CONFIG`(fail closed) |

### 인증 라우트

| 경로 | 동작 |
|---|---|
| `GET /auth/github[?next=/board]` | 난수 `state`를 httpOnly 쿠키(10분)에 저장하고 GitHub 인가 화면으로 302. `next`는 같은 사이트 경로만 허용 |
| `GET /auth/github/callback` | `state` 검증(불일치/누락·거부·code 누락·GitHub 오류는 모두 `302 /login?error=<OAUTH_STATE|OAUTH_DENIED|OAUTH_CODE|OAUTH_GITHUB>`) → code를 토큰으로 교환 → `api.github.com/user`로 id·login·avatar_url 조회 → User upsert → 세션 쿠키 발급 후 `next`(기본 `/`)로 302. OAuth 쿠키는 항상 삭제 |
| `POST /auth/logout` | DB 세션 삭제 + 쿠키 만료, `200 {data:{loggedOut:true}}`. 다른 Origin이면 403 |
| `GET /auth/logout` | 같은 출처 이동(`Sec-Fetch-Site: same-origin`, 또는 이 헤더가 없을 때 Referer가 앱)일 때만 로그아웃 후 `/`로 302, 그 외 403 (CSRF 로그아웃 방지) |
| `GET /api/me` | `{data:{login, avatarUrl}}`, 미인증 401 |

세션: 32바이트 난수 토큰을 `todo_session` 쿠키(httpOnly, SameSite=Lax, production에서 Secure, Path=/, 14일)로 주고, DB(`sessions`)에는 토큰의 SHA-256 해시만 TTL 인덱스와 함께 저장합니다. GitHub 액세스 토큰은 저장하지 않습니다.

### 기존 데이터 마이그레이션 (userId 없는 데이터 삭제)

로그인 도입 전 데이터에는 소유자(`userId`)가 없어 더 이상 어떤 사용자에게도 보이지 않습니다. 정리하려면:

```bash
npm run migrate:purge-unowned            # dry-run: 컬렉션별 건수만 출력
npm run migrate:purge-unowned -- --yes   # userId 없는 todos → weeks → goals 실제 삭제 (되돌릴 수 없음)
```

`.env`/`.env.local`(또는 환경 변수)의 `MONGODB_URI` 대상 DB에 실행되므로 대상 주소를 확인하고, 필요하면 먼저 백업하세요.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (`MONGODB_URI` 필요) |
| `npm run dev:mem` | 인메모리 MongoDB + 개발 서버 |
| `npm run build` / `npm start` | 프로덕션 빌드 / 실행 (`MONGODB_URI` 필요) |
| `npm run lint` | ESLint |
| `npm run migrate:purge-unowned` | `userId` 없는 기존 데이터 건수 확인(dry-run), `-- --yes`로 삭제 |
| `npm test` | Vitest (API 통합 테스트, 보드 이동 로직, API 클라이언트) |
| `npm run e2e` | Playwright E2E (AC-7 드래그, AC-8 삭제 확인, 로그인 리다이렉트/로그아웃/사용자 격리; Mongo에 사용자·세션을 시드해 쿠키로 로그인). 최초 1회 `npx playwright install chromium` 필요. 포트 3100 / 인메모리 Mongo 27118 사용 (`E2E_PORT`, `E2E_MONGO_PORT`) |

## 화면

| 경로 | 내용 |
|---|---|
| `/board` | 칸반 보드(주간 계획 필터) + 일일 / 주간 / 상태별 목록 보기, 할 일 추가·수정·삭제 |
| `/goals`, `/goals/[id]` | 목표 목록·진행률, 생성/수정/삭제(연결 해제 또는 함께 삭제), 연결된 주간 계획 |
| `/weeks`, `/weeks/[id]` | 주간 계획 목록·진행률, 생성/수정/삭제, 상세(진행률, 해당 주 보드, 미완료 이월) |

## 구조

```
src/
  app/
    api/            REST Route Handlers (goals, weeks, todos)
    board|goals|weeks/   페이지
    layout.tsx      네비게이션 + QueryClientProvider
  components/       Board(dnd-kit), 폼/삭제 모달, 목록, 공통 UI
  lib/
    client.ts       타입 있는 fetch 래퍼 ({error} 응답 시 ApiError throw)
    queries.ts      TanStack Query 훅
    board.ts        낙관적 이동 순수 함수 (computeMove, applyMove)
    schemas.ts, dates.ts, progress.ts ...  서버 로직
  models/           Mongoose 모델
scripts/dev-mem.mjs 인메모리 MongoDB + next dev
tests/              Vitest
```

## 참고

- 응답 형식: 성공 `{ data }`, 실패 `{ error: { code, message } }`.
- 상위 항목(목표/주간 계획) 삭제 시 `?children=unlink|cascade` (기본 `unlink`).
- 보드에서 카드를 옮기면 화면이 즉시 갱신되고 `PATCH /api/todos/:id`로 저장되며, 실패하면 원래대로 되돌리고 오류 메시지를 보여 줍니다.
