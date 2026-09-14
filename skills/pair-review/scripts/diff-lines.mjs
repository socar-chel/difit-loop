#!/usr/bin/env node
// diff-lines — unified diff 를 훑어 파일별 "+ 로 추가된 줄"의 new 측 번호를 모은다.
// first-added-line.mjs 와 carry-comments.mjs 가 같은 파서를 쓴다 — 둘이 따로 세면 같은 diff 를 다르게 읽는다
// (실제로 `\ No newline at end of file` 마커를 한쪽만 건너뛰어 앵커가 한 줄 어긋났다).
//
// git 설정에 흔들리지 않게 diff 는 gitDiff() 로 뽑는다: core.quotePath(한글 경로가 "b/\355\225\234" 로 나와
// 파일이 통째로 빠진다) · diff.noprefix · 색 · 외부 diff 도구를 모두 끈다. --stdin 으로 받은 diff 는 따옴표
// 경로와 a/ b/ (또는 i/ w/ c/) 접두어를 여기서 벗긴다. 의존성 없음(순수 node).

import { execFileSync } from 'node:child_process'

const GIT_DIFF_ARGS = ['-c', 'core.quotePath=false', '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false',
  'diff', '--no-color', '--no-ext-diff']

export function gitDiff(args) {
  return execFileSync('git', [...GIT_DIFF_ARGS, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

// git 의 C 스타일 경로 인용("\355\225\234.md", \t, \", \\)을 푼다.
export function unquotePath(s) {
  if (!s.startsWith('"') || !s.endsWith('"')) return s
  const bytes = []
  const inner = s.slice(1, -1)
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (c !== '\\') { bytes.push(...Buffer.from(c, 'utf8')); continue }
    const n = inner[++i]
    if (/[0-7]/.test(n)) {
      const oct = inner.slice(i, i + 3)
      bytes.push(parseInt(oct, 8)); i += 2
    } else {
      bytes.push(...Buffer.from({ n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v' }[n] ?? n, 'utf8'))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

function headerPath(raw) {
  const p = unquotePath(raw.slice(4).replace(/\t.*$/, ''))
  if (p === '/dev/null') return null
  return p.replace(/^[abciw]\//, '')
}

// Map<path, Array<{line, text}>> — 파일 등장 순서·줄 번호 오름차순.
export function addedLinesByFile(diff) {
  const out = new Map()
  let path = null
  let line = null
  let inHunk = false
  let prev = ''
  for (const raw of diff.split('\n')) {
    // `+++ ` 는 hunk 밖이거나, 바로 앞이 `--- ` 이거나, git 접두어(`b/`·`"b/`) 꼴일 때만 헤더다 —
    // 내용이 `++ x` 인 추가 줄과 구분한다.
    if (raw.startsWith('+++ ') && (!inHunk || prev.startsWith('--- ') || /^\+\+\+ "?[abciw]\//.test(raw))) {
      path = headerPath(raw); line = null; inHunk = false
      if (path !== null && !out.has(path)) out.set(path, [])
    } else if (raw.startsWith('diff --git ')) {
      path = null; line = null; inHunk = false
    } else if (raw.startsWith('@@')) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw)
      line = m ? Number(m[1]) : null; inHunk = true
    } else if (inHunk && path !== null && line !== null) {
      if (raw.startsWith('+')) { out.get(path).push({ line, text: raw.slice(1) }); line++ }
      else if (raw.startsWith('-')) { /* old 측에만 있는 줄 — new 측 번호는 안 움직인다 */ }
      else if (raw.startsWith('\\')) { /* `\ No newline at end of file` — 줄이 아니다 */ }
      else line++
    }
    prev = raw
  }
  return out
}
