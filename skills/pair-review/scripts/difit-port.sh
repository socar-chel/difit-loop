#!/usr/bin/env bash
# 레포 이름에서 difit 포트를 결정적으로 계산한다 — 포트표 없이도 같은 레포는 어디서든 같은 포트.
#   5100 + (cksum(레포명) % 80) * 10  →  5100~5890, 10의 배수만 (Vite 5173 · Postgres 5432 · VNC 5900 회피)
# 사용: difit-port.sh [n]   n=1,2 면 스택 PR용 +1, +2 (기본 0)
# 레포명은 origin URL의 마지막 경로(워크트리 디렉터리명이 아니라) — 워크트리마다 포트가 갈리지 않게.
#
# 직접 배정: $XDG_CONFIG_HOME/pair-review/ports (기본 ~/.config/pair-review/ports)에 `<레포명>=<포트>` 한 줄씩.
# 해시값보다 우선한다 — 자주 쓰는 레포에 외우기 쉬운 번호를 주거나, 해시가 겹친 레포를 떼어 놓을 때.
# 배정 포트도 10의 배수여야 스택(+1·+2)·pair-review-pr(+5)이 이웃 레포와 안 겹친다.
set -u
name=$(git remote get-url origin 2>/dev/null | sed -E 's#/*$##; s#\.git$##; s#.*[/:]##')
[ -n "$name" ] || name=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")

ports_file="${DIFIT_PORTS_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/pair-review/ports}"
base=""
if [ -r "$ports_file" ]; then
  # `name=port` — 앞뒤 공백 허용, # 주석·빈 줄 무시. 같은 이름이 여러 줄이면 마지막 줄.
  base=$(awk -F= -v n="$name" '
    /^[[:space:]]*(#|$)/ { next }
    { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2) }
    $1 == n && $2 ~ /^[0-9]+$/ { p = $2 }
    END { if (p != "") print p }
  ' "$ports_file")
fi
if [ -z "$base" ]; then
  sum=$(printf '%s' "$name" | cksum | awk '{print $1}')
  base=$(( 5100 + (sum % 80) * 10 ))
fi
echo $(( base + ${1:-0} ))
