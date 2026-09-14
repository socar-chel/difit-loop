---
name: pair-review-pr
description: 남이 올린 PR·브랜치를 에이전트와 페어로 리뷰하는 루프 — 워크트리로 받아 difit(로컬 diff 뷰어)에 띄우고, 에이전트가 읽기 순서 투어와 발견한 문제를 스레드로 미리 달고, 사용자가 코드 줄에 단 질문·메모에 주변 코드·호출부·테스트를 읽고 답글을 달며, 끝에 리뷰 초안을 파일로 낸다. 코드는 고치지 않고 게시는 사용자가 한다. "pair-review-pr", "이 PR 같이 봐줘", "PR 리뷰 도와줘", "PR 설명해줘", "이 PR 리뷰하자" 키워드, 그리고 남의 변경을 리뷰해야 하는 시점에 트리거. 내 브랜치를 PR 전에 고치면서 볼 때는 pair-review.
---

# pair-review-pr — 남의 PR을 페어로 리뷰

`pair-review`가 "내 코드를 사람이 리뷰"라면, 이 스킬은 "**남의 코드를 사람과 에이전트가 같이 리뷰**"다.
사용자의 코드 리뷰를 수월하게 하는 것이 목적이다 — 에이전트는 먼저 읽고 문제를 표시해 두고, 사용자가
코드 줄에 단 질문에 근거를 들어 답하고, 사용자가 남긴 메모를 리뷰 초안으로 모은다.

- **코드는 고치지 않는다.** 남의 브랜치다. 라운드의 산출물은 커밋이 아니라 스레드 답변과 리뷰 초안이다.
- **게시하지 않는다.** 남의 PR에 글을 남기는 것은 되돌리기 어려운 외부 행위라 초안까지만 만들고 사용자가 올린다.
- 커밋이 없으니 코멘트 세션이 바뀌지 않아 `type: reply`가 그대로 이어진다 — 이월은 PR에 새 커밋이 올라올 때만.

띄우기·검증·코멘트 규약·수집은 [../pair-review/COMMON.md](../pair-review/COMMON.md)에 있다.
`<scripts>`는 `~/.claude/skills/pair-review/scripts`다(같은 설치로 둘 다 들어온다).

## 전체 흐름

```
[0 가져오기: 워크트리] → [1 띄우기] → [2 시드: 투어 + 지적] → [3 질문·메모 루프] ⟲ → [4 PR 갱신 시] → [5 리뷰 초안]
```

## 0단계 — 가져오기

질문에 답하고 문제를 찾으려면 diff만으로 부족하다 — 호출부·테스트·이전 커밋을 읽어야 하므로 **로컬
체크아웃이 필수**다. 지금 작업 중인 브랜치를 건드리지 않게 워크트리로 받는다.

```bash
# PR 번호·URL
git worktree add ../<repo>-pr<n> -b pr-<n>-review && cd ../<repo>-pr<n> && gh pr checkout <n>
# 브랜치명
git fetch origin <branch> && git worktree add ../<repo>-<branch> origin/<branch>
```

base는 PR의 base 브랜치(`gh pr view <n> --json baseRefName -q .baseRefName`)다. `origin/<base>`로 정규화한다.

## 1단계 — 띄우기

```bash
P=$(( $(bash <scripts>/difit-port.sh) + 5 ))     # 같은 레포의 pair-review 서버(+0~2)와 겹치지 않게 +5
npx difit HEAD origin/<base> --merge-base --background --keep-alive --port $P
```

COMMON 「띄우기 + 검증」대로 `/api/diff`가 git과 맞을 때만 사용자에게 URL을 준다.

**대안 — `--pr <url>` 모드**: `npx difit --pr https://github.com/<o>/<r>/pull/<n> --background --keep-alive --port $P`.
체크아웃 없이 `gh pr diff`로 패치를 받고 **PR의 미해결 리뷰 스레드를 시작 코멘트로 임포트**한다 — 팀원
리뷰 맥락을 화면에 같이 놓고 싶을 때 고른다. 대신 (v5.0.12 실측) 세션이 `stdin` 키로 잡혀 "에디터에서 열기"가
꺼지고(`openInEditorAvailable: false`), `--context`를 못 쓴다. 에이전트가 답할 때 파일을 읽는 것은 어차피
로컬 체크아웃에서 하므로, 0단계는 이 모드에서도 생략하지 않는다.

## 2단계 — 시드: 투어 + 지적

diff를 **먼저 읽는다** — 사용자가 화면을 열기 전에 에이전트가 한 바퀴 돈 상태여야 한다.

1. **지적 (항상)** — 읽으면서 발견한 문제를 🔴🟡 스레드로 단다 (COMMON 「코멘트 규약」). 버그·경계
   조건·테스트 누락·호출부와의 불일치처럼 **코드를 열어 확인한 것만** 단다. 스타일·취향은 달지 않는다 —
   그건 사용자가 판단할 몫이고, 스레드가 많으면 사용자가 묻고 싶은 흐름이 끊긴다.
2. **투어 (조건부)** — 변경 파일이 **5개 이상이면** 🟢 스레드 3~5개로 읽는 순서를 잡아 준다: 순서 번호,
   "이 파일이 나머지의 어휘", 호출 경로가 바뀌는 지점, 테스트가 덮는 범위. 5개 미만이면 안내 스레드는 소음이다.
