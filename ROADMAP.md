# Roadmap

Stack-ranked: the top item is next. Shipped work is recorded in [CHANGELOG.md](CHANGELOG.md).

## Tell someone when captures fail

A capture that cannot reach the controller exits non-zero and logs the reason, but nobody reads the cron log. A daily job that has failed for several days in a row should notify the owner (email, Pushover, or a webhook behind one small adapter interface), and `lawn status` should lead with "last successful capture: N days ago" whenever that number exceeds one capture interval. The NVR keeps only a couple of weeks of footage, so every day a failure goes unnoticed past that window is a frame lost for good.

Success has to mean the scheduled frame was saved. Today a run whose newest slot fails (controller timeout, "No video data received") still reports `Successful: 1/1` and exits 0, because the camera is counted as successful once its videos are built. Count missed slots per camera, report them in the summary, and exit non-zero when the most recent due slot is missing.

## Prune superseded timelapse renders

Each run writes a new `timelapse_HHhMM_<first>_to_<last>.mp4` for the full range and never deletes the previous one, so a single camera's `videos/` directory grows by about 1 GB a day, almost all of it redundant. Keep the newest render per capture time (and optionally the newest N), delete the rest, and say what was removed in the run output. Also check why `full-timelapse_*` files carry an end date months behind the newest snapshot.

## Skip rebuilding videos whose inputs have not changed

A daily run takes about 30 minutes, almost all of it re-encoding `full-timelapse_*` (about 14 GB) from per-day clips that have not changed in months, then re-rendering the full noon timelapse even when no new snapshot arrived. Rebuild a video only when its input list (file names and modification times) differs from the one it was built from, recorded beside the output. That should bring a normal run down to a couple of minutes.

## Rotate the cron log

`logs/lawn-lapse.log` is appended to forever (tens of MB after a year, mostly ffmpeg progress lines). Rotate by size or age, and keep ffmpeg progress out of non-verbose runs.

## Detect a renumbered network

When login fails, report the host that was tried and, if the machine's default gateway has changed since setup, suggest it as the likely new controller address. Offer a way to change only the host without redoing camera selection.

## Keep sunrise-mode snapshots stable across library updates

Sunrise and sunset slots are named by their computed HHMM, so any change in the sun calculation renames them. The suncalc 2 upgrade moved them by up to three minutes, which makes backfill fetch a second frame for every past day still on the NVR. Match an existing snapshot from the same day within a few minutes of the slot before fetching.

## Don't report an empty video as created

With only two snapshots, timelapse generation writes a 261-byte MP4 with no frames and still prints "Time-lapse created" (seen on main and after the unifi-protect 5 port). Check the frame count or output size and say there are too few snapshots instead.

## Faster end of history

The controller answers 404 for a time with no recording, and unifi-protect retries that status five times before giving up, so each slot past the end of retention costs about 3.5 seconds. Backfill stops after three, so this is about 10 seconds a run.

## `lawn doctor`

Check Node, ffmpeg, cron, controller reachability and credentials in one command, with platform-specific fixes for whatever is missing.

## Precise capture time from the on-screen timestamp

Fetch a few seconds around the target time, read the camera's timestamp overlay with OCR, and keep the frame closest to the exact requested second. Needs per-camera opt-in, a configurable overlay region, and a fallback to the middle frame when OCR fails.

## Packaging

Evaluate a Docker image bundling Node, ffmpeg and a scheduler, so a NAS or small server can run captures without a Mac or a hand-edited crontab.

## Integration tests against a mocked controller

The unit suites cover scheduling and config; the capture loop (backfill, stop conditions, per-camera failure isolation) is exercised only by live runs. A mock of the two Protect endpoints it uses (login, video export) would cover it in CI.
