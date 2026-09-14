import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reanchor, carry } from './carry-comments.mjs';
import { addedLinesByFile } from './diff-lines.mjs';

const diff = [
  '--- a/a.md',
  '+++ b/a.md',
  '@@ -18,6 +18,38 @@',
  ' ctx1',
  ' ctx2',
  ' ctx3',
  '+added 21',
  ' ctx4',
  '-gone',
  '+added 23',
  '+++ b/b.md',
  '@@ -1,2 +1,3 @@',
  ' keep',
  '+added 2',
].join('\n');

// 옛 앵커가 여전히 + 줄이면 그대로 둔다 — 옮길 이유가 없다.
test('옛 줄이 새 diff 에서도 + 줄이면 유지한다', () => {
  const added = addedLinesByFile(diff);
  assert.deepEqual(added.get('a.md').map((a) => a.line), [21, 23]);
  assert.equal(reanchor(added.get('a.md'), 21), 21);
});

// 옛 앵커가 컨텍스트로 밀렸으면 그 뒤 첫 + 줄로 — hunk 시작 줄을 잡는 함정을 피한다.
test('옛 줄이 더는 + 줄이 아니면 이후 첫 + 줄, 없으면 파일 첫 + 줄', () => {
  const added = addedLinesByFile(diff);
  assert.equal(reanchor(added.get('a.md'), 22), 23);
  assert.equal(reanchor(added.get('a.md'), 99), 21);
  assert.equal(reanchor(added.get('none.md'), 5), null);
});

// difit `comment get --format json` 모양({threads:[{filePath, position, messages}]})을 그대로 받는다.
test('스레드를 comment-imports 페이로드로 바꾸고 답글은 인용으로 잇는다', () => {
  const threads = [
    { id: 't1', filePath: 'a.md', position: { side: 'new', line: 22 },
      messages: [{ author: 'claude', body: '논의 필요 — X' }, { author: 'chel', body: '반영\n부탁' }] },
    { filePath: 'zzz.md', position: { side: 'new', line: 1 }, messages: [{ author: 'claude', body: 'orphan' }] },
  ];
  const out = carry(threads, addedLinesByFile(diff));
  assert.deepEqual(out, [{
    type: 'thread', author: 'claude', filePath: 'a.md', position: { side: 'new', line: 23 },
    body: '논의 필요 — X\n\n> chel: 반영\n> 부탁',
  }]);
});

// 이월은 에이전트의 게시다 — 사용자가 연 스레드도 author 를 me 로 바꿔야 pending-threads 가 매 라운드 다시 잡지 않는다.
// 답변은 --answers 의 스레드 id 로 매칭해 본문 끝에 잇는다.
test('답변을 스레드 id 로 붙이고 author 는 항상 에이전트다', () => {
  const threads = [
    { id: 'u1', filePath: 'a.md', position: { side: 'new', line: 21 }, messages: [{ author: 'User', body: '왜 이렇게?' }] },
    { id: 'u2', filePath: 'a.md', position: { side: 'new', line: 23 }, messages: [{ author: 'User', body: '답변 없음' }] },
  ];
  const out = carry(threads, addedLinesByFile(diff), { answers: { u1: '→ 반영: 그렇게 고쳤다' }, me: 'claude' });
  assert.deepEqual(out.map((o) => [o.author, o.body]), [
    ['claude', '왜 이렇게?\n\n→ 반영: 그렇게 고쳤다'],
    ['claude', '답변 없음'],
  ]);
});
