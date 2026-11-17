# 캠핑가자

지금, 숲에 앉아요. 인제 숲속 가상 캠프에서 혼자 쉬거나 친구 한 명과 만나는 반응형 웹입니다.

빈 저장소에서 Next.js App Router 16.4.6 + React 19.3.1 + TypeScript + React Three Fiber 9.8.2 / Three.js 0.187.0으로 구현했습니다. Vercel에서 화면과 API, Supabase에서 익명 인증·방 저장·실시간 구독을 제공합니다. 의존성은 `package-lock.json`에 고정했습니다.

**상태:** 구현과 로컬 검증을 완료했습니다. 실제 Supabase 프로젝트/기상청 키와 Vercel 배포는 이 작업 환경에 제공되지 않아 연결 및 공개 검수는 남아 있습니다. 로컬 두 세션 검증은 개발 전용 서버 어댑터로 수행했습니다. 완료 기준별 근거와 한계는 [검증 보고서](docs/VERIFICATION.md), 교체 권장 미술·소리는 [자산 목록](docs/ASSETS.md)을 확인하세요.

## 로컬 실행

Node.js 22.9+ 권장(검증: 24.14.1), npm을 사용합니다.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`http://localhost:3000`을 엽니다. 키가 없어도 혼자 걷기·체험·음향·엽서를 사용할 수 있고, 날씨는 갱신 중으로 표시합니다. 실시간 친구 캠프는 아래 Supabase 설정 후 사용하세요.

외부 서비스 없이 로컬의 독립 두 세션을 검증하려면 `.env.local`에서 `ENABLE_LOCAL_DEMO=true`로 설정하고 서버를 다시 시작합니다. 일반 창과 시크릿 창에서 같은 서버의 초대 링크를 여세요. UI에 **로컬 체험**이 표시됩니다. 이 어댑터는 한 Node 프로세스의 메모리를 사용하며 서버 재시작 시 방이 사라집니다. Vercel에서는 환경 변수가 켜져 있어도 작동하지 않습니다.

## 환경 변수

| 변수 | 위치 | 용도 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저/서버 | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저 | 공개 publishable key. 기존 `NEXT_PUBLIC_SUPABASE_ANON_KEY`도 지원 |
| `SUPABASE_SECRET_KEY` | 서버 전용 | Supabase secret key. 기존 `SUPABASE_SERVICE_ROLE_KEY`도 지원 |
| `KMA_SERVICE_KEY` | 서버 전용 | 공공데이터포털 기상청 단기예보 조회서비스 **Decoding** 인증키 |
| `ENABLE_LOCAL_DEMO` | 로컬 서버 | 기본 false. 로컬 두 세션 검증용. Vercel에서는 금지 |
| `NEXT_PUBLIC_ENABLE_SCENE_LAB` | 빌드/서버 | 기본 false. 사설 프리뷰에서 날씨·시간 샘플 검사 시 true. 개발 서버는 자동 활성화 |

`NEXT_PUBLIC_*` 값은 빌드 때 포함되므로 변경 후 재배포해야 합니다. secret/service role key와 기상청 키에 `NEXT_PUBLIC_` 접두사를 붙이지 마세요. `.env.local`은 Git에서 제외됩니다.

## Supabase 설정과 마이그레이션

1. Supabase 프로젝트를 만들고 Connect 화면의 URL·publishable key·secret key를 환경 변수에 설정합니다.
2. **Authentication → Sign In / Providers → Anonymous Sign-Ins**를 켭니다. 친구 초대/입장 시에만 `signInAnonymously()`를 호출하며 혼자 방문할 때는 인증 요청을 하지 않습니다. 브라우저의 게스트 세션을 지우면 원래 좌석으로 복귀할 수 없습니다.
3. SQL Editor에서 [마이그레이션](supabase/migrations/202611170001_camp.sql)을 한 번 실행하거나 Supabase CLI로 적용합니다.

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

