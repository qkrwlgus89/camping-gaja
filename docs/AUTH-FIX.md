# v1.1.1 익명 입장 / 채팅 오류 수정

2026-11-18 KST, 사용자가 제공한 `https://camping-gaja.vercel.app/`의 공개 클라이언트 설정과 Supabase `/auth/v1/settings`를 읽기 전용으로 확인했습니다. 연결 프로젝트는 `keahonlnsjvdzdpkngcs`이고 최초 조회에서 `external.anonymous_users=false`, `disable_signup=false`, HTTP 200이었습니다. 키 원문과 세션 토큰은 이 문서에 기록하지 않습니다.

원인: Supabase 익명 입장이 꺼져 있는데 앱이 모든 인증 오류를 같은 문장으로 숨겼습니다. 연결 실패 뒤에도 채팅 입력창이 활성화되고, 보내기를 누르면 공유되지 않는 로컬 메시지를 전송한 것처럼 추가하는 문제가 있었습니다. 오류 텍스트도 채팅 본문 바깥에 기본 크기로 표시됐습니다.

운영 설정은 Supabase Dashboard → Authentication → Sign In / Providers에서 **Allow anonymous sign-ins**를 켜고 **Save changes**로 저장해야 합니다. 노란 RLS 안내 박스는 오류가 아닙니다. 기존 두 SQL 마이그레이션은 authenticated 게스트 권한을 제한하도록 작성되어 있습니다. 설정만 저장하는 데는 앱 재배포가 필요하지 않습니다.

수정:

- 실제 인증 오류 code를 보존하고, 익명 입장 비활성/가입 중지/요청 제한/CAPTCHA/네트워크 오류를 구분합니다. DB 함수·테이블 누락은 `CAMP_SETUP_REQUIRED`로 구분합니다. 원문 응답이나 토큰은 화면에 출력하지 않습니다.
- 미연결 채팅에는 안내와 **다시 연결** 버튼을 표시하고 입력/전송을 차단합니다. 혼자 캠핑은 계속 이용할 수 있습니다.
- 재연결이 성공하면 새로고침 없이 입력을 활성화합니다. 초대 입장도 인증 연결이 성공한 뒤에 수행합니다.
- 전송 성공 시에만 초안을 비우고, 실패한 글을 전송된 로컬 대화처럼 만들지 않습니다.
- 모바일에서도 오류 안내를 채팅 박스 안에서 줄바꿈하고 크기를 제한합니다.

검증: `npm test` 13/13, Next.js 프로덕션 빌드 통과. 실패→재연결 브라우저 회귀 검사 및 기존 독립 두 세션 시나리오 결과는 `auth-fix-test-results.json`에 기록합니다. 실제 Supabase 설정 변경, GitHub 커밋/푸시, Vercel 배포는 수행하지 않았습니다.

후속 실제 서비스 진단: 사용자 설정 저장 후 `external.anonymous_users=true`, 실제 익명 가입 HTTP 200을 확인했습니다. 그다음 앱 `/api/grounds`는 503, `/api/rooms/<미존재 UUID>`는 `ROOM_SERVICE_ERROR` 503이었습니다. 게스트 JWT로 `campground_state`, `camp_rooms`에 `limit=0` 읽기 요청을 보냈고 두 테이블 모두 PGRST205/404였습니다. 따라서 현재 남은 운영 조치는 두 SQL 마이그레이션 적용입니다. 실제 운영 DB에 SQL을 대신 실행하지 않았습니다.
