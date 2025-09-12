# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| 1.0.x   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do NOT Create a Public Issue

Security vulnerabilities should not be reported via public GitHub issues.

### 2. Report Privately

Please report security vulnerabilities by emailing the maintainer directly or creating a [private security advisory](https://github.com/dweekly/lawn-lapse/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### 3. Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 1 week
- **Fix Timeline**: Depends on severity
  - Critical: Within 72 hours
  - High: Within 1 week
  - Medium: Within 2 weeks
  - Low: Next release

## Security Best Practices

When using this application:

### ✅ DO:
- Store credentials in `.env.local` (never commit)
- Use a dedicated UniFi Protect account with minimal permissions
- Regularly update dependencies (`npm update`)
- Review cron job logs for suspicious activity
- Keep your UniFi Protect system updated

### ❌ DON'T:
- Commit `.env` files to git
- Share your configuration files
- Use admin accounts for automation
- Expose the application to the internet
- Store snapshots on public servers

## Known Security Considerations

1. **Credentials Storage**: Passwords are stored in plain text in `.env.local`. Ensure proper file permissions (600).

2. **Network Security**: The application disables certificate validation for self-signed UniFi certificates. Only use on trusted networks.

3. **Dependency Updates**: Enable Dependabot to stay current with security patches.

## Security Features

- No telemetry or external data collection
- All data stays local
- Credentials never logged
- HTTPS/TLS for all API communications
- Automated security scanning via GitHub Actions

## Disclosure Policy

After a security issue is fixed:
1. We'll publish a security advisory
2. Credit will be given to the reporter (unless anonymity is requested)
3. Details will be added to CHANGELOG.md

Thank you for helping keep this project secure!