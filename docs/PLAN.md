# 할 일 관리 앱 프로젝트 계획

**상태: pending approval** (구현 착수 전 사용자 승인 필요)
**근거 문서:** `docs/PRD.md` (P0 §4 L34-59, P1 §4 L61-75)
**확정된 결정:** Next.js(App Router) + TypeScript + MongoDB + Next.js API Routes / 인증 없음, 단일 사용자

## 1. 요구사항 요약
- 3계층: 1년 목표(Goal) ← 주간 계획(Week) ← 할 일(Todo). 각 N:1.
- 할 일 상태 todo/doing/done, 칸반 3컬럼 드래그 앤 드롭으로 즉시 저장.
- 주간 진행률 = done 수 / 전체 수 × 100 (0개면 0%). 1년 목표 진행률(P1)은 연결 주간 계획 집계.
- 상위 항목 삭제 시 하위 "연결 해제" 또는 "함께 삭제" 선택.

## 2. 설계 결정 (가정 포함 - 승인 시 확인)
| 항목 | 결정 | 이유 |
|---|---|---|
| 진행률 | 저장하지 않고 조회 시 집계(aggregation) | PRD "자동 재계산" 충족, 불일치 버그 원천 차단 |
| 주 기준 | 월요일 시작, `startDate`/`endDate`(YYYY-MM-DD 문자열) 저장 | PRD "주 시작일~종료일", 타임존 문제 회피 |
| 1년 목표 집계 | 연결된 주간 계획 진행률의 평균이 아니라 **하위 전체 할 일 기준 done/전체** | 할 일 수가 다른 주를 평균내면 왜곡 |
| 삭제 정책 | `DELETE ...?children=unlink\|cascade` (기본 unlink) | PRD L55 |
| ORM | Mongoose | 스키마/검증 제공, Next.js 표준 사용례 |
| DnD | `@dnd-kit/core` + `sortable` | 유지보수 활발, 접근성(키보드) 지원 |
| 클라이언트 상태 | TanStack Query + 낙관적 업데이트 | 드롭 즉시 반영, 실패 시 롤백 |
| 테스트 | Vitest + mongodb-memory-server, Playwright(핵심 시나리오 1~2개) | |
| 인증 | 없음 (userId 필드 미도입) | 사용자 결정 |

## 3. 데이터 모델 (`src/models/`)
- `Goal`: `title`(필수), `year`(number), timestamps
- `Week`: `title`, `startDate`, `endDate`, `goalId?`(ObjectId, nullable)
- `Todo`: `title`(필수), `date?`, `status`('todo'|'doing'|'done', 기본 'todo'), `weekId?`, `order`(칸반 컬럼 내 순서)
- 인덱스: `Todo{weekId,status}`, `Todo{date}`, `Week{goalId}`, `Week{startDate}`

## 4. API (Next.js Route Handlers, `src/app/api/`)
- `goals` GET/POST, `goals/[id]` GET(진행률·연결 주간 계획 포함)/PATCH/DELETE
- `weeks` GET(`?goalId`,`?from&to`)/POST, `weeks/[id]` GET(진행률 포함)/PATCH/DELETE
- `todos` GET(`?date`,`?weekId`,`?status`,`?q` 검색,P1)/POST, `todos/[id]` PATCH(상태·순서 포함)/DELETE
- 입력 검증은 zod, 오류는 `{error:{code,message}}` + 적절한 HTTP 상태코드.

## 5. 구현 단계

### Phase 0 - 기반 (S)
1. `create-next-app`(TS, App Router), ESLint, Vitest 설정, `.env.example`(MONGODB_URI)
2. `src/lib/db.ts` 연결 캐싱(dev 핫리로드 중복 연결 방지)
3. 공통 응답/에러/zod 헬퍼
- 완료 기준: `npm run build`, `npm test` 통과, 로컬 Mongo 연결 확인

