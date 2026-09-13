---
name: difit-loop
description: PR 올리기 전 difit 왕복 리뷰 루프 — 셀프리뷰 스레드를 difit에 주입해 띄우고, 사용자 코멘트를 수집해 반영 커밋을 쌓고, 커밋으로 끊긴 스레드를 새 diff로 이월하며 OK가 나올 때까지 반복한다. "difit-loop", "리뷰 루프", "PR 전 리뷰", "review loop", "pre-pr review" 키워드, 그리고 PR을 만들기 전 사람 리뷰가 필요해진 시점에 트리거. upstream difit·difit-review 스킬(단발 실행)의 위에 얹는 층이다.
---

# difit-loop — PR 전 difit 왕복 리뷰 루프

difit(로컬 diff 뷰어)을 **반복 왕복 리뷰**에 쓴다. upstream `difit`·`difit-review` 스킬은 "한 번 띄워
코멘트를 주고받는" 단발 동작을 다루고, 이 스킬은 그 위의 루프 — 셀프리뷰 주입 → 사용자 코멘트 →
반영 커밋 → 스레드 이월 → 반복 — 를 소유한다. difit의 소스 코드는 건드리지 않는다(포크 없음) — 루프 동안
고치는 것은 리뷰 대상 코드다.

이 문서의 플래그·API는 difit v5.0.8~5.0.12에서 실측한 것이다. difit 사용법이 갱신되면 upstream
SKILL.md를 먼저 읽고 이 절차를 맞춘다.

## 전체 흐름

```
[0 사전 점검] → [1 셀프리뷰 스레드 준비] → [2 difit 기동 + 검증] → [3 사용자 코멘트 대기]
→ [4 커밋 전 수집] → [5 판단·반영·커밋] → [6 스레드 이월] ⟲ (OK까지) → [7 종료]
```

## 0단계 — 사전 점검

1. `git branch --show-current` — main/master면 중단하고 브랜치 생성을 안내한다.
2. `git status` — 미커밋 변경이 있으면 커밋을 먼저 제안한다 (커밋 후 리뷰 원칙).
3. base 브랜치: 인자로 받았으면 사용, 없으면 사용자에게 묻는다.
4. **base는 항상 `origin/<base>`로 정규화한다** — difit·`git diff`·`git log` 전부. 워크트리 세션은
   공유 `.git`의 로컬 ref가 낡아 있을 수 있어, 브랜치명을 그대로 주면 남의 커밋이 diff에 섞인다.
   `git fetch origin <base>` 후 `git log HEAD..origin/<base> --oneline`으로 원격 전진 여부를 확인하고,
   전진해 있으면 리뷰 시작 전에 사용자에게 알린다.
5. 포트: **설정 없이 레포 이름에서 계산한다** — `bash <이 스킬 경로>/scripts/difit-port.sh`
   (origin 레포명의 cksum → 5100~5890, 10의 배수). 같은 레포는 어느 머신·워크트리에서든 같은 포트라
   "지금 보는 창이 어느 레포인지"가 포트로 갈린다. 사용자 지침(CLAUDE.md 등)에 레포별 포트표가 있으면
   그것이 우선이다. **대상이 하나여도 `--port`를 명시한다** — 생략하면 difit 기본값 4966부터 비는 포트를
   잡는데, 다른 세션이 쥐고 있으면 조용히 4967로 밀려 사용자가 옛 탭을 본다. 10의 배수만 쓰는 이유는
   difit 폴백이 +1이라 이웃 번호가 다른 레포에 배정되면 폴백이 그리로 떨어지기 때문이고, 5100번대는
   3000·4200·5000(macOS AirPlay)·5173(Vite)·6006·8080처럼 개발 도구가 선점하는 번호와 겹치지 않는다.

## 1단계 — 셀프리뷰 스레드 준비

1. `git diff origin/<base>...HEAD`와 `git log origin/<base>..HEAD --oneline`으로 변경을 검토한다.
   자잘한 문제(오타·디버그 출력·명백한 버그)는 바로 수정 후 커밋한다.