4. **Realtime → Settings → Allow public access**를 끄고 Realtime이 켜져 있는지 확인합니다. 마이그레이션은 `camp_rooms`, `camp_weather`를 `supabase_realtime` publication에 추가합니다. 이동은 `camp:<room UUID>:<channel epoch>` 비공개 Broadcast 채널입니다. 방 변경과 날씨는 같은 인증 채널의 Postgres Changes로 받습니다. 방의 살아 있는 참가자만 SELECT·Broadcast가 가능하고 클라이언트의 DB 쓰기는 허용하지 않습니다.
5. Authentication URL Configuration의 Site URL을 최종 HTTPS 주소로 설정합니다. 익명 인증에는 이메일 리디렉션이 필요하지 않습니다. 프리뷰 주소도 필요한 경우 추가합니다.
6. 선택적으로 `pg_cron`을 켜고 마이그레이션 마지막의 정리 작업을 등록합니다. 기본적으로 새 방을 만들 때 30분 이상 활동 없는 방을 정리하며, API는 정리 작업 실행 여부와 관계없이 30분 만료를 검사합니다. 익명 사용자 보존/삭제는 Supabase 관리 정책에 맞춰 운영하세요.

### 방 규칙과 데이터 흐름

- 정원 2명, `(room_id, seat)` UNIQUE 및 좌석 0/1 CHECK를 DB에 적용합니다. 방 행 잠금 아래 좌석 배정과 초대 소비를 원자적으로 수행합니다.
- 서버가 32바이트 무작위 초대 토큰을 만들고 DB에는 SHA-256 해시와 30분 만료만 저장합니다. 원문은 발급 응답과 URL **fragment**에만 포함되고 입장 POST 본문으로 전달됩니다. 새 초대를 만들면 이전 미사용 초대를 교체합니다.
- 30초 heartbeat, 마지막 heartbeat부터 90초 좌석 보유. 복귀 시 heartbeat로 좌석을 확인하고 최신 방·불 상태를 읽습니다. 만료된 세션은 새 초대가 필요합니다. 명시적 퇴장은 즉시 좌석을 비웁니다. 연결 중 혼자 계속하기는 로컬 연결을 정리하고 서버 좌석은 최대 90초 뒤 만료됩니다.
- 지속 상태는 세션 검증 후 서버 API → 서비스 전용 `camp_command` RPC로만 씁니다. 방 버전이 오래된 응답은 무시합니다. 모닥불/인사/체험 요청 ID를 저장하며 네트워크 재시도는 같은 ID를 사용합니다.
- 이동·회전·앉기는 이동 중 약 10Hz로 Broadcast, 상대는 프레임 사이를 보간합니다. 순서 번호·좌표·구역·자세·참가자 ID를 검사합니다. 복귀/입장 때 hello로 현재 자세를 교환하고, 내 마지막 자세는 같은 브라우저에 보관합니다.
- 참가자 변경/좌석 만료마다 채널 epoch를 바꿔 이전 연결에 새 이동이 전달되지 않게 합니다. 새로운 epoch의 참가자만 새 채널 권한을 받습니다. 늦게 들어온 사람에게 지난 손 인사를 재생하지 않습니다.
- 4초 방 재조회가 실시간 이벤트 누락을 보완합니다. 로컬 검증 어댑터만 이동 전송과 450ms 조회를 HTTP로 대체합니다. 실제 Supabase WebSocket 전달과 지연 검수는 별도로 필요합니다.
- 방 생성 6회/분, 읽기 300회/분, 기타 동작 90회/분의 사용자별 DB 호출 제한을 둡니다. 로컬 이동은 900회/분입니다.

### API

| API | 동작 |
| --- | --- |
| `GET /api/time` | `{epochMs}` / `Cache-Control: no-store` |
| `GET /api/weather` | 정규화된 인제 날씨, 출처·기준 시각·버전·stale |
| `POST /api/rooms` | 현재 혼자 캠프의 불 상태를 이어받아 방 생성 |
| `GET /api/rooms/:id` | 참여자만 최신 snapshot 조회 |
| `POST /api/rooms/:id` | `action`: invite / join / heartbeat / leave / fire / wave / marshmallow / skip |
| 동일 API의 `weather` | 실험실 활성화 시 방 전체의 샘플 날씨 변경 |
| `POST /api/session` | 외부 서비스 없는 로컬 검증에서만 게스트 토큰 발급 |

