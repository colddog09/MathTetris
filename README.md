# PRIME STACK · MathTetris

소수와 합성수를 판단하며 플레이하는 웹 기반 수학 테트리스 게임입니다. 싱글 점수 경쟁, 실시간 1:1 방 대전, 아이템전, Supabase 스코어보드를 지원합니다.

- 운영 사이트: <https://math-tetris-nine.vercel.app>
- 게임 방법: [HOW_TO_PLAY.md](HOW_TO_PLAY.md)
- 배포 보안 체크리스트: [DEPLOYMENT_SECURITY.md](DEPLOYMENT_SECURITY.md)

## 주요 기능

- 소수·합성수 블록을 이용한 점수 계산과 5단계 난이도
- 공개 방 목록 기반 실시간 1:1 멀티플레이
- 난이도 투표, 불일치 시 돌림판 결정
- 먹물, 초고속, 좌우 반전 등 8종의 아이템전

## 사용자 흐름

```text
학번·이름 입력
  → 싱글 / 멀티 선택
  → 난이도 결정
  → 게임
  → 결과
  → 스코어보드
```

멀티플레이는 공개 방 생성·참가 → 아이템전 설정 → 난이도 투표 → 준비 → 대전 순서로 진행됩니다.

## 기술 구성

| 영역 | 구성 |
|---|---|
| 화면·게임 | HTML, CSS, Canvas, Vanilla JavaScript ES Modules |
| 서버 API | Vercel Functions (`api/`) |
| 멀티플레이 | Supabase Realtime Broadcast |
| 스코어보드 | Supabase Postgres + RLS |
| 배포 | GitHub `main` → Vercel Production |

```text
api/                    서버 전용 스코어보드 API
js/main.js              화면 흐름, 멀티플레이, 결과 처리
js/tetris.js            보드, 점수, 중력, 줄 삭제 로직
js/multiplayer.js       Supabase Realtime 방·대전 통신
scripts/generate-config.js
                        환경변수로 브라우저 공개 설정 생성
supabase-security.sql   RLS, 스코어보드 SQL
vercel.json             빌드 및 보안 헤더
```

## 로컬 실행

요구 사항은 Node.js 20 이상, Vercel CLI, Supabase 프로젝트입니다.

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
| `ALLOW_TEST_NICKNAME` | 예 | 공개 가능 | Production에서는 반드시 `false` |
| `SUPABASE_URL` | 예 | 공개 가능 | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | 예 | 공개 가능 | 브라우저용 Publishable/Anon 키 |
| `SUPABASE_SECRET_KEY` | 예 | 서버 전용 | 스코어보드 저장용 Secret 키 |

## 배포

이 저장소는 GitHub `main` 브랜치가 Vercel Production에 연결돼 있습니다.

```bash
git push origin main
```

Vercel 환경변수 변경은 기존 배포에 소급 적용되지 않으므로 값을 바꾼 뒤 새 Production 배포가 `Ready`인지 확인해야 합니다.

배포 전 필수 확인:

1. `npm run build`와 JavaScript 구문 검사가 성공하는가?
2. `supabase-security.sql` 최신본을 실행했는가?
3. `ALLOW_TEST_NICKNAME=false`인가?
4. Secret 키가 GitHub, HTML, `js/`에 포함되지 않았는가?
5. Vercel Firewall 제한과 `vercel.json` 보안 헤더가 적용됐는가?

## 알려진 제약

- 게임 점수와 멀티 승패는 브라우저에서 계산됩니다. 대회급 조작 방지가 필요하면 서버 권위형 리플레이·결과 검증이 추가로 필요합니다.
- 서버 함수 내부 rate limit은 인스턴스별 보조 장치이므로 운영에서는 Vercel Firewall도 설정해야 합니다.
- Supabase 브라우저 SDK를 `esm.sh`에서 불러오므로 해당 CDN 장애 시 로그인·멀티·스코어보드가 영향을 받습니다.
- 자동화된 브라우저 E2E 테스트는 아직 없습니다. 멀티 흐름은 배포 전 두 브라우저와 테스트 학번으로 수동 확인해야 합니다.

## 문제 해결

- 멀티 연결 실패: Supabase Anonymous Sign-In, Realtime private 정책, 브라우저 콘솔을 확인합니다.
- 환경변수 변경 후에도 이전 동작: 새 Vercel Production 배포가 `Ready`인지 확인합니다.

Secret 키를 채팅, GitHub, 스크린샷에 올렸다면 즉시 재발급하세요.

## 라이선스

현재 별도 라이선스 파일이 없습니다. 외부 공개·재사용을 허용하려면 운영자가 원하는 조건에 맞는 `LICENSE`를 추가해야 합니다.
