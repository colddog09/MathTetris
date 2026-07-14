# PRIME STACK · MathTetris

소수와 합성수를 판단하며 플레이하는 웹 기반 수학 테트리스 게임입니다. 싱글 점수 경쟁, 실시간 1:1 방 대전, 아이템전, Naplace Coin 참가비·배팅·보상, Supabase 스코어보드를 지원합니다.

- 운영 사이트: <https://math-tetris-nine.vercel.app>
- 게임 방법: [HOW_TO_PLAY.md](HOW_TO_PLAY.md)
- Naplace Coin API: <https://naplace-coin.vercel.app/docs>
- 배포 보안 체크리스트: [DEPLOYMENT_SECURITY.md](DEPLOYMENT_SECURITY.md)

## 주요 기능

- 소수·합성수 블록을 이용한 점수 계산과 5단계 난이도
- 싱글 점수 구간별 실제 코인 보상과 1위 갱신 보너스
- 공개 방 목록 기반 실시간 1:1 멀티플레이
- 난이도 투표, 불일치 시 돌림판 결정, 즉시 배팅 결제
- 먹물, 초고속, 좌우 반전 등 8종의 아이템전
- 결제 전 이름·잔액·결제 금액 확인 창
- 결제 및 보상의 영구 중복 실행 방지 원장

## 사용자 흐름

```text
학번·이름 입력
  → Naplace Coin 이름·잔액 확인
  → 500코인 즉시 결제
  → 싱글 / 멀티 선택
  → 난이도 결정
  → 게임
  → 결과·코인 정산
  → 스코어보드
```

멀티플레이는 공개 방 생성·참가 → 아이템전 설정 → 각자 배팅 결제 → 난이도 투표 → 준비 → 대전 → 배팅 정산 순서로 진행됩니다.

## 기술 구성

| 영역 | 구성 |
|---|---|
| 화면·게임 | HTML, CSS, Canvas, Vanilla JavaScript ES Modules |
| 서버 API | Vercel Functions (`api/`) |
| 멀티플레이 | Supabase Realtime Broadcast |
| 스코어보드·정산 원장 | Supabase Postgres + RLS |
| 결제·보상 | Naplace Coin `/api/v1/transfer` |
| 배포 | GitHub `main` → Vercel Production |

```text
api/                    서버 전용 결제·보상·스코어보드 API
js/main.js              화면 흐름, 멀티플레이, 결과 처리
js/tetris.js            보드, 점수, 중력, 줄 삭제 로직
js/multiplayer.js       Supabase Realtime 방·대전 통신
js/coin-api.js          브라우저에서 호출하는 내부 코인 API
scripts/generate-config.js
                        환경변수로 브라우저 공개 설정 생성
supabase-security.sql   RLS, 스코어보드, 코인 정산 원장 SQL
vercel.json             빌드 및 보안 헤더
```

## 로컬 실행

요구 사항은 Node.js 20 이상, Vercel CLI, Supabase 프로젝트, Naplace Coin 부스 API 키입니다.

```bash
git clone https://github.com/colddog09/MathTetris.git
cd MathTetris
npm run build
npx vercel dev --listen 3000
```

1. [`.env.example`](.env.example)을 참고해 환경변수를 준비합니다.
2. Supabase SQL Editor에서 [`supabase-security.sql`](supabase-security.sql)을 실행합니다.
3. Vercel에 연결된 환경이라면 `vercel env pull`로 환경변수를 받을 수 있습니다.

실제 키가 들어간 `.env` 파일은 커밋하지 말고, 서버 전용 키는 `js/` 아래 파일에 넣지 마세요.

## 환경변수

| 변수 | 필수 | 범위 | 설명 |
|---|---:|---|---|
| `NAPLACE_COIN_API_KEY` | 예 | 서버 전용 | Naplace Coin 부스 API 키 |
| `NAPLACE_COIN_BASE_URL` | 아니요 | 서버 전용 | 기본값 `https://naplace-coin.vercel.app/api/v1` |
| `GAME_SIGNING_SECRET` | 예 | 서버 전용 | 결제·게임 토큰 HMAC 키, 최소 32자 |
| `ENTRY_COIN_PRICE` | 예 | 공개 가능 | 기본 참가비, 테스트값 0 · 운영 권장값 500 |
| `MIN_WAGER_COINS` | 아니요 | 공개 가능 | 멀티 배팅 최소 금액, 기본값 100 (`ENTRY_COIN_PRICE=0`일 때는 0코인 배팅만 허용) |
| `MAX_WAGER_COINS` | 예 | 서버 전용 | 1인 최대 배팅액 |
| `ALLOW_REAL_REWARDS` | 예 | 서버 전용 | `true`일 때 실제 보상 지급 |
| `ALLOW_TEST_NICKNAME` | 예 | 공개 가능 | Production에서는 반드시 `false` |
| `SUPABASE_URL` | 예 | 공개 가능 | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | 예 | 공개 가능 | 브라우저용 Publishable/Anon 키 |
| `SUPABASE_SECRET_KEY` | 예 | 서버 전용 | 스코어·정산 원장용 Secret 키 |

