# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.2] - 2025-12-19

### Added

- **Expanded Test Suite**: Increased test coverage from 78% to 90% with 65 new tests
  - Full coverage for scheduling.js (95%) - all scheduling modes tested
  - Full coverage for config.js (96%) - migration, defaults, and snapshot handling
  - Coverage for geolocation.js - location formatting and validation

### Changed

- **Dependencies**: Updated @inquirer/prompts to 8.1.0 (major version upgrade)

### Technical

- 77 total tests covering scheduling, config, auth, and geolocation modules
- Test coverage: 90% lines, 89% branches, 97% functions

## [0.4.1] - 2025-12-19

### Added

- **Version Command**: New `lawn version` / `--version` / `-V` flag to display current version
- **npm Metadata**: Added license, author, repository, homepage, bugs, and keywords to package.json

### Changed

- **Smaller Package**: Reduced npm package size from 8.1MB to 31.7KB by adding files whitelist
- **Dependencies**: Updated @inquirer/prompts to 7.10.1 and unifi-protect to 4.27.5

## [0.4.0] - 2025-12-09

### Added

- **Legacy Snapshot Migration**: Automatically detects and migrates snapshots from old single-camera `./snapshots/` directory to new per-camera structure during upgrades
- **Smart Video Caching**: Per-day video segments are cached and only regenerated when source snapshots change
- **Video Concatenation**: Full timelapse assembled by concatenating cached daily videos for faster regeneration
- **Standalone Video Generator**: New `generate-videos-only.js` script for regenerating videos without capturing new snapshots

### Fixed

- **Timezone Bug**: Snapshot filenames now correctly use local timezone instead of UTC
- **Timezone Bug**: Error messages now display dates in local timezone for consistency

### Technical

- Migration prompts user to select target camera when multiple cameras are configured
- Daily video cache invalidation based on snapshot modification times
- ESLint fixes for unused variables in catch blocks

## [0.3.0] - 2025-11-07

### Added

- **Motion Interpolation**: Smooth frame interpolation using ffmpeg's minterpolate filter for cinematic quality
- **Configurable Interpolation**: New `interpolate` setting in video config (enabled by default)
- **Multi-Camera Support**: Select and configure multiple cameras during setup
- **Per-Camera Directories**: Each camera gets isolated `snapshots/<camera-slug>/` and `timelapses/<camera-slug>/` directories
- **Per-Camera Processing**: Sequential capture and timelapse generation for all configured cameras
- **Camera Slugs**: Auto-generated URL-safe slugs from camera names for directory structure
- **Enhanced Status Command**: Per-camera statistics and aggregated summary across all cameras
- **Advanced Scheduling**: Three scheduling modes (fixed-time, interval, sunrise-sunset) with timezone support
- **Sunrise/Sunset Support**: Capture based on sun position with automatic location detection
- **Location Detection**: Auto-detect coordinates via IP geolocation with manual fallback
- **Schedule Validation**: Runtime validation of schedule configuration with helpful error messages
- **Testing**: Node test coverage for configuration defaults and legacy migration
- **Project Instructions**: Added CLAUDE.md with comprehensive guidance for Claude Code assistant

### Changed

- **Default FPS**: Increased from 10fps to 24fps for smoother, more cinematic playback
- **Video Quality**: Enhanced with motion interpolation between frames for fluid motion (18% better compression)
- **Configuration**: Settings now live in `lawn.config.json` with automatic migration from legacy `.env.local`
- **Configuration Schema**: Upgraded to version 2 with cameras array supporting multiple camera configs
- **Backfill**: Snapshot backfill walks backwards until UniFi returns no data instead of assuming 39-day limit
- **Setup Flow**: Interactive camera selection with "Add another camera?" workflow
- **Capture Pipeline**: Processes all cameras sequentially with per-camera error handling and success tracking
- **Exit Codes**: Returns non-zero if any camera fails, enabling CI/monitoring alerts
- **Cron Jobs**: Adjusted for schedule modes - every 15 min check for interval/sunrise-sunset modes

### Technical

- Motion interpolation uses mci mode with aobmc and bidirectional motion estimation
- Interpolated 24fps videos are smaller than 10fps originals despite 2.4x more frames
- Config system supports deep merging of defaults with per-camera overrides
- Scheduling system generates time slots dynamically based on mode and timezone

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

[Unreleased]: https://github.com/dweekly/lawn-lapse/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/dweekly/lawn-lapse/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/dweekly/lawn-lapse/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/dweekly/lawn-lapse/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/dweekly/lawn-lapse/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/dweekly/lawn-lapse/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dweekly/lawn-lapse/releases/tag/v0.1.0