방 요청은 `Authorization: Bearer <guest access token>`을 사용합니다. 원문 초대와 서비스 키는 로그에 쓰지 않습니다.

## 기상청·시간

[기상청 단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do)를 신청하고 Decoding key를 `KMA_SERVICE_KEY`에 넣습니다. `getUltraSrtNcst`의 PTY/RN1/T1H와 `getUltraSrtFcst`의 SKY를 사용합니다. 기상청 격자는 경위도에서 Lambert conformal conic 공식으로 계산합니다.

기준점은 [공식 고캠핑 방태산 #1245](https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=1245)의 지도 좌표 **37.9242191 N, 128.3970647 E**입니다(2026-11-17 원문 확인). `lib/environment.ts`에 고정했으며 가상 지형은 창작입니다. 화면은 **인제 캠프 인근 날씨**와 관측 시각을 장소 정보에 표시합니다.

초단기실황은 정시 발표, 15분 여유 후 최신 발표를 요청하고 지연/실패 시 직전 발표로 재시도합니다. 구름 예보 실패는 마지막 SKY 또는 중립값을 사용합니다. 10분 공유 캐시와 30초 DB 갱신 lease로 캠프당 갱신을 한 번만 수행합니다. 여러 Vercel 인스턴스도 DB 최신 버전을 확인합니다. 관측값은 최대 2시간 보유하며 이후 또는 키가 없으면 중립 흐림으로 돌아갑니다. 클라이언트도 관측 나이를 검사하므로 API 연결이 계속 실패해도 오래된 강수를 유지하지 않습니다.

시간은 `/api/time`의 왕복 시간을 보정하고 `performance.now()`로 흐르게 합니다. 실패 시 기기 epoch를 사용하고 탭 복귀·5분마다 동기화합니다. 표기에는 `Intl`의 `Asia/Seoul`만 사용하고 표기 문자열을 다시 파싱하지 않습니다. SunCalc 1.9.0의 라디안·남쪽 기준 방위각을 북쪽=-Z, 동쪽=+X로 변환해 실제 태양 고도에 따라 조명/하늘을 섞습니다. 여름·겨울의 같은 18시가 다릅니다. KASI 공식 서울의 2026-06-21, 12-21 일출몰을 2분 허용 오차로 대조한 테스트가 있습니다. 산 능선에 가리는 실제 현장의 일출몰과는 다를 수 있습니다.

개발 화면의 **LAB**에서 맑음·비·진눈깨비·눈·2시간 경과·API 실패를 선택합니다. 친구 방에서는 같은 샘플 버전이 두 화면에 적용됩니다. 새벽/낮/해질녘/밤/자정/계절도 시험할 수 있습니다. 공개 배포의 실험실 플래그는 false로 두세요.

## 조작과 체험

PC: WASD/방향키 이동, 드래그 또는 J/L 시점, R 앉기/일어나기, E 체험, F 불/장작, H 손 인사, M 소리. 모바일: 일어나기 → 왼쪽 조이스틱, 오른쪽 풍경 드래그. 지도에서 구역으로 바로 이동할 수도 있습니다. 설정 시트는 Tab/Shift+Tab으로 순환하고 Esc로 닫습니다.

불을 피운 화로에서 마시멜로의 앞뒤를 돌려 굽고, 계곡에서 돌을 누르다 놓아 물수제비를 합니다. 데크/텐트 아래에서 엽서를 촬영해 JPG·PNG·WebP 사진(15MB 이하)을 붙이거나 생략하고 PNG로 내려받습니다. 사진 읽기·Canvas 합성·내보내기는 브라우저 안에서만 수행하며 업로드 API가 없습니다. 기기가 파일 공유를 지원하면 기기 공유 메뉴를 사용합니다.

첫 방문·새로고침은 무음입니다. **소리 켜기**를 직접 눌러야 Web Audio가 시작합니다. 환경음/효과음/전체 음량과 움직임/그래픽 설정은 내 브라우저에만 저장합니다. ASMR에서는 조작 UI를 줄이고 음소거·볼륨·닫기를 남깁니다. 텐트 아래의 빗소리는 실외와 필터/음량이 다르고, 포근하고 건조한 밤에만 풀벌레를 섞습니다. 현재는 직접 합성한 음향이며 현장 녹음 교체 권장은 자산 목록에 명시했습니다.

WebGL2 실패·context loss·로딩 지연 또는 설정의 스틸 모드 선택 시 4구역×4시간대 스틸과 이동 버튼을 제공합니다. 동일 방·불·친구 위치·날씨·체험·엽서를 유지합니다. `/?view=still`로도 시험할 수 있습니다.

## Vercel 배포

1. 이 저장소를 Vercel에서 Import하고 Framework Preset **Next.js**, Root Directory `.`, Install `npm ci`, Build `npm run build`, Output 기본값을 사용합니다. Node 24.x 또는 지원되는 22.x를 선택합니다. 별도 WebSocket 서버는 배포하지 않습니다.
2. Production/Preview 환경에 Supabase URL·publishable key·secret key·KMA key를 설정합니다. Preview는 별도 Supabase 프로젝트를 쓰면 검수가 운영 방에 영향을 주지 않습니다.
3. 먼저 Supabase 마이그레이션과 익명 인증/비공개 Realtime 설정을 완료하고 배포합니다. 기능 검수용 Preview에서만 실험실을 켜고, 공개 빌드는 `NEXT_PUBLIC_ENABLE_SCENE_LAB=false`, `ENABLE_LOCAL_DEMO=false`로 배포합니다.
4. 같은 HTTPS Preview URL을 PC와 실제 휴대폰에서 열고 초대 링크를 전달합니다. 방 정원·실제 Broadcast·재접속·같은 관측 버전·iOS 첫 음향 재생·회전·PNG 저장/공유를 [검증 보고서](docs/VERIFICATION.md)의 미확인 항목에 따라 검사합니다.

CLI를 이미 연결한 환경에서는 `vercel`로 Preview를, 공개 승인이 된 프로젝트에서는 `vercel --prod`로 배포할 수 있습니다. 이번 작업에서는 배포 계정/환경 변수를 변경하거나 저장소를 원격으로 push하지 않았습니다.

## 검증 명령

```sh
npm run typecheck
npm test
npm run build
```

브라우저 검사에는 개발 서버 또는 실험실이 켜진 로컬 프로덕션 서버와 `ENABLE_LOCAL_DEMO=true`가 필요합니다.

```sh
npx playwright install chromium
npm run test:e2e
# 설치된 Chrome 사용 시
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
# 다른 포트의 로컬 프로덕션 서버
TEST_BASE_URL=http://localhost:3001 PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

SQL 검사는 폐기 가능한 로컬 PostgreSQL 18 인스턴스(기본 127.0.0.1:55438)에 테스트 DB를 만들고 마이그레이션을 실제로 적용합니다. 원격 host는 거부하며 테스트 후 해당 테스트 DB만 삭제합니다. Supabase의 `auth`/`realtime` 역할과 함수는 최소 stub으로 만들어 SQL/RLS를 검사합니다. 실제 GoTrue/WebSocket 서비스의 대체 검증은 아닙니다.

```sh
CAMP_TEST_PGPORT=55438 PSQL_BIN=/path/to/psql npm run test:db
# 프로덕션 서버, 10 Mbps / 80ms / cold-cache 성능 샘플
TEST_BASE_URL=http://localhost:3001 PLAYWRIGHT_CHANNEL=chrome node scripts/measure-performance.mjs
```

구조: `components/` 장면·UI·체험, `lib/` 시간·환경·입력·음향·클라이언트, `lib/server/` 인증·방·날씨, `app/api/` Vercel Route Handlers, `supabase/migrations/` 트랜잭션과 RLS, `tests/` 도메인·DB·브라우저 검사, `docs/` 검증 증거·자산 목록입니다.
