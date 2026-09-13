#!/usr/bin/env node
// carry-comments — 커밋으로 target 이 바뀌어 빈 세션이 된 difit 스레드를 새 diff 의 유효한 앵커로
// 옮겨 다시 올릴 수 있는 comment-imports JSON 을 만든다.
//
//   npx difit comment get --port 4970 --format json > old.json     # 반드시 커밋 전에
//   git commit …
//   node carry-comments.mjs old.json origin/main...HEAD > new.json
//   npx difit comment add --port 4970 "$(cat new.json)"
//
// 왜 필요한가 — difit 코멘트 세션은 base+target 커밋 쌍이 키라 커밋마다 리셋된다(SKILL.md 「코멘트는 커밋을 넘어 살지 않는다」).
// 되살릴 때 앵커를 눈으로 다시 세면 ①·② 함정(first-added-line.mjs 참조)에 다시 걸린다.
//
// 앵커 규칙: 옛 줄이 새 diff 에서도 + 줄이면 그대로, 아니면 그 파일에서 옛 줄 이후 첫 + 줄,
// 그것도 없으면 파일의 첫 + 줄. 파일이 새 diff 에 없으면 stderr 로 알리고 건너뛴다.
// 본문: 원문을 그대로 두되 답글이 있으면 "> " 인용으로 이어 붙인다. author 는 첫 메시지 것을 유지한다.
// 의존성 없음(순수 node).

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// diff 를 훑어 파일별 + 줄의 new 측 번호 집합을 만든다(정렬된 배열).
export function addedLinesByFile(diff) {
  const out = new Map()
  let path = null
  let line = null
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ b/')) { path = raw.slice(6); line = null; out.set(path, []); continue }
    if (raw.startsWith('@@')) { const m = /\+(\d+)/.exec(raw); line = m ? Number(m[1]) : null; continue }
    if (line === null || path === null) continue
    if (raw.startsWith('+')) { out.get(path).push(line); line++ }
    else if (raw.startsWith('-')) { /* old 측만 */ }
    else if (raw.startsWith('\\')) { /* no newline 마커 */ }
    else line++
  }
  return out
}

// 옛 앵커 → 새 앵커. 없으면 null.
export function reanchor(added, oldLine) {
  if (!added || added.length === 0) return null
  if (added.includes(oldLine)) return oldLine
  return added.find((n) => n > oldLine) ?? added[0]
}

export function carry(oldThreads, added) {
  const out = []
  for (const t of oldThreads) {
    const pos = t.position ?? {}
    const oldLine = typeof pos.line === 'number' ? pos.line : pos.line?.start
    const line = reanchor(added.get(t.filePath), oldLine)
    if (line === null) { console.error(`skip: ${t.filePath}:${oldLine} — 새 diff 에 이 파일의 + 줄이 없다`); continue }
    const msgs = t.messages ?? []
    if (msgs.length === 0) continue
    const [head, ...replies] = msgs
    const body = [head.body, ...replies.map((m) => `> ${m.author ?? '?'}: ${m.body.replace(/\n/g, '\n> ')}`)].join('\n\n')
    out.push({ type: 'thread', author: head.author ?? 'claude', filePath: t.filePath, position: { side: 'new', line }, body })
    if (line !== oldLine) console.error(`moved: ${t.filePath}:${oldLine} → ${line}`)
  }
  return out
}

// 진입점 판정은 first-added-line.mjs 와 같은 방식(심링크·경로 표기 차이에 안 흔들리는 파일명 비교).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [oldFile, range] = process.argv.slice(2)
  if (!oldFile || !range) { console.error('usage: carry-comments.mjs <old-threads.json> <base>...HEAD'); process.exit(2) }
  const raw = JSON.parse(readFileSync(oldFile, 'utf8'))
  const threads = Array.isArray(raw) ? raw : raw.threads ?? []
  const diff = execFileSync('git', ['diff', range], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const result = carry(threads, addedLinesByFile(diff))
  if (result.length === 0) { console.error('옮길 스레드가 없다'); process.exit(1) }
  process.stdout.write(JSON.stringify(result, null, 1) + '\n')
}
