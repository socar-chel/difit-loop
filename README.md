# pair-review

코드를 **에이전트와 페어로 리뷰**하는 Claude Code 스킬 두 개. 화면은 [difit](https://github.com/yoshiko-pg/difit)(로컬
diff 뷰어)이고, difit은 고치지 않는다 — 어떻게 부르고, 무엇을 넣고, 커밋 사이에서 코멘트를 어떻게 살리는지만 정한다.

| | 언제 | 호출 |
| --- | --- | --- |
| **`pair-review`** | **내 브랜치**를 PR 올리기 전에(또는 내 PR을 고치면서) 사람이 리뷰하고, 에이전트가 반영 커밋을 쌓고, OK까지 반복 | `/pair-review main` |
| **`pair-review-pr`** | **남이 올린 PR**을 에이전트가 먼저 읽고 문제를 표시해 두고, 사용자의 질문·메모에 답하고, 리뷰 초안을 낸다. 코드는 안 고침 | `/pair-review-pr 123` |

고치면서 볼 거면 `pair-review`, 읽고 리뷰할 거면 `pair-review-pr`.

```bash
npx skills add socar-chel/pair-review -g
```

설정은 없다. 설치 후 Claude Code에서 `/pair-review <base>` 또는 "PR 준비하자", `/pair-review-pr <n>` 또는 "이 PR 같이 봐줘"로
호출한다. Node ≥ 21이면 difit은 `npx`로 알아서 받는다.

갱신은 자동이 아니다 — 이 리포가 바뀌면 `npx skills update -g`로 받는다. 스킬은 에이전트가 내 권한으로 따르는 지시문이니,
갱신 뒤 `~/.claude/skills/pair-review/`의 diff를 한 번 보는 것을 권한다.

## 한 라운드 — `pair-review`

<img src="docs/loop.png" alt="한 라운드 — 에이전트: ① 커밋된 변경을 스스로 점검 → ② 리뷰 창을 연다 → ④ 코멘트를 검토, 맞는 것만 고쳐서 커밋 → ⑤ 리뷰 창의 스레드에 답글을 단다(고친 것도, 안 고친 이유도) → ⑦ PR 생성(스킬 밖). 사람: ③ 브라우저에서 코드 보며 코멘트를 단다 → 코멘트 달았어 → ⑥ 새 버전에서 답을 확인한다 → 더 묻거나 OK" width="100%">

가운데 큰 점선 테두리 안이 한 라운드다 — ③→④→⑤→⑥이 돌고, OK가 나올 때까지 반복한다. 사람이 하는 일은 ③과 ⑥뿐이다 —
**브라우저에서 코드를 보며 코멘트를 달고 "코멘트 달았어"**, 반영을 보고 **더 묻거나 "OK"**. 나머지는 에이전트가 한다.
파란 테두리 상자(①②④⑤)가 이 스킬이 에이전트에게 시키는 것이고, ⑦ PR 생성은 스킬 밖 — 프로젝트의 PR 절차로 넘긴다.

## 실제 화면

장난감 리포(`feat/coupon`, 파일 3개)에서 한 라운드를 돌린 기록이다.

**① 에이전트가 띄운 리뷰 창** — 셀프리뷰 스레드가 코드 옆에 미리 달려 있고(🔴), 사용자가 답글을 단다.
우상단 `origin/main...HEAD (merge-base)` — 원격 main이 2커밋 전진해 있어도 diff에 섞이지 않는다.

<img src="docs/screens/01-round1-red-thread.png" alt="src/cart.js:9 에 🔴 느슨한 비교 스레드와 사용자 답글" width="100%">

**② 같은 라운드의 🟡·🟢** — 논의 스레드에는 사용자가 결정을 남기고(throw로), 설명 스레드는 읽고 지나간다.

<img src="docs/screens/02-round1-yellow-green.png" alt="src/coupon.js 의 🟢 설명 스레드와 🟡 논의 스레드, 사용자 답글" width="100%">

**③ 반영 커밋 뒤** — 에이전트가 커밋 전에 수집한 스레드를 새 diff의 맞는 줄로 옮겨 다시 올렸다.
원문 → 사용자 답글(`>` 인용) → `→ 반영:` 답변이 한 스레드에 이어지고, 코드는 이미 바뀌어 있다.
화면이 갱신되면 사용자는 여기서 "OK" 또는 다음 코멘트를 이어 간다.

<img src="docs/screens/03-after-round-carried.png" alt="반영 커밋 뒤 src/coupon.js:14 로 이월된 🟡 스레드 — 원문, 사용자 답글 인용, 반영 답변" width="100%">

## 왜 그냥 difit을 띄우면 안 되나

| 그냥 띄우면 | 이 스킬은 |
| --- | --- |
| 커밋을 하나 쌓는 순간 코멘트 스레드가 **빈 세션**이 된다 — 세션 키가 base+target 커밋 쌍이라 | 커밋 **전에** 수집하고, `carry-comments.mjs`로 새 diff의 맞는 줄에 다시 올린다 |
| 원격 base가 전진해 있으면 남의 머지분이 diff에 섞인다 | `--merge-base`로 고정하고 기동 직후 `/api/diff`와 git을 대조한다 |
| 브라우저 창을 닫으면 서버와 메모리의 코멘트가 함께 죽는다 | `--keep-alive` — 탭을 닫아도 서버는 산다 |
| 포트가 조용히 +1로 밀려 옛 탭을 보게 된다 | 레포 이름에서 포트를 계산하고(`difit-port.sh`), 실제 포트를 JSON에서 읽는다 |
| 에이전트가 단 스레드가 엉뚱한 줄에 붙거나 안 보인다 | `first-added-line.mjs`로 `+` 줄만 앵커로 쓴다 |
| 같은 스레드를 라운드마다 다시 처리하거나, 처리한 것을 놓친다 | "마지막 메시지가 내 것인가"를 마커로 쓴다(`pending-threads.mjs`) — 이월 스레드는 답변을 이어 붙여 에이전트 저자로 다시 올린다 |

