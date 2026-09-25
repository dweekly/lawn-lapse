#!/bin/sh
# Installs a pre-push hook that runs the same checks as CI (lint, format, tests).
# Runs from npm's "prepare" script, which fires on a local `npm install` in a
# clone but not when lawn-lapse is installed from the registry as a package.

# Not a git checkout (e.g. an unpacked tarball): nothing to install.
HOOK_DIR=$(git rev-parse --git-path hooks 2>/dev/null) || exit 0

mkdir -p "$HOOK_DIR"
cat > "$HOOK_DIR/pre-push" << 'HOOK'
#!/bin/sh
# Pre-push hook installed by scripts/setup-hooks.sh: mirrors the CI checks.
set -e
echo "Running pre-push checks (lint, format, tests)..."
npm run --silent lint:check || { echo "❌ ESLint failed. Run 'npm run lint' to autofix."; exit 1; }
npm run --silent format:check || { echo "❌ Prettier failed. Run 'npm run format' to fix."; exit 1; }
npm test --silent > /dev/null || { echo "❌ Tests failed. Run 'npm test' for details."; exit 1; }
echo "✅ All pre-push checks passed!"
HOOK

chmod +x "$HOOK_DIR/pre-push"
echo "✅ Installed pre-push hook at $HOOK_DIR/pre-push"
