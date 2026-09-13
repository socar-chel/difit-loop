import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstAddedLines } from './first-added-line.mjs';

// hunk 헤더의 new 측 시작 줄(18)이 아니라 컨텍스트 3줄을 지난 21이어야 한다.
// 이 구분을 못 하면 difit이 안 바뀐 코드를 수십 줄 펼쳐 보여준다.
test('컨텍스트를 건너뛰고 첫 + 줄을 센다', () => {
  const diff = [
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -18,6 +18,38 @@',
    ' ctx1',
    ' ctx2',
    ' ctx3',
    '+added here',
    ' ctx4',
  ].join('\n');
  assert.deepEqual([...firstAddedLines(diff)], [
    { path: 'a.md', line: 21, sample: 'added here' },
  ]);
});

// - 줄은 new 측에 없으므로 번호를 올리면 안 된다.
test('삭제 줄은 new 측 번호를 올리지 않는다', () => {
  const diff = [
    '+++ b/b.md',
    '@@ -1,4 +1,4 @@',
    ' keep',
    '-gone1',
    '-gone2',
    '+new line',
  ].join('\n');
  assert.deepEqual([...firstAddedLines(diff)], [
    { path: 'b.md', line: 2, sample: 'new line' },
  ]);
});

// 전체가 신규인 파일은 1행이 실제 추가 줄이다 — 이 경우에만 1이 맞다.
test('신규 파일은 1행을 돌려준다', () => {
  const diff = ['+++ b/new.md', '@@ -0,0 +1,2 @@', '+# title', '+body'].join('\n');
  assert.deepEqual([...firstAddedLines(diff)], [
    { path: 'new.md', line: 1, sample: '# title' },
  ]);
});

test('파일마다 첫 + 줄 하나씩만 낸다', () => {
  const diff = [
    '+++ b/a.md', '@@ -1,2 +1,3 @@', ' ctx', '+one', '+two',
    '+++ b/b.md', '@@ -10,2 +10,3 @@', ' ctx', ' ctx', '+three',
  ].join('\n');
  assert.deepEqual([...firstAddedLines(diff)], [
    { path: 'a.md', line: 2, sample: 'one' },
    { path: 'b.md', line: 12, sample: 'three' },
  ]);
});

test('추가 줄이 없으면 아무것도 내지 않는다', () => {
  const diff = ['+++ b/a.md', '@@ -1,2 +1,1 @@', ' ctx', '-gone'].join('\n');
  assert.deepEqual([...firstAddedLines(diff)], []);
});

// 빈 줄은 앵커로 쓸모가 없다 — 내용 있는 첫 줄을 고른다.
test('빈 추가 줄을 건너뛰고 내용 있는 줄을 고른다', () => {
  const diff = ['+++ b/a.md', '@@ -1,1 +1,3 @@', ' ctx', '+', '+real content'].join('\n');
  assert.deepEqual([...firstAddedLines(diff)], [
    { path: 'a.md', line: 3, sample: 'real content' },
  ]);
});

test('추가 줄이 전부 빈 줄이면 그중 첫 줄을 낸다', () => {
  const diff = ['+++ b/a.md', '@@ -1,1 +1,2 @@', ' ctx', '+'].join('\n');
  assert.deepEqual([...firstAddedLines(diff)], [{ path: 'a.md', line: 2, sample: '' }]);
});
