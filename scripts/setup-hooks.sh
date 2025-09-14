#!/bin/bash

# Setup git hooks for the project

HOOK_DIR=".git/hooks"
SCRIPT_DIR="scripts"

echo "Setting up git hooks..."

# Create pre-push hook
cat > "$HOOK_DIR/pre-push" << 'EOF'
#!/bin/sh
# Pre-push hook to run linting before pushing

echo "Running pre-push checks..."

# Run ESLint
echo "Checking code with ESLint..."
npx eslint *.js --max-warnings 0
if [ $? -ne 0 ]; then
    echo "❌ ESLint check failed. Please fix errors before pushing."
    exit 1
fi

# Run Prettier
echo "Checking formatting with Prettier..."
npx prettier --check "*.js" "*.json" "*.md"
if [ $? -ne 0 ]; then
    echo "❌ Prettier check failed. Run 'npm run format' to fix formatting."
    exit 1
fi

echo "✅ All pre-push checks passed!"
exit 0
EOF

chmod +x "$HOOK_DIR/pre-push"

echo "✅ Git hooks installed successfully!"
echo "The pre-push hook will run linting checks before each push."