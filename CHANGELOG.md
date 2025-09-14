# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2025-09-13

### Fixed

- **CI/CD**: Fixed module auto-execution during import that caused CI test failures
- **CI/CD**: Tests now work without UniFi credentials or host access
- **CI/CD**: Removed Node.js 18.x from test matrix due to undici compatibility issues
- **Documentation**: Fixed broken logo path in README
- **GitHub Pages**: Added PNG files to repository (excluded from .gitignore for docs/)
- **GitHub Pages**: All favicons and images now load correctly
- **Security**: Added pre-push hooks for code quality enforcement
- **Developer Experience**: Modules can now be safely imported without triggering setup

### Added

- **Branding**: Logo and favicons in multiple sizes (16x16, 32x32, 180x180, 192x192, 512x512)
- **SEO**: Comprehensive Open Graph and Twitter Card metadata
- **SEO**: JSON-LD structured data for better search indexing
- **Testing**: Basic syntax validation and export verification

## [0.2.0] - 2025-09-13

### Changed

- **BREAKING**: Renamed main binary from `lawn` to `lawn-lapse` for clarity
- Consolidated all functionality into single CLI entry point (`lawn-lapse.js`)
- Integrated status checking directly into main CLI (removed separate `status.js`)
- Updated GitHub Actions to use v5 (from v4) for checkout and setup-node
- Improved npx compatibility - `npx lawn-lapse` now works correctly

### Added

- Full JSDoc documentation for all functions
- Comprehensive API documentation (API.md)
- Modern inline code comments throughout
- Smart defaults for video generation (10fps, quality 1)
- Progress indicators during snapshot fetching
- Camera model information display
- Verbose mode flag (-v, --verbose) for detailed output

### Removed

- Removed separate `setup.js` file (functionality integrated)
- Removed separate `status.js` file (functionality integrated)
- Removed `setup-daily-cron.sh` script (functionality integrated)
- Removed unnecessary npm scripts for setup and status

### Fixed

- Fixed npx execution issue where binary wasn't found
- Improved error messages for authentication failures
- Better handling of missing configuration
- Consistent file path handling across the codebase

## [0.1.0] - 2025-01-12

### Initial Public Release

This is the first public release of UniFi Protect Lawn Lapse after refactoring for open source.

### Added

- Username/password authentication using `unifi-protect` library
- Interactive setup wizard (integrated into main CLI)
- System status checker (integrated into main CLI)
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

- Interactive setup wizard (integrated into main CLI)
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

[Unreleased]: https://github.com/dweekly/lawn-lapse/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/dweekly/lawn-lapse/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dweekly/lawn-lapse/releases/tag/v0.1.0
