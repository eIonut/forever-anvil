#!/usr/bin/env bash
# Stages a Landfall release for the BigWigs packager (run by .github/workflows/landfall.yml, or by hand):
#
#   bash tools/landfall-release.sh       → build/landfall-src, a throwaway git repo tagged with the version
#
# Same idea as tools/addon-release.sh: the packager uploads a "release" (not an "alpha") only from a git tag,
# and a throwaway repo saves tagging this one. The version is landfall/VERSION as it is (no build time:
# Landfall has no data, so a release only goes out when its code changes).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/build/landfall-src"
VERSION="$(tr -d '[:space:]' < "$ROOT/landfall/VERSION")"

rm -rf "$SRC"
mkdir -p "$SRC"
cp -r "$ROOT/landfall/Landfall/." "$SRC/"

cat > "$SRC/.pkgmeta" <<'EOF'
package-as: Landfall
manual-changelog:
  filename: CHANGELOG.md
  markup-type: markdown
EOF

{
  echo "# Landfall $VERSION"
  echo
  cat "$ROOT/landfall/CHANGELOG.md"
} > "$SRC/CHANGELOG.md"

git -C "$SRC" init -q
git -C "$SRC" add -A
git -C "$SRC" -c user.name="Forever Anvil" -c user.email="noreply@foreveranvil.com" commit -q -m "Landfall $VERSION"
git -C "$SRC" tag "$VERSION"

echo "Staged Landfall $VERSION in build/landfall-src"
