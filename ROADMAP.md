# Lawn Lapse Enhancement Plan

## Objectives

- Expand scheduling to support multiple captures per day, hour-based limits, and sunrise/sunset windows.
- Enable per-camera snapshot pipelines so multiple timelapses can be generated in parallel.
- Improve observability with clearer logging, surfaced errors, and optional user notifications.
- Reduce external prerequisites, moving toward a self-contained distribution.

## Phase 1: Scheduling Redesign

1. **Config Schema**
   - Replace `SNAPSHOT_TIME` with a structured config (e.g. `config.json` or `.env.local` + JSON block) storing timezone, capture cadence, windowed hours, and per-camera overrides.
   - Provide migration logic that reads legacy `.env.local`, infers defaults, and writes the new schema once.
2. **Slot Generation**
   - Implement helpers that compute capture timestamps for a day given: fixed interval (shots/hour), lower/upper hour bounds, or sunrise/sunset mode.
   - Use `suncalc` (or similar) for sunrise/sunset calculations; cache by date and location to avoid repeated calls.
3. **Runtime Scheduling**
   - Refactor `fetchMissingSnapshots` to iterate over generated slots, ensuring daylight-saving transitions are handled.
   - Update cron workflow to execute the CLI more frequently (e.g. every 15 minutes) while the app decides whether work is due.

## Phase 2: Multi-Camera Support

1. **Setup Flow**
   - Extend interactive prompts to select multiple cameras; persist an array with camera metadata, output directories, and optional schedule overrides.
2. **Capture Pipeline**
   - For each scheduled run, iterate cameras sequentially: snapshot storage under `snapshots/<camera-slug>/` and video artifacts under `timelapses/<camera-slug>/`.
   - Update timelapse generation to respect per-camera FPS/quality; parallelize cautiously (limit concurrency via queue).
3. **CLI & Reporting**
   - Enhance `status` command to summarize per-camera last capture, next scheduled slot, and video path.
   - Document updated usage patterns (multi-camera directories, config fields).

## Phase 3: Notifications & Error Surfacing

1. **Logging Improvements**
   - Standardize log output to `logs/lawn-lapse.log`; add `lawn logs` command for quick inspection.
   - Emit structured error payloads (JSON) when capture or encode fails; include snapshot path and camera ID.
2. **Alerting Options**
   - Implement notification adapters (e.g. SMTP email, Pushover/Slack webhook) behind a simple interface.
   - Add notification cadence config (`never`, `daily`, `weekly`), aggregating success summary and linking latest timelapse per camera.
3. **User Feedback**
   - On errors, return non-zero exit codes, print concise summaries, and flag in notification payloads.
   - Consider optional desktop notifications when running interactively (macOS `osascript`, Linux `notify-send`).

## Phase 4: Distribution & Dependencies

1. **Environment Bootstrap**
   - Add `lawn doctor` to verify Node, ffmpeg, cron availability; provide platform-specific install instructions or automated download.
2. **Packaging**
   - Evaluate bundling with `pkg`/`nexe` or producing Docker images that include Node + ffmpeg + cron runner.
   - Document install pathways for macOS, Linux, and container-based deployment.
3. **CI & Release**
   - Update CI to build packaged artifacts; attach binaries/images to GitHub releases alongside npm publish.

## Phase 5: Testing & Documentation

- Create integration tests that mock UniFi Protect API, verifying multi-camera scheduling and sunrise/sunset slot creation.
- Expand README/API docs and `AGENTS.md` to cover new config schema, notification setup, and logging locations.
- Provide upgrade notes highlighting migration steps and new commands.

## Phase 6: Precision Timing with OCR

1. **Temporal Window Capture**
   - Fetch a few seconds of video before and after the target capture time (e.g., ±5 seconds around 12:00:00)
   - Extract frames at sub-second intervals to ensure coverage of the exact target moment
2. **OCR-Based Frame Selection**
   - Use OCR (tesseract.js or similar) to read timestamp overlays from camera frames
   - Parse timestamps and select the frame closest to the requested time (e.g., exactly "12:00:00" not "11:59:57")
   - Fall back to middle frame if OCR fails or no overlay is present
3. **Configuration Options**
   - Add `precisionTiming` config option (enabled/disabled per camera or globally)
   - Configure OCR region of interest to focus on timestamp overlay location
   - Set acceptable time deviation threshold (e.g., ±2 seconds)
4. **Performance Considerations**
   - Cache OCR engine initialization to avoid startup overhead on every capture
   - Limit temporal window size to balance precision vs. storage/processing cost
   - Document OCR dependency installation (tesseract binary)

## Open Questions

- Preferred storage for config (JSON file vs. `.env` + nested JSON).
- Which notification channels should ship first (email vs. push service).
- Acceptable runtime frequency for cron vs. background daemon requirement.

## Pull Request Breakdown

| PR  | Scope                         | Key Deliverables                                                                                                       | Tests & Validation                                                                          | Documentation                                          |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | Config schema & migration     | Introduce structured config (JSON or TOML), timezone field, cadence/window options; migrate legacy `.env.local`        | Unit tests for config loader + migration, snapshot of default config, lint                  | Update README setup, add migration notes in CHANGELOG  |
| 2   | Slot generation utilities     | Helpers for fixed intervals, hour windows, sunrise/sunset (via `suncalc`), DST-safe timestamp builder                  | Unit tests covering interval math, DST boundaries, sunrise cache                            | Document new scheduling options in README/API          |
| 3   | Runtime scheduling & cron     | Refactor capture loop to use generated slots; adjust cron installer to cadence-friendly schedule; add "due work" guard | Integration test simulating due/not-due runs; regression test for cron command string       | Update cron section & troubleshooting in docs          |
| 4   | Multi-camera configuration    | Extend setup prompts to select multiple cameras with per-camera overrides and directories                              | Unit tests for config serialization; mock prompt flow                                       | README + AGENTS multi-camera setup walkthrough         |
| 5   | Multi-camera capture pipeline | Sequential capture per camera, per-camera snapshot/timelapse directories, status summary updates                       | Integration test (mock API) verifying per-camera capture; snapshot tests for status output  | Document directory layout & status command updates     |
| 6   | Logging & error surfacing     | Central log file, `lawn logs` command, structured error payloads, non-zero exit codes                                  | CLI tests for log command, unit tests on error reporter                                     | README logging section, add FAQ entry                  |
| 7   | Notification adapters         | Pluggable notification service with SMTP + Pushover/Slack, cadence options (`never/daily/weekly`), summary payloads    | Unit tests for scheduling cadence, mock transports; integration test for daily digest build | Notification setup guide + config references           |
| 8   | Environment bootstrap         | `lawn doctor` diagnostics, platform-specific install instructions, optional dependency install hooks                   | Tests for doctor command (mock binaries), snapshot of report output                         | README prerequisites updated; new docs page for doctor |
| 9   | Packaging & release updates   | Evaluate `pkg`/Docker build pipeline, produce artifacts via CI, document install variants                              | CI pipeline tests; smoke test for packaged artifact                                         | Release notes, distribution section in README          |
| 10  | Final docs & regression tests | Consolidate docs, add integration tests for sunrise + multi-camera, ensure upgrade path documented                     | CI passing; coverage report for new tests                                                   | Final audit of README/API/ROADMAP                      |
