# 캠핑가자 v1.1.1

인제 숲에서 별을 보고, 짐을 놓고, 함께 머무르는 3인칭 캠핑 웹입니다. 입장 전 0~3개의 용품을 고르고 공동 캠핑장에 들어갑니다. 각 텐트는 친구 초대로 최대 4명, 텐트 밖에서는 다른 캠퍼도 만납니다. 최초 기획서의 비공개 2인 구상은 사용자의 후속 요청에 따라 공동 캠핑장·4인 텐트로 확장했습니다.

Next.js App Router 16.4.6 / React 19.3.1 / TypeScript / R3F 9.8.2 / Three.js 0.187.0. 화면과 API는 Vercel, 게스트 인증·방·실시간 구독은 Supabase 구조입니다. `package-lock.json`으로 버전을 고정했습니다.

로컬 검증 결과·남은 확인은 [VERIFICATION](docs/VERIFICATION.md), 녹음·모델의 출처는 [ASSETS](docs/ASSETS.md)에 기록합니다. 실제 Supabase·기상청 키·Vercel 계정은 제공되지 않아 외부 서비스 연결/배포 검증은 수행하지 않았습니다.

## 실행

Node 22+ (검증 환경 24.14.1), npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`http://localhost:3000`. 키 없이도 혼자 체험할 수 있습니다. 외부 서비스 없이 일반 창/시크릿 창으로 공동 캠핑장을 시험할 때만 `.env.local`에 `ENABLE_LOCAL_DEMO=true`를 설정하세요. 이 어댑터는 **한 Node 프로세스 메모리**를 사용하고 서버 재시작 시 사라집니다. Vercel에서는 활성화되지 않습니다. 실제 배포의 멀티플레이는 Supabase 설정이 필요합니다.

## 환경 변수

| 변수 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개 publishable key. 기존 `NEXT_PUBLIC_SUPABASE_ANON_KEY`도 지원 |
| `SUPABASE_SECRET_KEY` | 서버 전용 secret key. 기존 `SUPABASE_SERVICE_ROLE_KEY`도 지원 |
| `KMA_SERVICE_KEY` | 공공데이터포털 기상청 단기예보 조회서비스 **Decoding** 키, 서버 전용 |
| `ENABLE_LOCAL_DEMO` | 기본 false, 단일 프로세스 로컬 검증 전용 |
| `NEXT_PUBLIC_ENABLE_SCENE_LAB` | 기본 false. 비공개 프리뷰에서만 true. 개발 서버에서는 자동 활성화 |

`NEXT_PUBLIC_*`는 빌드 후 변경하면 재배포해야 합니다. 서비스 키·기상청 키는 `NEXT_PUBLIC_`로 노출하지 않습니다. `.env.local`은 Git에서 제외합니다.

## Supabase

1. Authentication → Anonymous Sign-Ins를 켭니다. 입장 버튼을 누르면 익명 세션을 확보합니다.
2. 다음 두 마이그레이션을 **순서대로** SQL Editor에 실행하거나 CLI로 적용합니다. 기존 v1 DB에도 두 번째 마이그레이션을 적용해야 4좌석/공동 캠핑장이 동작합니다.
   - `supabase/migrations/202611170001_camp.sql`
   - `supabase/migrations/202611170002_community.sql`

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

3. Realtime을 활성화하고 Allow public access를 끕니다. SQL은 `camp_rooms`, `camp_weather`, `campground_state`를 publication에 추가합니다. 사용자에게 직접 DB 쓰기 권한은 없습니다.
4. Site URL을 배포 HTTPS URL로 지정합니다. 익명 인증은 이메일 리디렉션이 필요 없습니다.
5. 선택적으로 마이그레이션의 정리 예시를 pg_cron으로 등록합니다. 방은 활동이 30분 없으면 만료되고, 좌석은 마지막 heartbeat부터 90초 유지합니다.

방 정원 4명, `(room_id,seat)` UNIQUE 및 0~3 CHECK, 행 잠금 아래 좌석 배정/초대 소비를 처리합니다. 초대는 32바이트 난수·SHA-256 저장·30분·1인용이며 URL fragment로 전달합니다. 각 친구를 위해 새 링크를 발급합니다. 브라우저 세션 삭제/90초 초과 부재 뒤에는 기존 친구 텐트의 새 초대가 필요합니다.