2. 판단이 갈리는 문제는 수정하지 말고 **"논의 필요" 스레드**로 모은다. 채팅에만 쓰지 않는다 —
   사용자가 diff를 보는 자리에 지적이 붙어 있어야 화면과 채팅을 번갈아 보지 않는다.
3. 스레드 본문은 **신호등 세 단계**로 시작한다 — 리뷰어가 빨강부터 훑을 수 있게:
   - `🔴` 반드시 고쳐야 한다 — 버그·보안·데이터 손실처럼 머지되면 안 되는 것
   - `🟡` 논의·제안 — 판단이 갈리는 것, 더 나은 대안이 있어 보이는 것
   - `🟢` 설명 — 조치 불필요. 왜 이렇게 했는지, 무엇을 먼저 보면 되는지
   자명한 변경·기계적 치환에는 달지 않는다 — 스레드가 많다고 좋은 리뷰가 아니다.
4. 앵커(파일·줄)는 눈으로 세지 않고 헬퍼로 구한다. 파일별 `{path, line, sample}` JSONL을 낸다:
   ```bash
   node <이 스킬 경로>/scripts/first-added-line.mjs origin/<base>...HEAD
   ```
5. 페이로드를 파일로 저장한다(예: `comments.json`). 형식은 「코멘트 주입 규약」.

## 2단계 — difit 기동 + 검증

```bash
npx difit HEAD origin/<base> --merge-base --background --keep-alive --port <포트> \
  --comment "$(cat comments.json)"
# → {"port":5100,"url":"http://localhost:5100","pid":12345}
```

`command -v difit`이 있으면 `npx difit` 대신 `difit`. 각 플래그의 이유:

| 인자 | 이유 |
| --- | --- |
| 타깃 `HEAD` (브랜치명 아님) | difit은 "특정 커밋 비교"로 판정하면 파일 감시를 끈다. `HEAD`면 감시가 켜져 새 커밋이 서버 재시작 없이 반영된다. 시작 배너에 `🔍 File watching disabled`가 뜨면 잘못 준 것 |
| `--merge-base` | base를 merge-base 커밋에 고정한다. 원격 base가 전진했을 때 남의 머지분이 diff에 섞이는 것을 막는다 |
| `--background` | 서버를 띄운 채 JSON 한 줄만 뱉는다. `pid`로 정확히 죽인다. 브라우저를 자동으로 열지 않는다 |
| `--keep-alive` | 브라우저가 끊겨도 서버를 살린다. 없으면 창을 닫는 순간 서버와 **메모리의 코멘트 스레드가 함께 사라진다** |
| `--port` | 위 0단계 5번 |

기동 직후 **서버가 보는 것과 git이 보는 것을 대조하고, 맞을 때만 사용자에게 URL을 준다**:

```bash
curl -s localhost:<port>/api/diff | jq '{base:.baseCommitish, target:.targetCommitish, mode:.requestedBaseMode, files:(.files|length)}'
git merge-base --short origin/<base> HEAD 2>/dev/null || git rev-parse --short "$(git merge-base origin/<base> HEAD)"
git diff origin/<base>...HEAD --stat | tail -1
```

`base`는 **merge-base 커밋**이어야 한다(`--merge-base`를 줬으므로 `origin/<base>` 끝 커밋과 다를 수 있다 —
원격이 전진했을수록 다르다). `mode`는 `merge-base`, `files`는 `--stat` 마지막 줄의 파일 수와 같아야 한다.

- 출력 JSON의 `port`가 요청값과 다르면(점유돼 +1로 폴백) **그 값을 쓰고 사용자에게 알린다.**
  이후 `comment get/add`의 `--port`도 전부 실제 값이다.
- 같은 대상의 서버가 이미 떠 있으면 새로 띄우지 않는다 — 스레드는 `comment add`로 얹는다.
- 실행 자체가 실패하면 폴백: 사용자에게 difit UI의 "Copy All Prompts" 붙여넣기를 안내한다.

## 3단계 — 사용자 코멘트 대기

사용자에게 URL과 함께 안내한다: "브라우저에서 코멘트를 달고, 끝나면 알려주세요."
브라우저는 사용자가 열어도 되고 에이전트가 열어도 된다 — `--keep-alive` 덕에 탭을 닫아도 서버는 산다.

