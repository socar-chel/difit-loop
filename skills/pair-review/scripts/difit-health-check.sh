#!/usr/bin/env bash
# difit 리뷰 창이 이상할 때 추측 전에 한 번에 보는 것: 프로세스 · 포트별 /api/diff.
# 사용: difit-health-check.sh [port ...]   (포트를 안 주면 떠 있는 difit 서버의 --port 값을 모두 잡는다)
set -u

ports=("$@")
if [ ${#ports[@]} -eq 0 ]; then
  while IFS= read -r p; do ports+=("$p"); done < <(ps -eo command | grep -E 'node [^ ]*difit ' | grep -oE -- '--port [0-9]+' | awk '{print $2}' | sort -u)
fi

echo "## difit 서버"
ps -eo pid,lstart,command | grep -E 'node [^ ]*difit ' | sed -E 's#[^ ]*/node ##; s#[^ ]*/difit #difit #' | cut -c1-200
echo
echo "## 포트별 /api/diff (base·target은 서버가 기동 시점에 해석한 값 — 브랜치가 전진했어도 여기 값은 안 바뀐다)"
for p in "${ports[@]}"; do
  body=$(curl -sf --max-time 3 "http://localhost:$p/api/diff") || { echo "  :$p 응답 없음"; continue; }
  printf '  :%s ' "$p"
  printf '%s' "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("baseCommitish"), "→", d.get("targetCommitish"), "files", len(d.get("files",[])), "mode", d.get("requestedBaseMode") or "-")'
done
