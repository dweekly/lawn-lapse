# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/dweekly/lawn-lapse/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/dweekly/lawn-lapse/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/dweekly/lawn-lapse/releases/tag/v1.0.0