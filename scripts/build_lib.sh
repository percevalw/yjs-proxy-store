#!/bin/bash
set -e

echo "Cleaning previous builds..."
rm -rf lib

echo "Compiling typescript..."
tsc --version
tsc --build tsconfig.lib.json

echo "Copying assets..."
cp -r src/lib/*.css lib

echo "Updating package.json for distribution..."
node scripts/editPackageJson.js

echo "Copying README.md and LICENSE..."
cp README.md lib/README.md
cp LICENSE lib/LICENSE

echo "Build complete!"