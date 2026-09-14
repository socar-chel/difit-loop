#!/usr/bin/env node
// first-added-line — difit 코멘트 앵커로 쓸 "첫 추가(+) 줄"의 new 측 번호를 구한다.
//
//   node first-added-line.mjs main...HEAD             변경 파일 전부
//   node first-added-line.mjs main...HEAD -- a.ts     특정 파일만
//   node first-added-line.mjs --stdin < diff.txt      이미 뽑아둔 diff 사용
//
// 출력: {"path":…,"line":…,"sample":…} JSONL. 추가된 줄이 하나도 없으면 exit 1.
//
// 왜 필요한가 — 앵커를 잘못 잡는 두 방식이 실제로 반복됐다(2026-08-30 실측).
//   ① line: 1 — 수정 파일 diff에는 1행이 아예 없다 → 스레드가 화면에 안 뜬다
//   ② hunk 헤더(@@ -18,6 +18,38 @@)의 new 측 시작 줄 — 그건 컨텍스트 줄이라 difit이
//      안 바뀐 코드를 수십 줄 펼쳐 보여준다 (세 파일 모두 정확히 3줄씩 어긋났다)
// 눈으로 세지 말고 이 스크립트를 쓴다. 파서는 diff-lines.mjs(carry-comments 와 공유). 의존성 없음(순수 node).

import { readFileSync } from 'node:fs'
import { addedLinesByFile, gitDiff } from './diff-lines.mjs'

// 파일마다 하나 — 빈 줄은 앵커로 쓸모가 없으니 내용 있는 첫 + 줄, 전부 빈 줄이면 첫 + 줄.
export function* firstAddedLines(diff) {
  for (const [path, added] of addedLinesByFile(diff)) {
    if (added.length === 0) continue
    const hit = added.find((a) => a.text.trim() !== '') ?? added[0]
    yield { path, line: hit.line, sample: hit.text }
  }
}

function main(argv) {
  const diff = argv[0] === '--stdin' ? readFileSync(0, 'utf8') : gitDiff(argv)

  let found = 0
  for (const hit of firstAddedLines(diff)) {
    console.log(JSON.stringify(hit))
    found += 1
  }
  if (found === 0) {
    console.error('추가된 줄이 없다 — 앵커를 잡을 수 없다(삭제만 있는 diff인지 확인)')
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    console.error('usage: first-added-line.mjs <revs> [-- <path>...] | --stdin')
    process.exit(2)
  }
  main(argv)
}
