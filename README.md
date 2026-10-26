# Ravenmoor Online

쿼터뷰(2.5D) 중세 웹 MMORPG. 성벽 안 마을은 안전 지대, 성문 밖은 몬스터와 PK가 있는 무법지대입니다.

- **서버가 모든 판정을 내립니다**: 이동 경로, 공격, 데미지, 사망, 보상은 서버가 계산하고 클라이언트는 "여기로 이동", "이 대상 공격", "대화" 같은 의도만 보냅니다. 클라이언트를 조작해도 데미지를 바꿀 수 없습니다.
- **실행에 필요한 외부 패키지가 없습니다**: Node.js 20 이상만 있으면 됩니다. WebSocket도 직접 구현했습니다.
- **그래픽은 3D 모델을 구운 스프라이트**입니다: CC0 3D 모델을 Three.js로 8방향 × 5동작(대기·걷기·공격·피격·사망)으로 렌더링해 `assets/sprites`에 넣어 두었습니다.

## 실행

```bash
npm start          # http://localhost:8080
npm test           # 봇 2명으로 핵심 규칙 자동 테스트
```

브라우저 탭 두 개로 접속하면 같은 맵에서 서로 보이고, 채팅과 PK를 할 수 있습니다.

## 조작

| 입력 | 동작 |
|---|---|
| 땅 클릭 | 이동 |
| 몬스터·플레이어 클릭 | 쫓아가서 공격 (마을 안에서는 불가) |
| `A` | 가장 가까운 몬스터 공격 |
| `Esc` | 멈춤 |
| `Enter` | 대화 |
| 미니맵 클릭 | 그곳으로 이동 |
| 마우스 휠 | 확대·축소 |

## 지금 들어간 규칙

- 마을(성벽 안·성문 위)에서는 누구도 공격할 수 없습니다. 몬스터는 성벽 안으로 들어오지 못합니다.
- 성 밖에서 선량한 플레이어를 공격하면 1분간 **보라색 이름(공격자)**, 죽이면 성향이 떨어져 **붉은 이름(카오틱)**이 됩니다. 카오틱이나 공격자를 처치하면 성향이 오릅니다.
- 죽으면 금화 10%(카오틱은 20%)와 경험치 일부를 잃고 5초 뒤 마을 광장에서 부활합니다.
- 몬스터 4종(해골 졸개 Lv2 · 도적 Lv5 · 전사 Lv9 · 마법사 Lv13)이 마을에서 멀어질수록 강해집니다.
- 외형 4종(기사·야만전사·도적·마법사). 마법사는 원거리 공격입니다.
- 레벨·경험치·금화·성향은 `data/players.json`에 이름별로 저장됩니다.

## 폴더 구조

```
server/   index.js(웹 서버·진입점)  ws.js(WebSocket)  game.js(게임 규칙·틱)
shared/   world.js  ← 서버와 클라이언트가 함께 쓰는 맵·상수·길찾기
client/   index.html  style.css  main.js(렌더링·입력·HUD)
assets/sprites/   구운 스프라이트 PNG + manifest.json
tools/bake/       3D 모델 → 스프라이트 굽기 도구
tools/test-multiplayer.mjs   자동 테스트
```

## 스프라이트 다시 굽기 / 새 모델 추가

```bash
npm run fetch-assets                      # CC0 원본 모델 + Three.js 받기
npm i -D playwright && npx playwright install chromium
npm run bake                              # 전부
npm run bake -- knight castle             # 일부만
```

`tools/bake/config.json`에 모델 파일, 크기, 동작 이름을 적으면 됩니다. glTF/GLB 형식을 지원합니다.

## 에셋 출처 (모두 CC0, 상업적 사용 가능)

- KayKit Adventurers / Skeletons / Medieval Hexagon Pack — Kay Lousberg (kaylousberg.com)
- Three.js (MIT) — 스프라이트 굽기에만 사용, 게임 실행에는 필요 없음

## 다음 단계

1. 계정·비밀번호 로그인, 실제 데이터베이스(PostgreSQL)
2. 직업 전직(10레벨), 상점·대장간·인벤토리·장비를 서버 규칙으로 이식
3. 사실적인 캐릭터 모델(Mixamo 등)로 교체, FBX 지원 추가
4. 서버 배포(Fly.io, Railway, 또는 VPS)와 HTTPS 도메인
