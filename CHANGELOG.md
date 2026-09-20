# Release notes

This file records production releases and the patches included in each deploy. Dates reflect the Git commit history.

## V2 — Audio capture quality

Released September 20, 2026 in merge commit `c143bb8`.

### Added

- Preferred 48 kHz, 16-bit mono microphone capture where supported.
- Requested 192 kbps encoded recording quality.
- Explicit AAC-LC in MP4 negotiation for Safari-compatible capture.
- Graceful fallback when a browser rejects advanced recorder options.
- Desktop and wired-headphone guidance in the empty and recording states.
- Visible warning that mobile playback and channel routing may vary.

### Validated

- Freeform recording and playback.
- Multiple overdub layers with wired headphones.
- Loop recording and metronome behavior.
- Timing and synchronized mix playback.
- WAV rendering and download.
- Qualitative audio quality in a noisy environment.
- Vercel preview workflow before production merge.

### Known limitations

- iPhone 13 testing found unreliable in-app playback and output routing.
- A layer recorded with the iPhone microphone was later heard only in the right earbud.
- Mobile behavior remains outside the V2 optimization target; desktop with wired headphones is recommended.

### Included patches

- `4929476` — Improve browser audio capture quality.
- `6327925` — Document mobile audio limitations.

## V1 — Initial MVP

Released September 20, 2026 in commit `8412abc`.

### Added

- Browser microphone recording using `getUserMedia` and `MediaRecorder`.
- Layered playback using the Web Audio API.
- Per-layer play, mute, delete, selection, waveform, and timing controls.
- Tempo control from 40–240 BPM.
- Synthesized metronome.
- Fixed-length loop recording with an optional count-in.
- Automatic browser-reported latency compensation.
- Automatic or bar-selected offline mix rendering.
- Client-side 16-bit WAV encoding and download.
- Responsive dark interface and contextual errors.

### Known limitations at release

- Browser-selected recording bitrate and format quality.
- Desktop-centric audio workflow.
- No persistent projects or backend.
- Wired headphones required for reliable overdubbing without speaker bleed.

## Project initialization

Created September 19, 2026 in commit `8a20668` with the initial static application files.