## 4단계 — 커밋 전 수집 (반드시 커밋 전)

```bash
npx difit comment get --port <port> --format json > old.json
```

**difit의 코멘트 세션 키는 해석된 base+target 커밋 쌍이다.** 커밋을 하나 쌓으면 target이 바뀌어
빈 세션이 된다 — 서버를 재시작하지 않아도 그렇다. 그래서 수집은 반드시 커밋 전에 끝내고 파일로
남긴다. 이 파일은 지우지 않는다(서버가 죽어도 재주입할 수 있는 마지막 사본).

`comment get`이 0건인데 사용자가 "달았다"고 하면 서버를 의심하지 말고 **탭의 localStorage**를 본다 —
탭이 옛 diff를 보여주는 동안 단 코멘트는 옛 키(`difit-storage-v1/<repo-hash>/<base7>-<target7>-<mode>`)에만
있다. 리뷰 종료 판정("코멘트 0건")은 서버와 탭을 둘 다 비운 뒤에만 내린다.

## 5단계 — 판단 · 반영 · 커밋

각 코멘트를 아래 원칙으로 처리하고 결과를 요약한다: 반영 ✅ / 역제안 💬 / 질문 ❓.

- **제3자 시각 우선** — 시켰으니 반영하는 게 아니라 코드베이스 관점에서 합당한지 먼저 판단한다.
- **동의하면** 반영 + 커밋. 왜 합당한지 한 줄.
- **이견이 있으면** 반영하지 않은 채 근거를 들어 역제안. 재차 요구하면 반영하되 명백한 버그면 다시 경고.
- **정보가 부족하면** 추측으로 구현하지 말고 역질문.
- 처리한 thread ID를 세션 내에서 추적해 새 코멘트만 처리한다. `comment resolve`는 **스레드를 지우는**
  명령이라 기본적으로 쓰지 않는다.

반영분은 새 커밋으로 쌓는다. 서버는 그대로 둔다 — 파일 감시가 새 커밋을 화면에 반영한다.

## 6단계 — 스레드 이월

커밋 뒤 답변을 붙일 때는 `reply`가 아니라 **새 `thread`로, 바뀐 줄 번호에** 올린다.
`type: "reply"`는 매칭 스레드가 없으면 에러가 아니라 **경고로 조용히 스킵**되고 `success: true`가 온다.

1. **`GET /api/diff`의 `target`이 새 SHA로 바뀐 것을 먼저 확인한다.** 커밋 직후에는 서버가 잠깐 옛
   target을 쥐고 있어 `add`가 옛 세션에 붙어 "살아 있는 것처럼" 보이다가 몇 초 뒤 0건이 된다.
2. 미해결 스레드를 새 diff의 유효한 앵커로 옮긴다 — 옛 줄이 아직 `+` 줄이면 유지, 아니면 그 뒤 첫
   `+` 줄로(stderr `moved:`), 답글은 `> ` 인용으로 잇는다:
   ```bash
   node <이 스킬 경로>/scripts/carry-comments.mjs old.json origin/<base>...HEAD > new.json
   npx difit comment add --port <port> "$(cat new.json)"
   ```
3. 올린 뒤 `comment get`으로 `filePath:line`이 의도한 자리인지 확인하고, 사용자에게 "탭을 새로고침해
   주세요"로 안내한다.
4. 추가 코멘트가 있으면 3~6단계를 반복한다. 사용자가 승인("OK")하면 7단계로.

옛 세션은 사라지지 않고 옛 키에 남는다. 되찾으려면 `/api/diff`가 보고한 **7자 축약형** 그대로
`GET /api/comments-json?base=<base7>&target=<옛 target7>&baseMode=merge-base`로 조회한다 — `baseMode`를
빼거나 8자로 주면 키가 어긋나 0건이다(v5.0.12 실측). 키 끝의 모드는 `--merge-base` 유무로 갈리므로
**루프 내내 한 모드를 유지한다.**

## 7단계 — 종료

요약(총 코멘트 수, 반영/역제안/보류, 최종 커밋 목록)을 제시하고 `kill <pid>`로 서버를 끝낸다.
이후 PR 생성은 이 스킬의 범위 밖이다 — 프로젝트의 PR 생성 절차(`gh pr create --draft` 등)로 넘긴다.