공동 야외 이동은 인증된 `grounds:inje` 비공개 Broadcast 채널에서 약 10Hz 전송하고 상대 아바타를 보간합니다. 모든 입장자는 야외의 이동·인사·공유 화로·물수제비·공개 대화를 볼 수 있습니다. 같은 방 참가자만 실내에서 상대를 표시합니다. 텐트는 채팅 암호화 공간이 아니며 공개 채팅에는 개인 정보를 쓰지 않도록 서비스 안내가 필요합니다. 개인 저널은 전송하지 않습니다.

방 상태는 `camp:<roomId>:<epoch>`의 권한으로 제한하고 구성원 변경 시 epoch를 회전합니다. 30초 heartbeat, 4초 재조회로 누락을 보완합니다. 로컬 어댑터는 650ms 공동 캠핑장/450ms 방 조회와 HTTP 이동으로 대체합니다. 실서비스 WebSocket의 부하/지연은 아직 확인하지 않았습니다. 현재 화면은 기본 8개 텐트에 점유 텐트를 더해 최대 24개 텐트·32개 상대 아바타를 표시합니다. 대규모 동시 접속·광장 분할 운영은 미검증입니다. 지속 변경은 서버가 JWT를 검증한 뒤 서비스 전용 RPC로만 수행하며 요청 ID로 중복 처리를 막습니다.

API: `/api/time`, `/api/weather`, `/api/grounds`(입장·조회·heartbeat·용품 배치·공동 화로·공개 대화·체험), `/api/rooms`, `/api/rooms/:id`(초대·입장·좌석·재접속), `/api/session`(로컬 전용). 인증 요청은 `Authorization: Bearer <guest token>`을 사용합니다.

## 조작·장면

- PC: WASD/방향키, 드래그로 좌우·위아래 보기, J/L 회전, R 앉기/일어나기, H 손 인사, E 체험, M 소리, B 가방. 모바일은 일어나기 후 가상 조이스틱·풍경 드래그.
- 내 아바타가 보이는 3인칭 시점. 몸은 실제 이동 방향으로 부드럽게 돌아가며 카메라 회전과 독립적입니다. 이동·카메라를 같은 렌더 프레임에서 갱신하고 네트워크 갱신률과 분리합니다. 저속 기기에서는 DPR을 단계적으로 낮춥니다.
- 별 관측: 관측 별 41,411개, 현재 인제 지평좌표, 별자리 연결선/찾기, 달 표면·위상. **은하수 없음**. 달의 위치·크기는 관측 편의를 위한 연출입니다.
- 마시멜로는 화로 위 꼬치 축을 중심으로 회전합니다. 계곡에서는 실제 3D 돌의 튐/수면 물결을 표시합니다. 두 체험은 모달을 열지 않습니다.
- 텐트 안: 차 우리기, 침낭에 눕기, 개인 저널, 랜턴 밝기. 가방의 용품은 내 텐트 앞/공동 화로 6m 이내에 배치합니다. 바닥 미리보기와 허용/불가 테두리, `여기에 놓기` 버튼, 배치 후 이름 표시를 제공합니다.
- 엽서: 3D 또는 구역 스틸 + 선택한 JPG/PNG/WebP 사진(15MB 이하) + 날짜/날씨를 브라우저 Canvas에서 PNG로 합성합니다. 사진 업로드 API는 없습니다.
- 첫 재생은 **소리 켜기**. 실제 CC0 환경음 5종, 위치/날씨에 따른 믹싱, 개인 음량, ASMR 화면. 새로고침하면 무음으로 시작합니다.
- WebGL 실패·context loss·16초 준비 지연이면 구역별 스틸/이동 버튼을 제공합니다. `/?view=still`로도 시험할 수 있습니다. 스틸 모드에는 3D 아바타/돌의 움직임이 없고, 버튼 체험과 공유 상태·엽서를 계속 사용할 수 있습니다.

## 시간·기상청

