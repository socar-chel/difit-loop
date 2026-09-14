# pair-review 공통 — difit 띄우기 · 검증 · 코멘트 규약 · 수집

`pair-review`(내 브랜치)와 `pair-review-pr`(남의 PR)이 똑같이 하는 부분이다. 각 SKILL.md는 다른
부분만 적고 여기를 가리킨다. 플래그·API는 difit v5.0.8~5.0.12에서 실측한 것이다 — difit 사용법이
갱신되면 upstream `difit` 스킬의 SKILL.md를 먼저 읽고 여기를 맞춘다.

`<scripts>`는 `~/.claude/skills/pair-review/scripts`다(둘 다 이 하나를 쓴다).

## 명령

`command -v difit`이 있으면 `difit`, 없으면 `npx difit`. ⚠️ difit 자체 리포를 체크아웃한 디렉터리에서
`npx difit`을 치면 로컬 패키지(미빌드)가 잡혀 exit 127이 난다 — `comment get/add`까지 전부 그렇다. 그 리포를
볼 때는 전역 설치 바이너리나 npx 캐시의 바이너리(`ls ~/.npm/_npx/*/node_modules/.bin/difit`)를 절대경로로 쓴다.

## 포트

**레포 이름에서 계산한다** — `bash <scripts>/difit-port.sh` (origin 레포명의 cksum → 5100~5890 사이
10의 배수). 같은 레포는 어느 머신·워크트리에서든 같은 포트라 "지금 보는 창이 어느 레포인지"가 포트로 갈린다.

**외우기 쉬운 번호를 주고 싶은 레포는 배정 파일에 적는다** — `~/.config/pair-review/ports`(또는
`$XDG_CONFIG_HOME/pair-review/ports`)에 `<origin 레포명>=<포트>` 한 줄씩. 스크립트가 해시보다 먼저 읽으므로
에이전트가 기억할 필요가 없다. 배정 포트도 10의 배수로 둔다(아래 폴백·이웃 규칙 때문). `#` 주석·빈 줄 허용,
같은 이름이 여러 줄이면 마지막 줄이 이긴다. 경로는 `DIFIT_PORTS_FILE`로 바꿀 수 있다(테스트용).

- **대상이 하나여도 `--port`를 명시한다** — 생략하면 difit 기본값 4966부터 비는 포트를 잡는데, 다른 세션이
  쥐고 있으면 조용히 4967로 밀려 사용자가 옛 탭을 본다.
- 10의 배수만 쓰는 이유: difit 폴백이 +1이라 이웃 번호가 다른 레포에 배정되면 폴백이 그리로 떨어진다.
  범위를 5100에서 시작하는 이유: 3000·4200·5000(macOS AirPlay)·5173(Vite)·6006·8080처럼 개발 도구가
  선점하는 번호와 안 겹친다 — "51xx만 쓴다"는 뜻이 아니다. 5890까지 전부 후보다.
- 같은 레포에서 두 스킬이 동시에 뜰 수 있다 — `pair-review`는 +0(스택 PR은 +1·+2), `pair-review-pr`은 +5.

## 띄우기 + 검증

```bash
npx difit HEAD origin/<base> --merge-base --background --keep-alive --port <포트> \
  --comment "$(cat comments.json)"          # 시드 스레드가 있을 때만
# → {"port":5100,"url":"http://localhost:5100","pid":12345}
```

| 인자 | 이유 |
| --- | --- |
| 타깃 `HEAD` (브랜치명 아님) | difit은 "특정 커밋 비교"로 판정하면 파일 감시를 끈다. `HEAD`면 감시가 켜져 새 커밋이 서버 재시작 없이 반영된다. 시작 배너에 `🔍 File watching disabled`가 뜨면 잘못 준 것 |
| `origin/<base>` (로컬 브랜치명 아님) | 워크트리 세션은 공유 `.git`의 로컬 ref가 낡아 있을 수 있어, 브랜치명을 그대로 주면 남의 커밋이 diff에 섞인다. `git diff`·`git log`도 전부 `origin/<base>` |
| `--merge-base` | base를 merge-base 커밋에 고정한다. 원격 base가 전진했을 때 남의 머지분이 diff에 섞이는 것을 막는다 |
| `--background` | 서버를 띄운 채 JSON 한 줄만 뱉는다. `pid`로 정확히 죽인다. 브라우저를 자동으로 열지 않는다 |
| `--keep-alive` | 브라우저가 끊겨도 서버를 살린다. 없으면 창을 닫는 순간 서버와 **메모리의 코멘트 스레드가 함께 사라진다** |

기동 직후 **서버가 보는 것과 git이 보는 것을 대조하고, 맞을 때만 사용자에게 URL을 준다**:

```bash
curl -s localhost:<port>/api/diff | jq '{base:.baseCommitish, target:.targetCommitish, mode:.requestedBaseMode, files:(.files|length)}'
git rev-parse --short "$(git merge-base origin/<base> HEAD)"
git diff origin/<base>...HEAD --stat | tail -1
```

`base`는 **merge-base 커밋**이어야 한다(`--merge-base`를 줬으므로 `origin/<base>` 끝 커밋과 다를 수 있다 —
원격이 전진했을수록 다르다). `mode`는 `merge-base`, `files`는 `--stat` 마지막 줄의 파일 수와 같아야 한다.

