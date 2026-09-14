#!/usr/bin/env node
// pending-threads — difit `comment get --format json` 출력에서 "마지막 메시지가 에이전트 것이 아닌" 스레드만 남긴다.
//
//   npx difit comment get --port 5600 --format json | node pending-threads.mjs            # author 기본 claude
//   npx difit comment get --port 5600 --format json | node pending-threads.mjs --me claude
//
// 출력: {id, filePath, line, question, history} JSONL. 답할 것이 없으면 아무것도 출력하지 않고 exit 1.
// 왜 필요한가 — 같은 스레드가 라운드마다 다시 온다(pair-review-pr 은 커밋이 없어 세션이 안 바뀌고, pair-review 는
// 이월하면 id 가 새로 발급돼 id 로는 못 좇는다). "내가 마지막으로 말했는가"가 처리 여부의 유일한 마커다
// (별도 상태 파일이 필요 없다). 이월 스레드는 carry-comments 가 author 를 에이전트로 바꿔 올리므로 여기 안 잡힌다. 의존성 없음.

import { readFileSync } from 'node:fs'

export function pending(threads, me = 'claude') {
  const out = []
  for (const t of threads) {
    const msgs = t.messages ?? []
    if (msgs.length === 0) continue
    const last = msgs[msgs.length - 1]
    if ((last.author ?? '') === me) continue
    const line = typeof t.position?.line === 'number' ? t.position.line : t.position?.line?.start
    out.push({
      id: t.id,
      filePath: t.filePath,
      line,
      question: last.body,
      history: msgs.slice(0, -1).map((m) => `${m.author ?? '?'}: ${m.body}`),
    })
  }
  return out
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const i = process.argv.indexOf('--me')
  const me = i > 0 ? process.argv[i + 1] : 'claude'
  const raw = JSON.parse(readFileSync(0, 'utf8'))
  const threads = Array.isArray(raw) ? raw : raw.threads ?? []
  const result = pending(threads, me)
  for (const r of result) console.log(JSON.stringify(r))
  if (result.length === 0) process.exit(1)
}
