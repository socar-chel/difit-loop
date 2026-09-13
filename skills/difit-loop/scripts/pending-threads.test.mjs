import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pending } from './pending-threads.mjs'

const t = (id, authors) => ({ id, filePath: 'a.ts', position: { side: 'new', line: 3 }, messages: authors.map((a, i) => ({ author: a, body: `m${i}` })) })

test('마지막 메시지가 에이전트 것이면 제외한다', () => {
  assert.deepEqual(pending([t('x', ['claude'])]), [])
  assert.deepEqual(pending([t('x', ['claude', 'User', 'claude'])]), [])
})
test('마지막 메시지가 사용자 것이면 질문과 이력을 낸다', () => {
  const r = pending([t('x', ['claude', 'User'])])
  assert.equal(r.length, 1)
  assert.equal(r[0].question, 'm1')
  assert.deepEqual(r[0].history, ['claude: m0'])
})
test('사용자가 새로 연 스레드도 잡는다 · 범위 앵커는 start', () => {
  const th = t('y', ['User']); th.position.line = { start: 7, end: 9 }
  const r = pending([th])
  assert.equal(r[0].line, 7)
  assert.deepEqual(r[0].history, [])
})
