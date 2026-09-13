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
// 눈으로 세지 말고 이 스크립트를 쓴다. 의존성 없음(순수 node).

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// diff를 훑어 파일별 첫 + 줄의 new 측 번호를 센다.
// hunk 헤더에서 시작 번호를 받고, 컨텍스트 줄에서만 증가시킨다(- 줄은 new 측에 없다).
export function* firstAddedLines(diff) {
  let path = null
  let line = null
  let done = false
  let blank = null

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      if (!done && blank !== null) yield blank
      blank = null
      path = raw.slice(6)
      line = null
      done = false
      continue
    }
    if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw)
      line = m ? Number(m[1]) : null
      continue
    }
    if (done || path === null || line === null) continue

    if (raw.startsWith('+')) {
      // 빈 줄은 앵커로 쓸모가 없다 — 내용 있는 첫 줄을 고른다.
      // 전부 빈 줄이면 blank로 잡아뒀다가 파일이 끝날 때 그것을 낸다.
      if (raw.slice(1).trim() !== '') {
        yield { path, line, sample: raw.slice(1) }
        done = true
      } else if (blank === null) {
        blank = { path, line, sample: raw.slice(1) }
      }
      line += 1
    } else if (raw.startsWith('-')) {
      // new 측에 없는 줄 — 번호를 올리지 않는다
    } else {
      line += 1
    }
  }
  if (!done && blank !== null) yield blank
}

function main(argv) {
  const diff =
    argv[0] === '--stdin'
      ? readFileSync(0, 'utf8')
      : execFileSync('git', ['diff', ...argv], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

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
