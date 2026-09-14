#!/usr/bin/env bash
# difit-port.sh — 해시 경로·배정 파일 우선·스택 오프셋·폴백을 임시 git 레포로 검증한다.
# 실행: bash skills/pair-review/scripts/difit-port.test.sh
set -u
SC="$(cd "$(dirname "$0")" && pwd)/difit-port.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()   { echo "  ✅ $1"; pass=$((pass+1)); }
bad()  { echo "  ❌ $1 — 기대 $2 · 실제 $3"; fail=$((fail+1)); }
check(){ [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2" "$3"; }

# origin 이름만 다른 임시 레포 두 개
mkrepo() { mkdir -p "$T/$1"; git -C "$T/$1" init -q; git -C "$T/$1" remote add origin "https://github.com/x/$2.git"; }
mkrepo a korea-by-car
mkrepo b some-other-repo

expect_hash() { local s; s=$(printf '%s' "$1" | cksum | awk '{print $1}'); echo $(( 5100 + (s % 80) * 10 )); }

echo "== 배정 파일 없음 → 해시 =="
check "korea-by-car 해시"      "$(expect_hash korea-by-car)"    "$(cd "$T/a" && DIFIT_PORTS_FILE=/nonexistent bash "$SC")"
check "스택 +2"                "$(( $(expect_hash korea-by-car) + 2 ))" "$(cd "$T/a" && DIFIT_PORTS_FILE=/nonexistent bash "$SC" 2)"

echo "== 배정 파일 있음 =="
cat > "$T/ports" <<'P'
# 주석
korea-by-car = 5500
  dotfiles=5800
korea-by-car=5510
bad-line
notnum=abc
P
check "배정이 해시보다 우선(마지막 줄 승)" "5510" "$(cd "$T/a" && DIFIT_PORTS_FILE="$T/ports" bash "$SC")"
check "배정 + 스택 +1"                     "5511" "$(cd "$T/a" && DIFIT_PORTS_FILE="$T/ports" bash "$SC" 1)"
check "미배정 레포는 해시 폴백"            "$(expect_hash some-other-repo)" "$(cd "$T/b" && DIFIT_PORTS_FILE="$T/ports" bash "$SC")"
check "숫자 아닌 값은 무시 → 해시"         "$(expect_hash notnum)" "$(mkrepo c notnum >/dev/null; cd "$T/c" && DIFIT_PORTS_FILE="$T/ports" bash "$SC")"

echo "== XDG 기본 경로 =="
mkdir -p "$T/xdg/pair-review"; echo "korea-by-car=5500" > "$T/xdg/pair-review/ports"
check "XDG_CONFIG_HOME 경로를 읽는다" "5500" "$(cd "$T/a" && env -u DIFIT_PORTS_FILE XDG_CONFIG_HOME="$T/xdg" bash "$SC")"

echo; echo "통과 $pass · 실패 $fail"; [ "$fail" -eq 0 ]
