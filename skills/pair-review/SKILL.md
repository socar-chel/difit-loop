---
name: pair-review
description: 내 브랜치를 PR 올리기 전에 에이전트와 페어로 리뷰하는 루프 — 셀프리뷰 스레드를 difit(로컬 diff 뷰어)에 미리 달아 띄우고, 사용자가 브라우저에서 단 코멘트를 판단해 반영 커밋을 쌓고, 커밋으로 끊긴 스레드를 새 diff로 이월하며 OK가 나올 때까지 반복한다. "pair-review", "페어 리뷰", "PR 전 리뷰", "리뷰 루프", "PR 준비하자" 키워드, 그리고 PR을 만들기 전 사람 리뷰가 필요해진 시점에 트리거. 남이 올린 PR을 읽고 리뷰할 때는 pair-review-pr.
---

# pair-review — 내 브랜치를 PR 전에 페어로 리뷰

내 변경을 사람이 브라우저에서 보며 코멘트를 달고, 에이전트가 판단해 고치고, 다시 보는 **왕복 루프**다.
화면은 difit(로컬 diff 뷰어)이고 difit은 고치지 않는다 — 루프 동안 고치는 것은 리뷰 대상 코드다.
띄우기·검증·코멘트 규약·수집은 [COMMON.md](COMMON.md)에 있다. 이 문서는 그 위의 루프만 적는다.
`<scripts>`는 이 스킬의 `scripts/` 디렉터리다.

내 PR이 이미 올라간 뒤라도 **고치면서 볼 거면 이 스킬**이다(HEAD vs base 루프라 커밋이 PR 브랜치에 쌓일
뿐이다). 남의 PR을 읽고 리뷰 초안을 낼 거면 `pair-review-pr`.

## 전체 흐름

```
[0 사전 점검] → [1 셀프리뷰 시드] → [2 띄우기] → [3 코멘트 대기]
→ [4 커밋 전 수집] → [5 판단·반영·커밋] → [6 스레드 이월] ⟲ (OK까지) → [7 종료]
```

## 0단계 — 사전 점검

1. `git branch --show-current` — main/master면 중단하고 브랜치 생성을 안내한다.
2. `git status` — 미커밋 변경이 있으면 커밋을 먼저 제안한다 (커밋 후 리뷰 원칙).
3. base 브랜치: 인자로 받았으면 사용, 없으면 사용자에게 묻는다. **항상 `origin/<base>`로 정규화한다**
   (이유는 COMMON 「띄우기」). `git fetch origin <base>` 후 `git log HEAD..origin/<base> --oneline`으로
   원격 전진 여부를 보고, 전진해 있으면 리뷰 시작 전에 사용자에게 알린다.
4. 포트: `bash <scripts>/difit-port.sh` (COMMON 「포트」).

## 1단계 — 셀프리뷰 시드

1. `git diff origin/<base>...HEAD`와 `git log origin/<base>..HEAD --oneline`으로 변경을 검토한다.
   자잘한 문제(오타·디버그 출력·명백한 버그)는 바로 수정 후 커밋한다.
2. 판단이 갈리는 문제는 수정하지 말고 **스레드로 모은다** — 채팅에만 쓰지 않는다. 사용자가 diff를 보는
   자리에 지적이 붙어 있어야 화면과 채팅을 번갈아 보지 않는다. 본문은 🔴🟡🟢 신호등, 앵커는
   `first-added-line.mjs` (COMMON 「코멘트 규약」).
3. 페이로드를 `comments.json`으로 저장한다.

## 2단계 — 띄우기

COMMON 「띄우기 + 검증」 그대로 — `HEAD origin/<base> --merge-base --background --keep-alive --port <포트>
--comment "$(cat comments.json)"`. `/api/diff`가 git과 맞을 때만 URL을 준다.

## 3단계 — 코멘트 대기

사용자에게 URL과 함께: "브라우저에서 코멘트를 달고, 끝나면 알려주세요."

## 4단계 — 커밋 전 수집 (반드시 커밋 전)

```bash
npx difit comment get --port <port> --format json > old.json
node <scripts>/pending-threads.mjs < old.json
```

**difit의 코멘트 세션 키는 해석된 base+target 커밋 쌍이다.** 커밋을 하나 쌓으면 target이 바뀌어
빈 세션이 된다 — 서버를 재시작하지 않아도 그렇다. 그래서 수집은 반드시 커밋 전에 끝내고 파일로
남긴다. `old.json`은 지우지 않는다(서버가 죽어도 재주입할 수 있는 마지막 사본). 0건인데 사용자가
"달았다"고 하면 COMMON 「수집과 처리 마커」의 localStorage 절차.

## 5단계 — 판단 · 반영 · 커밋

각 코멘트를 아래 원칙으로 처리하고 결과를 요약한다: 반영 ✅ / 역제안 💬 / 질문 ❓.

