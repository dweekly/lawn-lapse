# Roadmap

Stack-ranked: the top item is next. Shipped work is recorded in [CHANGELOG.md](CHANGELOG.md).

## Tell someone when captures fail

A capture that cannot reach the controller exits non-zero and logs the reason, but nobody reads the cron log. A daily job that has failed for several days in a row should notify the owner (email, Pushover, or a webhook behind one small adapter interface), and `lawn status` should lead with "last successful capture: N days ago" whenever that number exceeds one capture interval. The NVR keeps only a couple of weeks of footage, so every day a failure goes unnoticed past that window is a frame lost for good.

## Prune superseded timelapse renders

Each run writes a new `timelapse_HHhMM_<first>_to_<last>.mp4` for the full range and never deletes the previous one, so a single camera's `videos/` directory grows by about 1 GB a day, almost all of it redundant. Keep the newest render per capture time (and optionally the newest N), delete the rest, and say what was removed in the run output. Also check why `full-timelapse_*` files carry an end date months behind the newest snapshot.

## Rotate the cron log

`logs/lawn-lapse.log` is appended to forever (tens of MB after a year, mostly ffmpeg progress lines). Rotate by size or age, and keep ffmpeg progress out of non-verbose runs.

## Detect a renumbered network

When login fails, report the host that was tried and, if the machine's default gateway has changed since setup, suggest it as the likely new controller address. Offer a way to change only the host without redoing camera selection.

## Upgrade major dependencies

`unifi-protect` 5.x (requires Node 22.20+ and moves to undici 8, which would also retire the `undici` entry under `overrides` in package.json) and `suncalc` 2.x. Both need a live capture test against a real controller, not only the unit suite.

## `lawn doctor`

Check Node, ffmpeg, cron, controller reachability and credentials in one command, with platform-specific fixes for whatever is missing.

## Precise capture time from the on-screen timestamp

Fetch a few seconds around the target time, read the camera's timestamp overlay with OCR, and keep the frame closest to the exact requested second. Needs per-camera opt-in, a configurable overlay region, and a fallback to the middle frame when OCR fails.

## Packaging

Evaluate a Docker image bundling Node, ffmpeg and a scheduler, so a NAS or small server can run captures without a Mac or a hand-edited crontab.

## Integration tests against a mocked controller

The unit suites cover scheduling and config; the capture loop (backfill, stop conditions, per-camera failure isolation) is exercised only by live runs. A mock of the two Protect endpoints it uses (login, video export) would cover it in CI.
