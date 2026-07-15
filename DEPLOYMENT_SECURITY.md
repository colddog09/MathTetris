# 배포 전 보안 설정

1. `supabase-security.sql`을 Supabase SQL Editor에서 실행합니다.
2. Supabase Authentication에서 Anonymous Sign-Ins를 활성화합니다.
3. Supabase Realtime Settings에서 Allow public access를 비활성화합니다.
4. Vercel에 `.env.example`의 필수 환경변수를 등록합니다.
5. `SUPABASE_SECRET_KEY`는 Vercel 서버 환경변수에만 저장합니다. 브라우저 파일에는 절대 넣지 않습니다.
6. Vercel Firewall에서 다음 경로에 IP 기준 rate limit을 추가합니다.
   - `/api/scoreboard`: 1분당 10회
7. 게임 점수 계산 자체는 아직 브라우저에서 이루어지므로 개발자 도구 조작을 완전히 막으려면 서버 권위형 리플레이 검증이 추가로 필요합니다.
8. 멀티 승패 판정은 클라이언트가 제출하므로 대회급 공정성이 필요하면 서버 권위형 결과 검증을 추가해야 합니다.

서버 함수의 메모리 rate limit은 보조 장치일 뿐이며 여러 서버 인스턴스에 걸친 공격은 Vercel Firewall 규칙으로 막아야 합니다.