3. 앵커는 `first-added-line.mjs`로, 올리기는 `comment add`로:
   ```bash
   node <scripts>/first-added-line.mjs origin/<base>...HEAD
   npx difit comment add --port $P "$(cat seed.json)"
   ```

## 3단계 — 질문·메모 루프

사용자에게: "코드 줄에 질문이나 리뷰 메모를 달고, 달았다고 알려주세요." 신호가 오면:

```bash
npx difit comment get --port $P --format json | node <scripts>/pending-threads.mjs
```

마지막 메시지가 에이전트 것이 아닌 스레드만 나온다 (COMMON 「수집과 처리 마커」). 사용자 코멘트는 두 종류다:

- **질문** ("이거 왜 이렇게 했지?", "이 함수 어디서 불리나?") — **코드를 읽고** 답한다. diff 조각으로 추측하지
  않는다: 그 파일 전체와 변경 전 버전(`git show origin/<base>:<path>`), 호출부(`grep -rn <symbol>`), 관련
  테스트, 이 줄을 만든 커밋(`git log -S'<snippet>' --oneline`, `git blame`), PR 본문·커밋 메시지
  (`gh pr view --comments`). 근거는 `path:line`으로 인용한다. 코드만으로 판단이 안 서는 것은 **"코드에서는
  알 수 없다 — 작성자에게: …"** 라고 적고 본문에 `→ 작성자` 표시를 남긴다.
- **리뷰 메모** ("여기 null 체크 빠진 것 같은데", "이름이 별로") — 사용자의 지적을 **검증**한다: 맞으면 근거를
  보강해 `→ 확인:`으로, 틀리거나 이미 처리된 것이면 `→ 반론:`으로 어디서 처리되는지 인용해 답한다. 맞는 지적은
  5단계 리뷰 초안에 들어간다.

답변은 `type: reply`로 같은 스레드에, 사용자의 언어로. 한 스레드에 질문이 둘이면 번호를 붙여 둘 다 답한다.

```bash
npx difit comment add --port $P '[{"type":"reply","author":"claude","filePath":"<path>","position":{"side":"new","line":<line>},"body":"…"}]'
```

올린 뒤 `comment get`으로 답글이 붙었는지(`warnings` 없음) 확인하고 "새로고침해 주세요". 사용자가
"다 봤다"고 할 때까지 반복.

## 4단계 — PR에 새 커밋이 올라왔을 때

워크트리에서 `git pull`(PR 브랜치)하면 파일 감시가 화면을 갱신하지만 **target이 바뀌어 코멘트 세션이 빈다**
(`pair-review` 4단계와 같다). 이때만 이월이 필요하다:

```bash
npx difit comment get --port $P --format json > old.json     # pull 전에
git pull
node <scripts>/carry-comments.mjs old.json origin/<base>...HEAD > new.json && npx difit comment add --port $P "$(cat new.json)"
```

이월된 스레드는 author가 전부 `claude`가 되므로 `pending-threads.mjs`가 더는 잡지 않는다 — **pull 전에 답하지
않은 질문이 있으면 먼저 답하고** pull 한다. `--pr` 모드는 세션 키가 `stdin`이라 안 비지만 패치를 다시 받으려면
서버를 재기동해야 한다(코멘트는 `comment get`으로 받아 뒀다가 `comment add`로 되돌린다).

## 5단계 — 리뷰 초안

1. 스레드를 모아 **리뷰 초안**을 마크다운 파일로 낸다 — 파일·줄 순으로, 세 묶음:
   - 🔴🟡 **지적** — 2단계 시드 중 사용자가 동의한 것 + 3단계에서 `→ 확인:`이 붙은 사용자 메모. 각각 한 줄
     근거(`path:line`)
   - ❓ **작성자에게 물을 것** — `→ 작성자` 표시가 붙은 스레드
   - 판정 제안 — approve / request changes / comment 중 하나와 이유 한 줄. 결정은 사용자가 한다.
   여기까지가 이 스킬의 일이다. **게시는 하지 않는다.** 원하면 `gh pr review <n> --comment --body-file <초안>`
   한 줄을 안내한다(인라인 코멘트로 올리려면 사용자의 GitHub 리뷰 절차로).
2. `kill <pid>`. 워크트리는 사용자에게 확인하고 `git worktree remove`.

## 답변 원칙

- **읽은 것만 말한다.** 열어 보지 않은 파일의 동작을 단정하지 않는다. 추측이면 추측이라고 쓴다.
- **"왜"에는 커밋·PR 본문을 먼저 본다** — `git log`·`gh pr view --comments`에 이유가 적혀 있는 경우가 많다.
- **사용자의 지적에도 제3자 시각으로** — 동의하는 척하지 않는다. 틀린 지적을 그대로 초안에 넣으면 작성자와의
  신뢰가 깎이는 건 사용자다.
- 창이 이상하면 `<scripts>/difit-health-check.sh $P` (COMMON 「창이 이상할 때」).

## 인자

$ARGUMENTS는 PR 번호·URL 또는 브랜치명이다: $ARGUMENTS
