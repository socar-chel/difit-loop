import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addedLinesByFile, unquotePath } from './diff-lines.mjs'

const lines = (diff, path) => (addedLinesByFile(diff).get(path) ?? []).map((a) => a.line)

// `\ No newline at end of file` 는 줄이 아니다 — 세면 그 뒤 + 줄이 전부 한 줄씩 밀린다(실측: 기대 2, 출력 3).
test('no-newline 마커는 new 측 번호를 올리지 않는다', () => {
  const diff = ['+++ b/f.txt', '@@ -1,2 +1,3 @@', ' a', '-b', '\\ No newline at end of file', '+b2', '+c'].join('\n')
  assert.deepEqual(lines(diff, 'f.txt'), [2, 3])
})

// core.quotePath 기본값(true)이면 한글 경로가 C 스타일로 인용돼 나온다 — 그대로 두면 파일이 통째로 빠진다.
test('인용된 경로를 풀어 원래 파일명으로 잡는다', () => {
  const diff = ['--- "a/\\355\\225\\234\\352\\270\\200.md"', '+++ "b/\\355\\225\\234\\352\\270\\200.md"', '@@ -1,1 +1,2 @@', ' x', '+y'].join('\n')
  assert.deepEqual(lines(diff, '한글.md'), [2])
  assert.equal(unquotePath('"a\\tb\\"c\\\\"'), 'a\tb"c\\')
  assert.equal(unquotePath('plain'), 'plain')
})

// diff.noprefix / diff.mnemonicPrefix 설정에서 온 diff 도 같은 경로로 읽는다.
test('접두어가 없거나 i/ w/ 여도 경로를 맞춘다', () => {
  const noprefix = ['--- f.txt', '+++ f.txt', '@@ -1,1 +1,2 @@', ' a', '+b'].join('\n')
  const mnemonic = ['--- i/f.txt', '+++ w/f.txt', '@@ -1,1 +1,2 @@', ' a', '+b'].join('\n')
  assert.deepEqual(lines(noprefix, 'f.txt'), [2])
  assert.deepEqual(lines(mnemonic, 'f.txt'), [2])
})

test('삭제된 파일(+++ /dev/null)은 항목을 만들지 않는다', () => {
  const diff = ['diff --git a/gone.txt b/gone.txt', '--- a/gone.txt', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-a', '-b',
    'diff --git a/f.txt b/f.txt', '--- a/f.txt', '+++ b/f.txt', '@@ -1,1 +1,2 @@', ' a', '+b'].join('\n')
  const m = addedLinesByFile(diff)
  assert.equal(m.has('gone.txt'), false)
  assert.deepEqual(lines(diff, 'f.txt'), [2])
})

// 내용이 `++ x` 인 추가 줄은 `+++ x` 로 나온다 — hunk 안이면 헤더가 아니다.
test('hunk 안의 +++ 내용 줄을 파일 헤더로 오인하지 않는다', () => {
  const diff = ['+++ b/f.txt', '@@ -1,1 +1,3 @@', ' a', '+++ not a header', '+c'].join('\n')
  assert.deepEqual([...addedLinesByFile(diff).keys()], ['f.txt'])
  assert.deepEqual(lines(diff, 'f.txt'), [2, 3])
})