## 반대 방향 — `pair-review-pr`

**남이 올린 PR·브랜치**를 워크트리로 받아 difit에 띄운다. 에이전트가 먼저 읽고 발견한 문제(🔴🟡)와 읽기 순서 투어(🟢,
파일이 많을 때)를 스레드로 달아 두고, 사용자가 코드 줄에 단 질문에는 주변 코드·호출부·테스트를 읽고 **같은 스레드에
답글**을, 리뷰 메모에는 근거를 보강하거나 반론을 단다. 끝에 지적·작성자에게 물을 것·판정 제안을 **리뷰 초안 파일**로
모은다. 코드는 고치지 않고, 게시는 사용자가 한다.

| | `pair-review` | `pair-review-pr` |
| --- | --- | --- |
| 대상 | 내 브랜치 (PR 전, 또는 내 PR을 고치면서) | 남이 올린 PR·브랜치 |
| 사용자 코멘트의 뜻 | "고쳐라" | "이거 왜?" · "여기 이상한데" |
| 라운드의 산출물 | 반영 커밋 | 스레드 답변 |
| 세션 | 커밋마다 리셋 → 이월 | 커밋이 없어 유지 → `reply` 그대로 |
| 먼저 하는 일 | 🔴🟡🟢 셀프리뷰 스레드 | 🔴🟡 지적 + 🟢 읽기 순서 투어 (파일 5개 이상) |
| 끝 | "OK" → PR 생성 | "다 봤다" → 리뷰 초안 파일 (게시는 사용자) |

절차는 [skills/pair-review-pr/SKILL.md](skills/pair-review-pr/SKILL.md).

<img src="docs/screens/04-ask-thread.png" alt="pair-review-pr: 🟢 읽기 순서 투어 스레드 → 사용자 질문 → 코드 근거(package.json 줄·커밋)를 인용한 답글 → 작성자에게 물을 것 표시" width="100%">

실제 공개 PR(yoshiko-pg/difit #470, 파일 6개)에서 — 🟢 투어 → 사용자 질문 → `package.json:95`·커밋 `d6c86bf`를 근거로 답하고,
코드만으로 모르는 것은 `→ 작성자`로 표시해 마무리 초안으로 모은다.

## 코멘트 규약

스레드 본문은 신호등으로 시작한다. 리뷰어는 빨강부터 본다.

| | 뜻 |
| --- | --- |
| 🔴 | 반드시 수정 — 버그·보안·데이터 손실처럼 머지되면 안 되는 것 |
| 🟡 | 논의·제안 — 판단이 갈리거나 더 나은 대안이 있어 보이는 것 |
| 🟢 | 설명 — 조치 불필요. 왜 이렇게 했는지, 무엇을 먼저 볼지 |

파일 첫 줄에 총평을 달지 않는다(그 줄에 대한 지적으로 읽힌다). 커밋 뒤 답변은 `reply`가 아니라 **새 thread**로
온다 — 원문이 `>` 인용으로 붙는다.

## 들어 있는 것

```
skills/
├── pair-review/
│   ├── SKILL.md                  내 브랜치 루프 — 셀프리뷰 시드 → 코멘트 → 반영 커밋 → 이월 ⟲ · 스택 PR 모드
│   ├── COMMON.md                 두 스킬 공통 — 띄우기·검증 · 포트 · 코멘트 규약 · 수집 마커 · 창 이상
│   └── scripts/                  의존성 없음 (pair-review-pr 도 이것을 쓴다)
│       ├── diff-lines.mjs        diff 파서 (아래 둘이 공유 · git 설정에 안 흔들리게 diff를 뽑는다)
│       ├── first-added-line.mjs  diff에서 파일별 첫 + 줄 → 코멘트 앵커
│       ├── carry-comments.mjs    커밋으로 끊긴 스레드를 새 diff로 이월 (+ 스레드별 답변 잇기)
│       ├── pending-threads.mjs   마지막 메시지가 사용자 것인 스레드만 — 답할 질문 목록
│       ├── difit-port.sh         origin 레포명 → 5100~5890 사이 10의 배수 포트 (배정 파일이 우선)
│       └── difit-health-check.sh 창이 이상할 때 프로세스 · 포트별 /api/diff
└── pair-review-pr/
    └── SKILL.md                  남의 PR 루프 (워크트리 → 지적·투어 시드 → 질문/메모 답글 → 리뷰 초안)
```

```bash
node --test skills/pair-review/scripts/*.test.mjs
bash skills/pair-review/scripts/difit-port.test.sh
```

## 선택 사항

- **PR 전 강제** — CLAUDE.md에 `- PR을 만들기 전에 /pair-review 로 사용자 리뷰를 받는다.`
- **포트 직접 지정** — `~/.config/pair-review/ports`에 `<레포명>=<포트>` 한 줄씩. 스크립트가 해시보다 먼저 읽는다(10의 배수로).
- **다른 에이전트** — 절차는 셸 명령과 규칙뿐이라 AGENTS.md 등에 SKILL.md 내용을 옮기면 된다.

실측 기준 difit v5.0.12. upstream `difit`·`difit-review` 스킬(`npx skills add yoshiko-pg/difit`)은 단발 실행을
다루고, 이 스킬은 그 위의 루프다.

## 라이선스

MIT
