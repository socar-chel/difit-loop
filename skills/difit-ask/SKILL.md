---
name: difit-ask
description: 남이 올린 PR·브랜치를 difit으로 열어 놓고 코드 줄에 단 질문에 에이전트가 스레드로 답하는 읽기 루프 — 워크트리 체크아웃 → (파일이 많으면) 🟢 읽기 순서 투어 → 사용자 질문 → 주변 코드·호출부·테스트를 읽고 답글 → 반복. 코드는 고치지 않는다. "이 PR 같이 봐줘", "PR 설명해줘", "difit으로 읽자", "코드 질문", "difit-ask" 키워드, 그리고 남의 변경을 이해해야 하는 시점에 트리거. difit-loop(내 코드를 사람이 리뷰)와 방향이 반대다.
---

# difit-ask — 남의 PR을 difit에서 읽으며 묻는다

`difit-loop`가 "에이전트가 쓴 코드를 사람이 리뷰"라면, 이 스킬은 "**남이 쓴 코드를 사람이 읽고 에이전트에게
묻는다**". 라운드의 산출물은 커밋이 아니라 **스레드 답변**이고, 코드는 건드리지 않는다. 커밋이 없으니
코멘트 세션이 바뀌지 않아 `type: reply`가 그대로 이어진다 — 이월(carry)이 필요 없다.

헬퍼는 같은 리포의 `difit-loop/scripts/`를 쓴다(`npx skills add socar-chel/difit-loop` 한 번에 둘 다 설치된다):
`difit-port.sh` · `first-added-line.mjs` · `pending-threads.mjs` · `difit-health-check.sh`. 아래에서
`<scripts>`는 `~/.claude/skills/difit-loop/scripts`다.

## 전체 흐름

```
[0 가져오기: 워크트리] → [1 띄우기 + 검증] → [2 투어 시드 (조건부)] → [3 질문 루프] ⟲ → [4 PR 갱신 시] → [5 마무리]
```

## 0단계 — 가져오기

질문에 답하려면 diff만으로 부족하다 — 호출부·테스트·이전 커밋을 읽어야 하므로 **로컬 체크아웃이 필수**다.
지금 작업 중인 브랜치를 건드리지 않게 워크트리로 받는다.

```bash
# PR 번호·URL
git worktree add ../<repo>-pr<n> -b pr-<n>-review && cd ../<repo>-pr<n> && gh pr checkout <n>
# 브랜치명
git fetch origin <branch> && git worktree add ../<repo>-<branch> origin/<branch>
```

base는 PR의 base 브랜치(`gh pr view <n> --json baseRefName -q .baseRefName`)다. `origin/<base>`로 정규화한다.

## 1단계 — 띄우기 + 검증

```bash
P=$(( $(bash <scripts>/difit-port.sh) + 5 ))     # 같은 레포의 difit-loop 서버(+0~2)와 겹치지 않게 +5
npx difit HEAD origin/<base> --merge-base --background --keep-alive --port $P
# → {"port":5605,"url":"http://localhost:5605","pid":…}
```

기동 직후 `curl -s localhost:$P/api/diff | jq '{base:.baseCommitish, files:(.files|length)}'`의 `base`가
`git merge-base origin/<base> HEAD`와, 파일 수가 `git diff origin/<base>...HEAD --stat` 마지막 줄과 맞을 때만
사용자에게 URL을 준다. `port`가 요청과 다르면 그 값을 쓰고 알린다.

**대안 — `--pr <url>` 모드**: `npx difit --pr https://github.com/<o>/<r>/pull/<n> --background --keep-alive --port $P`.
체크아웃 없이 `gh pr diff`로 패치를 받고 **PR의 미해결 리뷰 스레드를 시작 코멘트로 임포트**한다 — 팀원 리뷰
맥락을 화면에 같이 놓고 싶을 때 고른다. 대신 (v5.0.12 실측) 세션이 `stdin` 키로 잡혀 "에디터에서 열기"가
꺼지고(`openInEditorAvailable: false`), `--context`를 못 쓴다. 에이전트가 답할 때 파일을 읽는 것은 어차피
로컬 체크아웃에서 하므로, 0단계는 이 모드에서도 생략하지 않는다. ⚠️ difit 자체 리포를 체크아웃한 디렉터리에서
`npx difit`을 치면 로컬 패키지(미빌드)가 잡혀 exit 127이 난다 — `comment get/add`까지 전부 그렇다. 그 리포를
읽을 때는 `command -v difit`(전역 설치)이나 npx 캐시의 바이너리(`ls ~/.npm/_npx/*/node_modules/.bin/difit`)를 절대경로로 쓴다.

## 2단계 — 투어 시드 (조건부)

