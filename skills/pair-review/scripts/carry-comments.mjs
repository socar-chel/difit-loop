#!/usr/bin/env node
// carry-comments — 커밋으로 target 이 바뀌어 빈 세션이 된 difit 스레드를 새 diff 의 유효한 앵커로
// 옮겨 다시 올릴 수 있는 comment-imports JSON 을 만든다.
//
//   npx difit comment get --port 5100 --format json > old.json     # 반드시 커밋 전에
//   git commit …
//   node carry-comments.mjs old.json origin/main...HEAD [--answers answers.json] [--me claude] > new.json
//   npx difit comment add --port 5100 "$(cat new.json)"
//
// 왜 필요한가 — difit 코멘트 세션은 base+target 커밋 쌍이 키라 커밋마다 리셋된다(pair-review SKILL.md 4단계).
// 되살릴 때 앵커를 눈으로 다시 세면 ①·② 함정(first-added-line.mjs 참조)에 다시 걸린다.
//
// 앵커 규칙: 옛 줄이 새 diff 에서도 + 줄이면 그대로, 아니면 그 파일에서 옛 줄 이후 첫 + 줄,
// 그것도 없으면 파일의 첫 + 줄(stderr `moved:`). 파일이 새 diff 에 없으면 stderr 로 알리고 건너뛴다.
// 범위 앵커는 start 한 줄로, old 측 앵커는 new 측으로 바뀐다 — 삭제된 줄은 새 diff 에서 다시 잡을 수 없다.
// 본문: 원문 → 답글("> " 인용) → --answers 의 답변(스레드 id 로 매칭, 그대로 이어 붙임).
// author 는 항상 --me(기본 claude) — 이월은 에이전트의 게시이고, 사용자 저자를 유지하면 pending-threads 가
// 그 스레드를 라운드마다 "답할 것"으로 다시 잡는다. 의존성 없음(순수 node).

import { readFileSync } from 'node:fs'
import { addedLinesByFile, gitDiff } from './diff-lines.mjs'

// 옛 앵커 → 새 앵커. 없으면 null.
export function reanchor(added, oldLine) {
  if (!added || added.length === 0) return null
  const lines = added.map((a) => (typeof a === 'number' ? a : a.line))
  if (lines.includes(oldLine)) return oldLine
  return lines.find((n) => n > oldLine) ?? lines[0]
}

export function carry(oldThreads, added, { answers = {}, me = 'claude' } = {}) {
  const out = []
  for (const t of oldThreads) {
    const pos = t.position ?? {}
    const oldLine = typeof pos.line === 'number' ? pos.line : pos.line?.start
    const line = reanchor(added.get(t.filePath), oldLine)
    if (line === null) { console.error(`skip: ${t.filePath}:${oldLine} — 새 diff 에 이 파일의 + 줄이 없다`); continue }
    const msgs = t.messages ?? []
    if (msgs.length === 0) continue
    const [head, ...replies] = msgs
    const parts = [head.body, ...replies.map((m) => `> ${m.author ?? '?'}: ${m.body.replace(/\n/g, '\n> ')}`)]
    if (t.id && answers[t.id]) parts.push(answers[t.id])
    out.push({ type: 'thread', author: me, filePath: t.filePath, position: { side: 'new', line }, body: parts.join('\n\n') })
    if (line !== oldLine) console.error(`moved: ${t.filePath}:${oldLine} → ${line}`)
  }
  return out
}

function readThreads(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  return Array.isArray(raw) ? raw : raw.threads ?? []
}

// 진입점 판정은 first-added-line.mjs 와 같은 방식(심링크·경로 표기 차이에 안 흔들리는 파일명 비교).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] : undefined }
  const answersFile = opt('--answers')
  const me = opt('--me') ?? 'claude'
  const [oldFile, range] = argv
  if (!oldFile || !range) { console.error('usage: carry-comments.mjs <old-threads.json> <base>...HEAD [--answers answers.json] [--me author]'); process.exit(2) }
  const threads = readThreads(oldFile)
  const answers = answersFile ? JSON.parse(readFileSync(answersFile, 'utf8')) : {}
  const known = new Set(threads.map((t) => t.id))
  for (const id of Object.keys(answers)) if (!known.has(id)) console.error(`answers: 스레드 id ${id} 가 old.json 에 없다`)
  const result = carry(threads, addedLinesByFile(gitDiff([range])), { answers, me })
  if (result.length === 0) { console.error('옮길 스레드가 없다'); process.exit(1) }
  process.stdout.write(JSON.stringify(result, null, 1) + '\n')
}
