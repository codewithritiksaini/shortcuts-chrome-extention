#!/usr/bin/env bash
set -e

echo "🔍 Validating extension files..."

# 1. Validate manifest.json
node -e 'JSON.parse(require("fs").readFileSync("manifest.json"))'
echo "  ✓ manifest.json is valid JSON"

# 2. Extract version
VERSION=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("manifest.json")).version)')
echo "  ✓ Extension version: v${VERSION}"

# 3. Validate JS syntax
node -c background.js
node -c content.js
node -c popup.js
if [ -f "github-sync.js" ]; then
  node -c github-sync.js
fi
echo "  ✓ All JavaScript files passed syntax check"

# 4. Prepare dist directory
mkdir -p dist
OUTPUT_ZIP="dist/shortcut-helper-v${VERSION}.zip"
rm -f "$OUTPUT_ZIP"

# 5. Create clean production zip
echo "📦 Packaging extension into $OUTPUT_ZIP..."
zip -r "$OUTPUT_ZIP" \
  manifest.json \
  background.js \
  content.js \
  popup.html \
  popup.js \
  styles.css \
  icons/ \
  LICENSE \
  $( [ -f "github-sync.js" ] && echo "github-sync.js" ) \
  -x "*.DS_Store" "*__MACOSX*"

echo "✅ Build complete! Archive created at: $OUTPUT_ZIP"
ls -lh "$OUTPUT_ZIP"
