# 배포 전 보안 설정

1. `supabase-security.sql`을 Supabase SQL Editor에서 실행합니다.
2. Supabase Authentication에서 Anonymous Sign-Ins를 활성화합니다.
3. Supabase Realtime Settings에서 Allow public access를 비활성화합니다.
4. Naplace Coin 관리자 페이지에서 부스 API 키를 발급하고 Vercel의 `NAPLACE_COIN_API_KEY`에 등록합니다.
5. Vercel에 `.env.example`의 나머지 필수 환경변수를 등록합니다.
6. `GAME_SIGNING_SECRET`은 최소 32자의 무작위 값으로 생성합니다.
7. `SUPABASE_SECRET_KEY`와 `NAPLACE_COIN_API_KEY`는 Vercel 서버 환경변수에만 저장합니다. 브라우저 파일에는 절대 넣지 않습니다.
8. Vercel Firewall에서 다음 경로에 IP 기준 rate limit을 추가합니다.
   - `/api/coin/payment-requests`: 1분당 5회
   - `/api/coin/student`: 1분당 30회
   - `/api/coin/payment-status`: 1분당 60회
   - `/api/coin/payment-cancel`: 1분당 10회
   - `/api/coin/reward`: 1분당 20회
   - `/api/scoreboard`: 1분당 10회
9. `supabase-security.sql` 적용과 서버 키 등록을 확인한 뒤 싱글 실제 보상을 켤 때만 `ALLOW_REAL_REWARDS=true`로 설정합니다.
10. 실제 지급은 저장된 스코어보드 점수와 서버 전용 `coin_settlements` 원장으로 중복을 막습니다. 다만 게임 점수 계산 자체는 아직 브라우저에서 이루어지므로 개발자 도구 조작을 완전히 막으려면 서버 권위형 리플레이 검증이 추가로 필요합니다.
11. 멀티 승패·환불 실제 지급은 서버 권위형 매치 검증 전까지 잠겨 있습니다.

서버 함수의 메모리 rate limit은 보조 장치일 뿐이며 여러 서버 인스턴스에 걸친 공격은 Vercel Firewall 규칙으로 막아야 합니다.