### Phase 1 - 도메인 API (M) - P0
1. 모델 3종 + CRUD 라우트 (§3, §4)
2. 진행률 집계 함수 `src/lib/progress.ts` (순수 함수 + aggregation)
3. 삭제 정책(unlink/cascade) 구현
- 완료 기준: 아래 AC-1~AC-6 단위/통합 테스트 통과

### Phase 2 - UI 골격과 CRUD (M) - P0
1. 레이아웃·네비게이션: 목표 / 주간 / 칸반 보드
2. 목표·주간 계획·할 일 생성/수정 폼(주간 선택 시 상위 목표 연결), 삭제 확인 모달
3. 일일/주간/상태별 목록 조회 뷰

### Phase 3 - 칸반 DnD + 진행률 표시 (M) - P0 핵심
1. 3컬럼 보드, 카드 드래그 시 낙관적 업데이트 + `PATCH /todos/[id]` 저장, 실패 시 롤백·토스트
2. 주간 상세 화면에 진행률 바, 드롭 직후 갱신(쿼리 무효화)
3. 목표 상세에 연결 주간 계획 및 진행률 (P1 선반영 가능)

### Phase 4 - P1 (L, 순차 선택)
우선순위 제안: ① 목표 진행률 ② 필터/정렬/검색 ③ 지연 표시 ④ 이월 ⑤ 주간 회고 ⑥ 알림(웹 푸시/브라우저 Notification, 별도 결정 필요)

### Phase 5 - 마무리 (S)
Playwright 핵심 시나리오, 빈 상태/로딩/에러 UI, README 실행 방법

## 6. 인수 기준 (테스트 가능)
- AC-1: 할 일 생성 시 status 미지정이면 `todo`, 제목 없으면 400.
- AC-2: 주간 계획에 todo 4개 중 done 1개 → 진행률 25. done 4개 → 100. 할 일 0개 → 0 (NaN 아님).
- AC-3: 할 일 상태 변경/생성/삭제 직후 `GET weeks/[id]` 진행률이 즉시 달라진 값을 반환.
- AC-4: 주간 계획 삭제 `children=unlink` → 하위 할 일 존재, `weekId=null`; `cascade` → 하위 할 일 0건. 목표 삭제도 동일하게 주간 계획에 적용.
- AC-5: 목표 진행률 = 하위 모든 주간 계획의 전체 할 일 기준 done/전체 (예: 주A 1/2, 주B 3/4 → 4/6≈67).
- AC-6: 잘못된 status 값(`"x"`) PATCH 시 400, DB 불변.
- AC-7(E2E): 카드를 todo→doing 컬럼으로 드래그 후 새로고침해도 doing 유지, 주간 진행률 표시 갱신.
- AC-8: 삭제 버튼 클릭 시 확인 팝업이 뜨고, 취소하면 삭제되지 않는다.

## 7. 리스크와 대응
| 리스크 | 대응 |
|---|---|
| DnD 저장 실패/경합으로 UI와 DB 불일치 | 낙관적 업데이트 + 실패 롤백 + 재조회, PATCH는 멱등 |
| 주/날짜 타임존·주 경계 오류 | 날짜는 로컬 날짜 문자열, 주 계산 유틸 단위 테스트(연말/연초 포함) |
| Next.js dev에서 Mongo 연결 폭증 | `global` 캐시 연결 패턴 |
| cascade 삭제 오작동으로 데이터 손실 | 기본값 unlink, UI에서 영향 건수 표시 후 확인, 통합 테스트 |
| P1 알림 범위 팽창 | Phase 4 마지막, 별도 승인 후 착수 |

## 8. 검증 절차
1. `npm run lint && npm run build && npm test` 모두 통과
2. AC-1~6 통합 테스트(mongodb-memory-server) 녹색
3. Playwright로 AC-7, AC-8 확인
4. 수동: 목표→주간→할 일 생성 후 보드에서 드래그, 진행률 변화 확인

## 9. 열린 질문 (착수 전 확인)
- MongoDB는 로컬 설치/Docker/Atlas 중 무엇을 쓸지
- 목표 진행률 산식을 위 §2대로(전체 할 일 기준) 해도 되는지
- P1 중 이번 범위에 포함할 항목