- 출력 JSON의 `port`가 요청값과 다르면(점유돼 +1로 폴백) **그 값을 쓰고 사용자에게 알린다.** 이후
  `comment get/add`의 `--port`도 전부 실제 값이다.
- 같은 대상의 서버가 이미 떠 있으면(`<scripts>/difit-health-check.sh`로 본다) 새로 띄우지 않는다 — 스레드는
  `comment add`로 얹는다.
- 실행 자체가 실패하면 폴백: 사용자에게 difit UI의 "Copy All Prompts" 붙여넣기를 안내한다.
- 브라우저는 사용자가 열어도 되고 에이전트가 열어도 된다 — `--keep-alive` 덕에 탭을 닫아도 서버는 산다.

## 코멘트 규약

스레드 본문은 **신호등**으로 시작한다 — 리뷰어가 빨강부터 훑을 수 있게:

- `🔴` 반드시 고쳐야 한다 — 버그·보안·데이터 손실처럼 머지되면 안 되는 것
- `🟡` 논의·제안 — 판단이 갈리는 것, 더 나은 대안이 있어 보이는 것
- `🟢` 설명 — 조치 불필요. 왜 이렇게 했는지, 무엇을 먼저 보면 되는지

자명한 변경·기계적 치환에는 달지 않는다 — 스레드가 많다고 좋은 리뷰가 아니다.

`--comment`와 `comment add`가 같은 페이로드를 받는다:

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
  코드를 수십 줄 펼친다. 앵커는 눈으로 세지 않는다:
  ```bash
  node <scripts>/first-added-line.mjs origin/<base>...HEAD      # 파일별 {path, line, sample} JSONL
  ```
  헬퍼는 `git diff`를 직접 부르며 `core.quotePath`(한글 경로 인용)·`diff.noprefix`·색·외부 diff 도구를 끈
  채 읽는다 — 사용자 git 설정에 따라 파일이 조용히 빠지는 일을 막는다.
- **파일 상단에 총평을 달지 않는다.** 첫 줄에 붙은 코멘트는 "그 줄에 대한 지적"으로 읽힌다.
- 코멘트 본문은 사용자의 언어로 쓴다. `body`가 공백이면 400. 필드 이름이 틀리면
  `Invalid comment import field: <이름>`.
- **토큰·비밀번호·API 키 등 자격증명은 body에 옮겨 적지 않는다** — 명령줄 인자로도 남는다.
- `type: "reply"`는 매칭 스레드가 없으면 에러가 아니라 `success: true`에 `warnings: ["Skipped reply import
  for <path>:new:<line> …"]`로 온다 — `add` 응답의 `count`와 `warnings`를 반드시 본다.
- CLI를 못 쓰면 `POST /api/comment-imports`가 같은 일을 한다. `POST /api/comments`와 혼동하지 말 것 —
  그쪽은 스레드 목록을 통째로 교체한다. 같은 코멘트를 다시 보내면 difit이 건너뛴다(멱등).

## 수집과 처리 마커

```bash
npx difit comment get --port <port> --format json > threads.json
node <scripts>/pending-threads.mjs < threads.json      # {id, filePath, line, question, history} JSONL
```

**"마지막 메시지가 내 것이 아닌 스레드"가 곧 미처리분**이다 — 별도 상태 파일도, thread ID 추적도
필요 없다(ID는 이월하면 새로 발급돼 라운드를 못 넘긴다). `comment resolve`는 **스레드를 지우는** 명령이라
기본적으로 쓰지 않는다.

`comment get`이 0건인데 사용자가 "달았다"고 하면 서버가 아니라 **탭이 옛 diff를 보고 있던 것**을 의심한다 —
그동안 단 코멘트는 탭의 localStorage 옛 키(`difit-storage-v1/<repo-hash>/<base7>-<target7>-<mode>`)에만 있고
서버에는 안 온다. 에이전트가 agent-browser로 연 탭이면 `eval`로 그 키를 읽고, 사용자가 직접 연 탭이면 읽을
수 없으니 "탭을 새로고침한 뒤 코멘트가 남아 있는지 봐 달라"고 부탁하고 `comment get`을 다시 한다.
"코멘트 0건" 판정은 이 확인을 거친 뒤에만 내린다.

옛 세션은 사라지지 않고 옛 키에 남는다. 되찾으려면 `/api/diff`가 보고한 **7자 축약형** 그대로
`GET /api/comments-json?base=<base7>&target=<옛 target7>&baseMode=merge-base`로 조회한다 — `baseMode`를
빼거나 8자로 주면 키가 어긋나 0건이다(v5.0.12 실측). 키 끝의 모드는 `--merge-base` 유무로 갈리므로
**루프 내내 한 모드를 유지한다.**

## 창이 이상할 때

깜빡임·리로드·포커스 보고가 오면 추측 전에 `<scripts>/difit-health-check.sh <port…>` — 프로세스와
포트별 `/api/diff`(서버가 붙든 base·target·파일 수)를 한 번에 본다. difit은 특정 커밋 비교에서
자체 리로드가 없으므로 반복 리로드는 difit 밖(다른 도구의 reload, 창 재기동)에서 찾는다.

## 종료

`kill <pid>`. 죽이기 전에 `comment get`으로 마지막 사본을 남긴다.
