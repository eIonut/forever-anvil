#!/usr/bin/env bash
# Stages an addon release for the BigWigs packager (run by .github/workflows/addon.yml, or by hand to check):
#
#   node pipeline/addon-data.js --live     fresh price data first
#   bash tools/addon-release.sh            → build/addon-src, a throwaway git repo tagged with the version
#
# Why a throwaway repo: the packager marks an upload "release" only when it's built from a git tag (untagged =
# "alpha", which most players' addon managers hide), and it leaves out files git doesn't track (the price data
# is never committed). Staging a copy lets every data refresh be a tagged release without tagging this repo.
#
# Version: addon/VERSION plus the build time, e.g. 1.0.202611221340 (newer builds always sort higher).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/build/addon-src"
BASE="$(tr -d '[:space:]' < "$ROOT/addon/VERSION")"
VERSION="$BASE.$(date -u +%Y%m%d%H%M)"

shopt -s nullglob
DATA=("$ROOT"/addon/ForeverAnvil_Data_*/)
if [ ${#DATA[@]} -eq 0 ]; then
  echo "No price data in addon/ForeverAnvil_Data_*: run node pipeline/addon-data.js --live first" >&2
  exit 1
fi

rm -rf "$ROOT/build/addon-src"
mkdir -p "$SRC"
cp -r "$ROOT/addon/ForeverAnvil/." "$SRC/"

# when the prices are from (the data's own timestamp)
updated="$(sed -n 's/^  updated = \([0-9]*\),$/\1/p' "${DATA[0]}Data.lua" | head -1)"
prices="$(date -u -d "@${updated:-0}" '+%Y-%m-%d %H:%M UTC' 2>/dev/null || echo "this build")"

# one zip holding ForeverAnvil/ and each ForeverAnvil_Data_<REGION>/ side by side
{
  echo "package-as: ForeverAnvil"
  echo "manual-changelog:"
  echo "  filename: CHANGELOG.md"
  echo "  markup-type: markdown"
  echo "move-folders:"
  for d in "${DATA[@]}"; do
    name="$(basename "$d")"
    cp -r "$d" "$SRC/$name"
    echo "  ForeverAnvil/$name: $name"
  done
} > "$SRC/.pkgmeta"

{
  echo "# Forever Anvil $VERSION"
  echo
  echo "Auction prices from $prices. Keep the addon updated for fresh prices."
  echo
  cat "$ROOT/addon/CHANGELOG.md"
} > "$SRC/CHANGELOG.md"

git -C "$SRC" init -q
git -C "$SRC" add -A
git -C "$SRC" -c user.name="Forever Anvil" -c user.email="noreply@foreveranvil.com" commit -q -m "Forever Anvil $VERSION"
git -C "$SRC" tag "$VERSION"

echo "Staged Forever Anvil $VERSION (prices from $prices) in build/addon-src"
