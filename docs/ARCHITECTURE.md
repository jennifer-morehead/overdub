# System architecture

## Overview

Overdub is a single-page, client-only web application. It has no framework, build pipeline, API server, database, authentication layer, analytics service, or cloud media storage.

| Layer | Implementation | Responsibility |
| --- | --- | --- |
| Structure | `index.html` | Controls, semantic regions, track template, and accessibility labels |
| Presentation | `style.css` | Responsive layout, component states, waveform container, and visual system |
| Application | `app.js` | Capture, transport, scheduling, state, rendering, mixing, and WAV encoding |
| Hosting | Vercel | Static asset delivery, HTTPS, production, and preview deployments |
| Runtime | Browser APIs | Microphone access, encoded capture, audio decoding/playback, and offline rendering |

## Runtime data flow

```text
Microphone
    |
    v
getUserMedia() -> MediaStream -> MediaRecorder -> encoded Blob
                                                   |
                                                   v
                                      AudioContext.decodeAudioData()
                                                   |
                                                   v
                              in-memory track + decoded AudioBuffer
                                      |                    |
                                      v                    v
                             live Web Audio mix     waveform rendering
                                      |
                                      v
                           OfflineAudioContext render
                                      |
                                      v
                              16-bit stereo WAV download
```

All project state lives in the `tracks` array and related module-level variables. Refreshing or closing the page destroys this state.

## Audio capture

The app requests microphone access with browser audio processing disabled so it can preserve musical dynamics rather than optimize for speech:

- Echo cancellation: off
- Noise suppression: off
- Automatic gain control: off
- Preferred sample rate: 48 kHz
- Preferred sample size: 16-bit
- Preferred channel count: mono
- Requested encoded bitrate: 192 kbps

These are browser constraints and preferences, not guarantees. The browser and physical device retain final control of the microphone format and routing.

The recorder negotiates formats in this order:

1. Opus in WebM
2. AAC-LC in MP4
3. Generic WebM
4. Generic MP4
5. Browser default

If a browser rejects the requested bitrate options, the app retries with a simpler recorder configuration.

## Track model

Each in-memory track contains:

- A unique identifier and display name.
- The original encoded recording `Blob`.
- A decoded `AudioBuffer` for playback and rendering.
- Duration, mute state, and active playback nodes.
- Latency/timing adjustment values.
- Loop configuration: enabled state, bar count, base start, and duration.

The original blob is retained for the life of the project, but only the mixed WAV is currently exposed for download.

## Timing and transport

Playback is scheduled against `AudioContext.currentTime`, with a short 30 ms lead time. Metronome clicks are generated using oscillators and gain envelopes, then scheduled 100 ms ahead by a 25 ms JavaScript timer. Visual beats use the same scheduled audio timestamps, keeping the audio clock authoritative while presenting synchronized UI feedback.

For overdubs and loops, the app combines browser-reported output latency with the transport lead time, capped at 350 ms. Users can then move individual tracks earlier or later in 10 ms increments, up to 500 ms in either direction.

Loop duration is derived from BPM, four beats per bar, and the selected bar count. The app records count-in time as part of the source recording and excludes it using the loop start offset during playback and export.

## Playback and mixing

Each track uses an `AudioBufferSourceNode` connected through an individual `GainNode`. Tracks are synchronized to a shared scheduled start time. Looping uses native buffer-source loop points.

The mix reduces per-track gain as the layer count grows:

```text
min(0.82, 0.92 / sqrt(number of tracks))
```

This lowers clipping risk but is not a mastering limiter. Highly correlated or loud recordings can still overload the summed signal.

## WAV export

Export is performed entirely in the browser:

1. Determine the mix duration from the selected bar count or longest audible material.
2. Create a two-channel `OfflineAudioContext` at 44.1 kHz.
3. Schedule audible layers using their loop and timing settings.
4. Apply a short ending fade.
5. Render the mix faster than real time.
6. Encode the rendered samples as interleaved 16-bit PCM in a RIFF/WAV container.
7. Trigger a local browser download.

No recorded audio is uploaded to Vercel or another service.

## UI state and error handling

The interface has three primary states: empty, recording, and workspace. The DOM is rendered from in-memory state after meaningful transitions. Errors are placed near the currently relevant region and cover permission denial, unsupported recording, capture/decode failure, early loop termination, playback failure, and export failure.

## Security and privacy

- Microphone access requires an explicit browser permission grant.
- Vercel provides HTTPS, required by browsers for microphone access outside localhost.
- Audio remains local to the browser and is not transmitted by application code.
- There are no user accounts, cookies, database records, or server-side audio assets.

## Current architectural constraints

- In-memory state prevents project recovery and cross-device use.
- A single JavaScript module concentrates all application responsibilities.
- Browser-specific audio-session behavior, especially on iOS, is not normalized.
- There is no automated test suite or device compatibility matrix.
- WAV rendering can consume substantial memory for long mixes.
- Mix gain management is heuristic and does not include metering or limiting.

## Logical next steps

1. Add project persistence with IndexedDB before adding accounts or a backend.
2. Add input/output device diagnostics and a visible level meter.
3. Isolate capture, transport, track state, and export into separate modules.
4. Add a master limiter and clipping indicator.
5. Establish desktop and mobile browser test matrices.
6. Investigate iOS audio-session reset and channel-routing behavior as a dedicated mobile milestone.