- **제3자 시각 우선** — 시켰으니 반영하는 게 아니라 코드베이스 관점에서 합당한지 먼저 판단한다.
- **동의하면** 반영 + 커밋. 왜 합당한지 한 줄.
- **이견이 있으면** 반영하지 않은 채 근거를 들어 역제안. 재차 요구하면 반영하되 명백한 버그면 다시 경고.
- **정보가 부족하면** 추측으로 구현하지 말고 역질문.
- 스레드마다 답변 한 문단을 `answers.json`에 **스레드 `id`를 키로** 모아 둔다 — 6단계가 본문에 잇는다.
  반영이면 `→ 반영: …`, 역제안이면 `→ 역제안: …`, 질문이면 `→ 질문: …`으로 시작한다.

반영분은 새 커밋으로 쌓는다. 서버는 그대로 둔다 — 파일 감시가 새 커밋을 화면에 반영한다.

## 6단계 — 스레드 이월

커밋 뒤 답변을 붙일 때는 `reply`가 아니라 **새 `thread`로, 바뀐 줄 번호에** 올린다(옛 세션이 비어
`reply`는 매칭 스레드를 못 찾는다).

1. **`GET /api/diff`의 `target`이 새 SHA로 바뀐 것을 먼저 확인한다.** 커밋 직후에는 서버가 잠깐 옛
   target을 쥐고 있어 `add`가 옛 세션에 붙어 "살아 있는 것처럼" 보이다가 몇 초 뒤 0건이 된다.
2. 미해결 스레드를 새 diff의 유효한 앵커로 옮기고 5단계의 답변을 잇는다. 본문은 원문 → 사용자 답글(`> ` 인용)
   → `answers.json`의 답변 순서로 한 스레드가 되고, author는 전부 `claude`다(이월은 에이전트의 게시다 —
   사용자 저자를 유지하면 `pending-threads.mjs`가 그 스레드를 다음 라운드에 다시 잡는다):
   ```bash
   node <scripts>/carry-comments.mjs old.json origin/<base>...HEAD --answers answers.json > new.json
   npx difit comment add --port <port> "$(cat new.json)"
   ```
   앵커 규칙 — 옛 줄이 아직 `+` 줄이면 유지, 아니면 그 파일에서 옛 줄 뒤 첫 `+` 줄, 그것도 없으면 파일의 첫
   `+` 줄(stderr `moved:`). 파일이 새 diff에서 사라졌으면 `skip:`으로 알리고 빠진다 — 그 스레드의 답변은
   채팅으로 전한다. 범위 앵커는 `start` 한 줄로, `old` 측 앵커는 `new` 측으로 바뀐다(삭제된 줄은 새 diff에서
   다시 가리킬 수 없다). `answers.json`의 id가 `old.json`에 없으면 stderr로 알린다 — 오타를 그 자리에서 잡는다.
3. 올린 뒤 `comment get`으로 `filePath:line`이 의도한 자리인지, `add` 응답의 `count`·`warnings`가 맞는지
   확인하고, 사용자에게 "탭을 새로고침해 주세요"로 안내한다.
4. 추가 코멘트가 있으면 3~6단계를 반복한다. 사용자가 승인("OK")하면 7단계로.

## 7단계 — 종료

요약(총 코멘트 수, 반영/역제안/보류, 최종 커밋 목록)을 제시하고 `kill <pid>`로 서버를 끝낸다.
이후 PR 생성은 이 스킬의 범위 밖이다 — 프로젝트의 PR 생성 절차(`gh pr create --draft` 등)로 넘긴다.

## 스택 PR 모드 — 브랜치 여러 개를 한 워크트리에서 동시에

`HEAD`를 쓸 수 있는 것은 맨 위 브랜치뿐이라 나머지는 "특정 커밋 비교"가 된다. 서버는 기동 시점에
해석한 커밋을 붙들고 감시가 꺼져 있어 리베이스·force-push 뒤에도 옛 diff를 보여준다.

```bash
git rev-parse --short origin/main <브랜치1> <브랜치2> <브랜치3>
P=$(bash <scripts>/difit-port.sh)                                    # 레포 포트, 스택은 +0 +1 +2
npx difit <sha1> <mainSha> --background --keep-alive --port $P         # ① base main
npx difit <sha2> <sha1>    --background --keep-alive --port $((P+1))   # ② base ①
npx difit <sha3> <sha2>    --background --keep-alive --port $((P+2))   # ③ base ②
for p in $P $((P+1)) $((P+2)); do curl -s localhost:$p/api/diff | jq -c '{p:'$p', base:.baseCommitish, target:.targetCommitish, files:(.files|length)}'; done
```

- 타깃·base 모두 SHA로 준다 — 창 자체가 무엇을 보는지 말하게.
- 어느 브랜치든 새 커밋·force-push가 생기면 그 서버와 위 서버를 죽였다 다시 띄운다. 코멘트는 죽이기
  전에 수집한다.
- 탭 제목이 전부 `difit - Git Diff Viewer`로 같으므로 안내는 포트 번호로.

## 인자

$ARGUMENTS가 있으면 base 브랜치 지정으로 해석한다: $ARGUMENTS
