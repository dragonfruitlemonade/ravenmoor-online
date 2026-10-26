#!/usr/bin/env bash
# Downloads the CC0 source models and the Three.js renderer used by the sprite baker.
# Only needed if you want to re-bake sprites; the baked PNGs are already in assets/sprites.
set -e
cd "$(dirname "$0")/.."
mkdir -p assets-src tools/vendor
for r in KayKit-Character-Pack-Adventures-1.0 KayKit-Character-Pack-Skeletons-1.0 KayKit-Medieval-Hexagon-Pack-1.0; do
  [ -d "assets-src/$r" ] || git clone --depth 1 "https://github.com/KayKit-Game-Assets/$r" "assets-src/$r"
done
if [ ! -d tools/vendor/three ]; then
  git clone --depth 1 --filter=blob:none --sparse https://github.com/mrdoob/three.js tools/vendor/three
  (cd tools/vendor/three && git sparse-checkout set build examples/jsm/loaders examples/jsm/utils examples/jsm/libs)
fi
echo "done. now: npm i -D playwright && npx playwright install chromium && npm run bake"
