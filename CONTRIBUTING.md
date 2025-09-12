# Contributing to UniFi Protect Lawn Lapse

Thank you for your interest in contributing to this project! This guide will help you get started.

## Code of Conduct

Be respectful and constructive in all interactions. We're all here to build something useful together.

## How to Contribute

### Reporting Issues

1. **Check existing issues** first to avoid duplicates
2. **Include details**:
   - UniFi Protect version
   - Node.js version
   - Error messages and logs
   - Steps to reproduce

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the use case and benefits
3. Consider how it fits with the project's goals

### Submitting Pull Requests

1. **Fork the repository** and create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Follow the existing code style
   - Add/update tests if applicable
   - Update documentation

3. **Test your changes**:
   ```bash
   npm run capture  # Test capture functionality
   npm run status   # Check system status
   ```

4. **Format and lint**:
   ```bash
   npx prettier --write "*.js"
   npx eslint "*.js" --fix
   ```

5. **Commit with a clear message**:
   ```bash
   git commit -m "Add feature: description of what you added"
   ```

6. **Push and create a PR**:
   - Describe what changes you made
   - Explain why they're needed
   - Reference any related issues

## Development Setup

1. Clone your fork:
   ```bash
   git clone https://github.com/your-username/lawn-lapse.git
   cd lawn-lapse
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and configure

4. Run setup:
   ```bash
   node setup.js
   ```

## Code Guidelines

### JavaScript Style

- Use ES6+ features (async/await, arrow functions, etc.)
- Use single quotes for strings
- Max line width: 100 characters
- Use meaningful variable names

### Git Commits

- Use present tense ("Add feature" not "Added feature")
- Keep first line under 50 characters
- Reference issues when relevant (#123)

### Testing

Before submitting:
- Verify capture works with your UniFi Protect setup
- Check that timelapse generation completes
- Ensure no credentials are hardcoded

## Security

**NEVER** commit:
- Passwords or usernames
- API tokens or cookies
- IP addresses or hostnames
- Any `.env` files

If you accidentally commit sensitive data:
1. Remove it immediately
2. Force push the cleaned history
3. Rotate any exposed credentials

## Questions?

Feel free to open an issue for:
- Clarification on code
- Help with development setup
- Discussion about features

Thank you for contributing! 🎥