# difit-loop

[difit](https://github.com/yoshiko-pg/difit)(로컬 diff 뷰어)을 코딩 에이전트의 **PR 전 반복 왕복 리뷰**에
쓰기 위한 스킬이다. 셀프리뷰 스레드를 difit에 주입해 띄우고 → 사용자 코멘트를 수집해 → 반영 커밋을 쌓고 →
커밋으로 끊긴 스레드를 새 diff로 이월하며 → OK가 나올 때까지 반복한다.

upstream `difit`·`difit-review` 스킬은 "한 번 띄워 코멘트를 주고받는" 단발 동작을 다루고, 이 스킬은 그 위의
루프다. difit 자체는 고치지 않는다.

```bash
npx skills add <org>/difit-loop
```

## 30초 요약

- **문제** — difit은 단발 뷰어다. 반복 리뷰에 쓰면 ① 커밋마다 코멘트 스레드가 끊기고 ② 원격 base가 전진하면
  남의 작업이 diff에 섞이고 ③ 포트가 조용히 밀려 옛 탭을 보게 되고 ④ 브라우저 창을 닫는 순간 서버와 코멘트가 사라진다.
- **해법** — 실행 표준형(플래그 5개) · 포트 고정 관례 · 코멘트 주입 규약을 지침으로 정하고, 앵커 계산과 스레드
  이월을 순수 Node 스크립트 2개에 맡긴다.
- **결과** — `npx difit` 원본 그대로, 셀프리뷰 → 사용자 코멘트 → 반영 커밋 → 재수집을 서버 재시작 없이 반복한다.

## 준비물

| 것 | 확인 | 비고 |
| --- | --- | --- |
| Node.js ≥ 21 | `node --version` | difit 요구사항. pnpm이 Node 20에 묶인 레포면 difit만 다른 Node로 |
| difit | `npx difit --version` → 5.x | 설치하지 않는다. 전역 설치가 있으면 `difit`을 우선 쓴다 |
| curl · jq | — | 기동 직후 `/api/diff` 대조 |
| 에이전트 | Claude Code 등 | 지침 파일과 셸 실행이 되면 다른 에이전트도 같다 |

## 실행 표준형

```bash
npx difit HEAD origin/<base> --merge-base --background --keep-alive --port <레포별 포트> \
  --comment "$(cat comments.json)"
# → {"port":4966,"url":"http://localhost:4966","pid":12345}
```

| 인자 | 빠뜨리면 |
| --- | --- |
| 타깃 `HEAD` (브랜치명 아님) | 파일 감시가 꺼져 커밋마다 죽였다 띄운다 |
| `--merge-base` | 원격 base 전진분(남의 머지)이 diff에 섞인다 |
| `--background` | 배너 파싱·URL 폴링이 필요하고 pid를 모른다 |
| `--keep-alive` | 창을 닫는 순간 서버와 메모리의 코멘트가 사라진다 |
| `--port` | 다른 세션이 4966을 쥐면 조용히 4967로 밀린다 |

## 지침에 붙일 것 (CLAUDE.md 등)

```markdown
## difit 리뷰 루프
- PR을 만들기 전에 /difit-loop 로 사용자 리뷰를 받는다.
- 레포별 포트: <레포A> 4966 · <레포B> 4967 · 그 외 4973부터.
```

레포별 포트를 고정하는 이유: difit은 탭 제목이 `difit - Git Diff Viewer`로 고정이라 "지금 보는 창이 어느
레포인지"를 포트 말고는 가를 수 없다.

## 핵심 함정 두 가지

1. **코멘트 세션은 커밋을 넘어 살지 않는다.** 세션 키가 base+target 커밋 쌍이라 커밋 하나에 빈 세션이 된다 —
   서버를 재시작하지 않아도. 그래서 수집(`comment get`)은 반드시 커밋 전에, 이월은 `carry-comments.mjs`로
   새 `thread`로 올린다(`reply`는 매칭 실패가 경고로만 남는다).
2. **앵커는 `+` 줄이어야 한다.** `line: 1`은 수정 파일 diff에 없어 안 뜨고, hunk 헤더의 시작 줄은 컨텍스트
   줄이라 안 바뀐 코드가 수십 줄 펼쳐진다. `first-added-line.mjs`로 구한다.

전체 절차·규약·스택 PR 모드는 [skills/difit-loop/SKILL.md](skills/difit-loop/SKILL.md).

## 스크립트

`skills/difit-loop/scripts/` — 의존성 없음.

| 파일 | 역할 |
| --- | --- |
| `first-added-line.mjs` | diff에서 파일별 첫 `+` 줄의 new 측 번호 → 코멘트 앵커 |
| `carry-comments.mjs` | 커밋으로 끊긴 스레드를 새 diff의 유효한 앵커로 옮긴 `comment add` 페이로드 생성 |
| `difit-health-check.sh` | 창이 이상할 때 프로세스 · 포트별 `/api/diff`를 한 번에 |

```bash
node --test skills/difit-loop/scripts/*.test.mjs
```

## 왜 difit을 포크하지 않나

difit이 `--comment`·`comment add`·`/api/comment-imports`를 공식 제공하고 본문에 마크다운을 렌더한다.
`type:"thread"` 주입은 diff 검증을 거치지 않아 앵커를 우리가 정할 수 있다 — 필요한 것 대부분이 지침 층에서
풀린다. 포크 비용은 확정적이다: `package.json`에 `exports`가 없어 라이브러리로 못 쓰고, `prepare`가 빌드가
아니라 `lefthook install`이라 `npx github:<user>/difit`가 동작하지 않는다(dist 미커밋).
