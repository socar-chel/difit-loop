#!/usr/bin/env bash
# 레포 이름에서 difit 포트를 결정적으로 계산한다 — 포트표 없이도 같은 레포는 어디서든 같은 포트.
#   5100 + (cksum(레포명) % 80) * 10  →  5100~5890, 10의 배수만 (Vite 5173 · Postgres 5432 · VNC 5900 회피)
# 사용: difit-port.sh [n]   n=1,2 면 스택 PR용 +1, +2 (기본 0)
# 레포명은 origin URL의 마지막 경로(워크트리 디렉터리명이 아니라) — 워크트리마다 포트가 갈리지 않게.
set -u
name=$(git remote get-url origin 2>/dev/null | sed -E 's#/*$##; s#\.git$##; s#.*[/:]##')
[ -n "$name" ] || name=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
sum=$(printf '%s' "$name" | cksum | awk '{print $1}')
echo $(( 5100 + (sum % 80) * 10 + ${1:-0} ))