[기상청 단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do)의 초단기실황 PTY/RN1/T1H와 초단기예보 SKY를 사용합니다. 기준은 [공식 고캠핑 방태산 #1245](https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=1245)의 37.9242191 N,128.3970647 E(격자 84,135)이며 가상 지형은 창작입니다.

15분 발표 지연 여유·직전 발표 재시도, 10분 공유 DB 캐시·30초 갱신 lease, 2시간 경과/키 없음은 중립 날씨로 전환합니다. 같은 캠프는 같은 자료 버전을 읽습니다. KST 표기는 `Intl/Asia/Seoul`, 조명은 SunCalc 태양 고도 기준입니다. `/api/time` 실패 시 기기 시각으로 진행합니다.

설정 → 날씨·시간 실험실에서 맑음/비/진눈깨비/눈/자료 없음/2시간 경과/새벽/낮/노을/밤/자정/WebGL 중단을 시험합니다. 날씨 샘플은 공동 캠핑장에 공유되고 시간 미리 보기는 개인 설정입니다. 공개 배포에서는 실험실을 꺼 두세요.

## v1.1.1을 별도 Preview URL로 배포

Vercel에 Next.js 프로젝트를 연결하고 Preview 환경에 위 Supabase·KMA 값을 먼저 설정합니다. Install `npm ci`, Build `npm run build`, Output 기본값, Node 24.x. 새 Preview는 기존 Production URL을 변경하지 않습니다.

```sh
npx vercel@latest login
npx vercel@latest link
npx vercel@latest deploy --meta release=v1.1.1
```

`link`에서는 기존 camping-gaja 프로젝트를 선택합니다. 완전히 별도 프로젝트가 필요하면 이 단계에서 새 `camping-gaja-v1-1` 프로젝트를 선택/생성하고 그 프로젝트에도 환경 변수를 넣으세요. 새 프로젝트의 첫 배포는 그 새 프로젝트의 Production이 되며, 기존 camping-gaja에는 영향을 주지 않습니다. `deploy`가 새 Preview URL을 출력합니다. 이 작업에서는 원격 push/실제 배포를 수행하지 않았습니다.

Preview 확인 후 기존 Production으로 승격하려는 경우에만:

```sh
npx vercel@latest deploy --prod --meta release=v1.1.1
```

## 검증

```sh
npm run typecheck
npm test
npm run build
# ENABLE_LOCAL_DEMO=true, NEXT_PUBLIC_ENABLE_SCENE_LAB=true로 실행한 서버 필요
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
CAMP_TEST_PGPORT=55438 PSQL_BIN=/opt/homebrew/opt/postgresql@18/bin/psql npm run test:db
```

설치된 Chrome이 없으면 `npx playwright install chromium` 후 `PLAYWRIGHT_CHANNEL`을 생략합니다. 프로덕션 검사에는 빌드 시 실험실 플래그를 켜고, `ENABLE_LOCAL_DEMO=true npm start -- --port 3001` 후 `TEST_BASE_URL=http://localhost:3001`을 지정하세요. DB 검사는 폐기 가능한 localhost PostgreSQL에 임시 DB를 만들고 삭제합니다. Supabase auth/realtime 최소 stub을 사용하므로 실제 GoTrue/WebSocket 검증을 대신하지 않습니다.

## 공동 캠핑장에 연결되지 않을 때

`anonymous_provider_disabled`는 Supabase에서 익명 입장이 꺼진 상태입니다. Supabase Dashboard → Authentication → Sign In / Providers에서 **Allow anonymous sign-ins**를 켜고 저장한 뒤 앱의 **다시 연결**을 누르세요. 이 인증 설정은 DB 마이그레이션과 별개이며, 설정만 켤 때는 앱 재배포가 필요하지 않습니다.

v1.1.1은 익명 인증 오류 코드를 보존하고, 미연결 상태의 채팅 전송을 막으며 재연결 버튼을 제공합니다. 연결에 실패한 메시지는 전송된 것처럼 로컬에 추가하지 않고 초안을 유지합니다. [인증 수정 검증](docs/AUTH-FIX.md)을 참고하세요.
