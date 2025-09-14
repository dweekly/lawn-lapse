# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-01-12

### Initial Public Release

This is the first public release of UniFi Protect Lawn Lapse after refactoring for open source.

### Added

- Username/password authentication using `unifi-protect` library
- Interactive setup wizard (`setup.js`)
- System status checker (`status.js`)
- Comprehensive documentation (README, CONTRIBUTING, SECURITY)
- GitHub issue and PR templates
- Dependabot configuration for automated updates
- Security policy and guidelines
- Code of Conduct

### Changed

- Migrated from hardcoded cookie authentication to environment-based credentials
- Simplified authentication flow - no browser cookie extraction needed
- Improved error handling and user feedback
- Restructured code for better maintainability

### Security

- Removed all hardcoded credentials
- Added `.gitignore` rules for sensitive files
- Implemented secure credential storage in `.env.local`

### Technical

- Updated to dotenv v17.2.2
- Node.js 18+ requirement
- ES modules support
- Clean separation of configuration and code

## [2.0.0] - 2025-09-12

### Changed

- **BREAKING**: Switched from cookie-based to username/password authentication
- **BREAKING**: Replaced multiple scripts with single `capture-and-timelapse.js`
- Migrated to `unifi-protect` npm library for robust API access
- Improved error handling and connection management
- Simplified setup process - no more browser cookie extraction

### Added

- Interactive setup wizard (`setup.js`)
- Automatic credential validation
- Support for full URL in retrieve() method
- ESLint and Prettier configuration
- CONTRIBUTING.md guide
- Proper project documentation

### Removed

- Cookie update scripts (no longer needed)
- Manual cookie extraction requirement
- 30-day authentication expiration

### Fixed

- Video export API compatibility issues
- Authentication timeout problems
- Historical snapshot retrieval

## [1.0.0] - 2025-09-11

### Initial Release

- Basic snapshot capture from UniFi Protect cameras
- Time-lapse video generation with ffmpeg
- Cookie-based authentication
- Cron job automation support
- Historical backfill up to 39 days
- Status monitoring script

### Features

- Daily automated capture at configurable times
- Permanent local snapshot archive
- Automatic time-lapse regeneration
- Gap detection in snapshot sequences
- Cookie expiration tracking

[Unreleased]: https://github.com/dweekly/lawn-lapse/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dweekly/lawn-lapse/releases/tag/v0.1.0
