# v1.2.0 자산 기록

외부 자산은 프로젝트에 보관하며 실행 중 외부 미디어 서버에서 가져오지 않습니다. CC0는 상업 이용·수정·재배포가 가능합니다. 출처를 아래에 기록했습니다.

| 자산 | 제작자·원문 | 조건·프로젝트 적용 |
| --- | --- | --- |
| 귀여운 리깅 아바타 | Kenney, [Mini Characters](https://kenney.nl/assets/mini-characters) | CC0. `public/models/camper-cute.glb`, `Textures/colormap.png`. 공식 다운로드가 HTTP 403이어서 [공개 미러](https://github.com/shorepine/kenney/tree/main/3d/mini-characters)에서 원본을 확보. CC0 rig와 walk/idle/sit 클립 유지. 기존 표면 메시를 숨기고 프로젝트 코드로 얼굴·재킷·손·신발·8종 헤어 제작. 게스트 ID 조합, 접점 보정, 손잡기 IK, 메시 12개로 병합. |
| 풀벌레 | Wolfgang_ / Ted Kerr, [Crickets Ambient Noise – loopable](https://opengameart.org/content/crickets-ambient-noise-loopable) | CC0, `public/audio/crickets.mp3`. 실제 녹음. |
| 모닥불 | SKrafft, [Campfire Position 1](https://freesound.org/people/SKrafft/sounds/681366/) | CC0, `public/audio/fire.mp3`. Sony PCM-D100 현장 녹음의 공개 HQ 파일에서 60초 발췌·음량 정규화. |
| 계곡·바람 | Thimras, [Park Ambiences](https://opengameart.org/content/park-ambiences) | CC0, `river.mp3`, `wind.mp3`, 각 40초 발췌·압축. 호주 애들레이드 공원 녹음이며 인제 현장 녹음은 아님. |
| 비 | Ylmir, [Rain – loopable](https://opengameart.org/content/rain-loopable) | CC0, `rain.mp3`. 공개 MP3 팩에서 발췌·압축. |
| 숲 바닥 PBR | eye-candy.xyz / Poly Haven, [forest_floor](https://polyhaven.com/a/forest_floor), [라이선스](https://polyhaven.com/license) | CC0. diffuse / OpenGL normal / roughness 1K를 WebP로 변환. `public/textures/forest-floor-*.webp`. |
| 관측 별 41,411개·별자리 선 | Olaf Frohn, [d3-celestial](https://github.com/ofrohn/d3-celestial), Hipparcos/XHIP | BSD-3-Clause. `stars.8.json`을 좌표·등급·색지수만 남긴 `public/sky/catalog.json`으로 축약. [라이선스 원문](../public/licenses/d3-celestial.txt) 포함. 별 위치는 인제의 KST 시각에 맞춰 변환. 은하수 지도는 사용하지 않음. |
| 달 표면 | NASA / Goddard SVS, [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) | NASA 공개 자료, [이용 안내](https://svs.gsfc.nasa.gov/help/). `public/sky/moon.jpg`. 현재 위상을 적용하지만 달의 위치와 각크기는 관측 용이성을 위한 연출. |
| 지형·텐트·의자·해먹·바베큐·태양·실내·불꽃·꼬치·물수제비 | 프로젝트 코드 | 절차적 메시/셰이더/Canvas 텍스처. `world-scene.tsx`, `social-scene.tsx`, `night-sky.tsx`. 태양/노을은 프로젝트 셰이더이며 외부 HDRI가 아님. 불꽃은 프레임별 형태 변화와 불티. |
| 물수제비 splash | 프로젝트 코드 | 짧은 Web Audio 잡음 효과. 주변 ASMR 5종은 실제 녹음 파일 사용. |
| 구역별 스틸 24장 | 프로젝트 3D 장면 렌더 | `public/stills/*.webp`, `scripts/render-stills.mjs`로 재생성. 기존 4구역에 해먹·바베큐 추가. WebGL 대체/첫 페인트에 사용. |
| 글꼴·아이콘 | 시스템 글꼴, Lucide | 별도 웹폰트 다운로드 없음. Lucide ISC 라이선스는 npm 의존성에 포함. |

모든 루프는 브라우저에서 1.2초 equal-power 크로스페이드합니다. 최초 `소리 켜기` 이전에는 AudioContext를 재생하지 않습니다. 음량과 저널·사용자 사진은 개인 브라우저에만 남습니다.

보완 권장: 현재 텐트와 숲은 가벼운 실시간 절차적 모델입니다. 사진 수준의 상용 게임 그래픽에 해당하지 않습니다. 향후 미술 작업에서는 텐트 천의 주름, 지형·식생 LOD, 한국 계곡/풀벌레의 자체 현장 녹음을 우선 검수하세요. 새 자산을 추가할 때 원문과 사용 조건을 이 표에 남기세요.