```bash
openssl rand -base64 48  # GAME_SIGNING_SECRET 생성 예시
```

## 결제와 정산 구조

- 사이트 확인 창에서 승인하면 서버가 Naplace Coin `/transfer`를 `student_to_club` 방향으로 호출합니다.
- 학생 지갑의 별도 승인 화면은 없지만 Naplace Coin API 키 인증은 서버에서 수행합니다.
- 각 결제 시도는 UUID를 가지며 `coin_settlements`에 먼저 기록됩니다.
- 동일 UUID가 재전송돼도 실제 차감은 한 번만 수행됩니다.
- 싱글 보상은 저장된 스코어보드 점수와 1위 보너스를 다시 읽고 지급합니다.
- 멀티 보상은 같은 방의 서명된 두 배팅 토큰과 배팅 총액을 검증합니다.
- 전송 결과가 불명확하면 자동 재시도하지 않아 이중 지급·차감을 막습니다.

## 배포

이 저장소는 GitHub `main` 브랜치가 Vercel Production에 연결돼 있습니다.

```bash
git push origin main
```

Vercel 환경변수 변경은 기존 배포에 소급 적용되지 않으므로 값을 바꾼 뒤 새 Production 배포가 `Ready`인지 확인해야 합니다.

배포 전 필수 확인:

1. `npm run build`와 JavaScript 구문 검사가 성공하는가?
2. `supabase-security.sql` 최신본을 실행했는가?
3. `ENTRY_COIN_PRICE=500`, `ALLOW_REAL_REWARDS=true`, `ALLOW_TEST_NICKNAME=false`인가?
4. Naplace Coin 키가 `/api/v1/me`에서 200을 반환하는가?
5. Secret 키가 GitHub, HTML, `js/`에 포함되지 않았는가?
6. Vercel Firewall 제한과 `vercel.json` 보안 헤더가 적용됐는가?
7. 실거래 테스트는 승인된 테스트 학번과 소액으로 수행하는가?

## 알려진 제약

- 게임 점수와 멀티 승패는 브라우저에서 계산됩니다. 대회급 조작 방지가 필요하면 서버 권위형 리플레이·결과 검증이 추가로 필요합니다.
- 시작 전 연결 종료 자동 환불은 승리 정산과 중복될 위험 때문에 자동 지급하지 않습니다.
- 서버 함수 내부 rate limit은 인스턴스별 보조 장치이므로 운영에서는 Vercel Firewall도 설정해야 합니다.
- 외부 서비스 장애 시 결제 결과가 `unknown`으로 남을 수 있습니다. 자동 재결제하지 말고 원장과 거래 내역을 확인해야 합니다.
- Supabase 브라우저 SDK를 `esm.sh`에서 불러오므로 해당 CDN 장애 시 로그인·멀티·스코어보드가 영향을 받습니다.
- 자동화된 브라우저 E2E 테스트는 아직 없습니다. 결제·멀티 흐름은 배포 전 두 브라우저와 테스트 학번으로 수동 확인해야 합니다.

## 문제 해결

- `유효하지 않은 API 키`: Naplace Coin 키를 재발급하고 Vercel 값을 교체한 뒤 재배포합니다.
- `GAME_SIGNING_SECRET은 32자 이상`: 32자 이상의 무작위 값으로 교체하고 재배포합니다.
- `이미 처리 중이거나 확인이 필요한 정산`: `coin_settlements`와 Naplace Coin 거래 내역을 함께 확인합니다.
- 멀티 연결 실패: Supabase Anonymous Sign-In, Realtime private 정책, 브라우저 콘솔을 확인합니다.
- 환경변수 변경 후에도 이전 동작: 새 Vercel Production 배포가 `Ready`인지 확인합니다.

API 키나 Secret 키를 채팅, GitHub, 스크린샷에 올렸다면 즉시 재발급하세요. 실제 코인 관련 변경은 모의 API로 먼저 검증하고 운영에서는 소액으로 최종 확인하는 것을 권장합니다.

## 라이선스

현재 별도 라이선스 파일이 없습니다. 외부 공개·재사용을 허용하려면 운영자가 원하는 조건에 맞는 `LICENSE`를 추가해야 합니다.