변경 파일이 **5개 이상이면 제안**하고, 사용자가 원하면(또는 "설명해줘"로 시작했으면) 묻지 않고 만든다.
diff를 먼저 읽고 `🟢` 스레드 3~5개를 시작 코멘트로 얹는다 — 읽는 순서 번호, "이 파일이 나머지의 어휘",
호출 경로가 바뀌는 지점, 테스트가 덮는 범위. 앵커는 눈으로 세지 않는다:

```bash
node <scripts>/first-added-line.mjs origin/<base>...HEAD
npx difit comment add --port $P "$(cat tour.json)"      # 페이로드 형식은 difit-loop 「코멘트 주입 규약」
```

5개 미만이면 시드 없이 URL만 준다 — 작은 PR에 안내 스레드는 소음이다.

## 3단계 — 질문 루프

사용자에게: "코드 줄에 질문을 달고, 물어봤다고 알려주세요." 신호가 오면:

```bash
npx difit comment get --port $P --format json | node <scripts>/pending-threads.mjs
```

마지막 메시지가 에이전트 것이 아닌 스레드만 `{id, filePath, line, question, history}` JSONL로 나온다 —
같은 스레드가 라운드마다 다시 와도 **"내가 마지막으로 말했는가"가 처리 마커**라 별도 상태가 필요 없다.

질문마다 **코드를 읽고** 답한다 — diff 조각으로 추측하지 않는다:

- 그 파일 전체와 변경 전 버전(`git show origin/<base>:<path>`), 호출부(`grep -rn <symbol>`), 관련 테스트,
  이 줄을 만든 커밋(`git log -S'<snippet>' --oneline`, `git blame`)
- 답변은 `type: reply`로 같은 스레드에. 근거는 `path:line`으로 인용하고, 코드만으로 판단이 안 서는 것은
  **"코드에서는 알 수 없다 — 작성자에게: …"** 라고 적고 본문에 `→ 작성자` 표시를 남긴다(5단계가 모은다)
- 한 스레드에 질문이 둘이면 둘 다 번호를 붙여 답한다. 답변은 사용자의 언어로

```bash
npx difit comment add --port $P '[{"type":"reply","author":"claude","filePath":"<path>","position":{"side":"new","line":<line>},"body":"…"}]'
```

올린 뒤 `comment get`으로 답글이 붙었는지 확인하고 "새로고침해 주세요". 사용자가 "다 읽었다"고 할 때까지 반복.

## 4단계 — PR에 새 커밋이 올라왔을 때

워크트리에서 `git pull`(PR 브랜치)하면 파일 감시가 화면을 갱신하지만 **target이 바뀌어 코멘트 세션이 빈다**
(difit-loop 06-1과 같다). 이때만 이월이 필요하다:

```bash
npx difit comment get --port $P --format json > old.json     # pull 전에
git pull
node <scripts>/carry-comments.mjs old.json origin/<base>...HEAD > new.json && npx difit comment add --port $P "$(cat new.json)"
```

이월된 스레드는 author가 전부 `claude`가 되므로 `pending-threads.mjs`가 더는 잡지 않는다 — **pull 전에 답하지
않은 질문이 있으면 먼저 답하고** pull 한다.

`--pr` 모드는 세션 키가 `stdin`이라 안 비지만 패치를 다시 받으려면 서버를 재기동해야 한다(코멘트는 `comment get`으로
받아 뒀다가 `comment add`로 되돌린다).

## 5단계 — 마무리

1. `→ 작성자` 표시가 있는 스레드를 모아 **리뷰 코멘트 초안**을 마크다운 파일로 낸다 — 파일·줄·질문·에이전트 소견.
   여기까지가 이 스킬의 일이다. **게시는 하지 않는다** — 남의 PR에 글을 남기는 것은 되돌리기 어려운 외부 행위다.
   원하면 `gh pr review <n> --comment --body-file <초안>` 한 줄을 안내한다.
2. `kill <pid>`. 워크트리는 사용자에게 확인하고 `git worktree remove`.

## 답변 원칙

- **읽은 것만 말한다.** 열어 보지 않은 파일의 동작을 단정하지 않는다. 추측이면 추측이라고 쓴다.
- **"왜"에는 커밋·PR 본문을 먼저 본다** — `git log`·`gh pr view --comments`에 이유가 적혀 있는 경우가 많다.
- 질문에 없는 지적(버그·개선)을 발견하면 답글 끝에 `🟡`로 한 줄만 덧붙인다 — 이 루프는 리뷰가 아니라 읽기다.
  지적을 쏟으면 사용자가 묻고 싶은 흐름이 끊긴다.
- 창이 이상하면 `<scripts>/difit-health-check.sh $P`.

## 인자

$ARGUMENTS는 PR 번호·URL 또는 브랜치명이다: $ARGUMENTS