## 코멘트 주입 규약

`--comment`와 `comment add`가 같은 페이로드를 받는다.

```json
[{ "type": "thread", "author": "claude",
   "filePath": "src/lib/auth/route-fetch.ts",
   "position": { "side": "new", "line": 50 },
   "body": "🟡 논의 — …" }]
```

- `filePath`는 **저장소 기준 상대경로** (`GET /api/diff`의 `files[].path`와 같은 형식). 어긋나면 400이
  아니라 매칭 실패로 **조용히 엉뚱한 자리에** 붙는다.
- `position.side`는 `old`|`new` 필수 — 삭제된 줄을 가리킬 때만 `old`. `position.line`은 양의 정수 또는
  `{start, end}`.
- **`position.line`은 반드시 `+`로 추가된 줄이어야 한다.** ① `1`은 수정 파일의 diff에 없어 스레드가
  화면에 안 뜬다 ② hunk 헤더(`@@ -18,6 +18,38 @@`)의 new 측 시작 줄은 컨텍스트 줄이라 difit이 안 바뀐
  코드를 수십 줄 펼친다. → `first-added-line.mjs`.
- **파일 상단에 총평을 달지 않는다.** 첫 줄에 붙은 코멘트는 "그 줄에 대한 지적"으로 읽힌다.
- 코멘트 본문은 사용자의 언어로 쓴다. `body`가 공백이면 400. 필드 이름이 틀리면
  `Invalid comment import field: <이름>`.
- **토큰·비밀번호·API 키 등 자격증명은 body에 옮겨 적지 않는다** — 명령줄 인자로도 남는다.
- CLI를 못 쓰면 `POST /api/comment-imports`가 같은 일을 한다. `POST /api/comments`와 혼동하지 말 것 —
  그쪽은 스레드 목록을 통째로 교체한다. 같은 코멘트를 다시 보내면 difit이 건너뛴다(멱등).

## 스택 PR 모드 — 브랜치 여러 개를 한 워크트리에서 동시에

`HEAD`를 쓸 수 있는 것은 맨 위 브랜치뿐이라 나머지는 "특정 커밋 비교"가 된다. 서버는 기동 시점에
해석한 커밋을 붙들고 감시가 꺼져 있어 리베이스·force-push 뒤에도 옛 diff를 보여준다.

```bash
git rev-parse --short origin/main <브랜치1> <브랜치2> <브랜치3>
P=$(bash <이 스킬 경로>/scripts/difit-port.sh)                                    # 레포 포트, 스택은 +0 +1 +2
npx difit <sha1> <mainSha> --background --keep-alive --port $P       --no-open   # ① base main
npx difit <sha2> <sha1>    --background --keep-alive --port $((P+1)) --no-open   # ② base ①
npx difit <sha3> <sha2>    --background --keep-alive --port $((P+2)) --no-open   # ③ base ②
for p in $P $((P+1)) $((P+2)); do curl -s localhost:$p/api/diff | jq -c '{p:'$p', base:.baseCommitish, target:.targetCommitish, files:(.files|length)}'; done
```

- 타깃·base 모두 SHA로 준다 — 창 자체가 무엇을 보는지 말하게.
- 어느 브랜치든 새 커밋·force-push가 생기면 그 서버와 위 서버를 죽였다 다시 띄운다. 코멘트는 죽이기
  전에 수집한다.
- 탭 제목이 전부 `difit - Git Diff Viewer`로 같으므로 안내는 포트 번호로.

## 창이 이상할 때

깜빡임·리로드·포커스 보고가 오면 추측 전에 `scripts/difit-health-check.sh <port…>` — 프로세스와
포트별 `/api/diff`(서버가 붙든 base·target·파일 수)를 한 번에 본다. difit은 특정 커밋 비교에서
자체 리로드가 없으므로 반복 리로드는 difit 밖(다른 도구의 reload, 창 재기동)에서 찾는다.

## 인자

$ARGUMENTS가 있으면 base 브랜치 지정으로 해석한다: $ARGUMENTS
