#!/usr/bin/env bash
# Stages a Loot Comets release for the BigWigs packager (run by .github/workflows/lootcomets.yml, or by hand):
#
#   bash tools/lootcomets-release.sh       → build/lootcomets-src, a throwaway git repo tagged with the version
#
# Same idea as tools/addon-release.sh: the packager uploads a "release" (not an "alpha") only from a git tag,
# and a throwaway repo saves tagging this one. The version is lootcomets/VERSION as it is (no build time:
# Loot Comets has no data, so a release only goes out when its code changes).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/build/lootcomets-src"
VERSION="$(tr -d '[:space:]' < "$ROOT/lootcomets/VERSION")"

rm -rf "$SRC"
mkdir -p "$SRC"
cp -r "$ROOT/lootcomets/LootComets/." "$SRC/"

cat > "$SRC/.pkgmeta" <<'EOF'
package-as: LootComets
manual-changelog:
  filename: CHANGELOG.md
  markup-type: markdown
EOF

{
  echo "# Loot Comets $VERSION"
  echo
  cat "$ROOT/lootcomets/CHANGELOG.md"
} > "$SRC/CHANGELOG.md"

git -C "$SRC" init -q
git -C "$SRC" add -A
git -C "$SRC" -c user.name="Forever Anvil" -c user.email="noreply@foreveranvil.com" commit -q -m "Loot Comets $VERSION"
git -C "$SRC" tag "$VERSION"

echo "Staged Loot Comets $VERSION in build/lootcomets-src"
