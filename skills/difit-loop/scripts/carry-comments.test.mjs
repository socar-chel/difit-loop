import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addedLinesByFile, reanchor, carry } from './carry-comments.mjs';

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
  assert.deepEqual(added.get('a.md'), [21, 23]);
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
    { filePath: 'a.md', position: { side: 'new', line: 22 },
      messages: [{ author: 'claude', body: '논의 필요 — X' }, { author: 'chel', body: '반영\n부탁' }] },
    { filePath: 'zzz.md', position: { side: 'new', line: 1 }, messages: [{ author: 'claude', body: 'orphan' }] },
  ];
  const out = carry(threads, addedLinesByFile(diff));
  assert.deepEqual(out, [{
    type: 'thread', author: 'claude', filePath: 'a.md', position: { side: 'new', line: 23 },
    body: '논의 필요 — X\n\n> chel: 반영\n> 부탁',
  }]);
});
