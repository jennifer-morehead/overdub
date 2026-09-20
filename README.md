# Overdub

Overdub is a browser-based audio sketchbook for quickly recording, layering, looping, and exporting musical ideas. It is designed as a lightweight MVP: no account, server, installation, or digital audio workstation setup is required.

Production: [overdub-one.vercel.app](https://overdub-one.vercel.app/)

## Current release

V2 improves browser recording quality and documents the current desktop-first support boundary. The recommended setup is a desktop or laptop with wired headphones. Mobile capture may work, but playback volume and channel routing vary by device and browser.

## Features

- Record freeform audio layers from the browser microphone.
- Record tempo-aligned loops of 1, 2, 4, or 8 bars.
- Optional one-bar count-in and synthesized metronome at 40–240 BPM.
- Layer playback, mute, deletion, and 10 ms timing adjustments.
- Automatic latency compensation using browser-reported output latency.
- Waveform visualization and playhead for the selected layer.
- Mix playback with level reduction as layers are added.
- Offline stereo rendering and 16-bit WAV download.
- Automatic mix length or a selected length of 1–32 bars.
- Responsive, accessible interface with contextual error messages.

## How it works

Overdub is a static client-side application built with HTML, CSS, and vanilla JavaScript. Browser media APIs capture encoded microphone audio, the Web Audio API decodes and schedules layers, and an offline audio context renders the downloadable mix. Recordings remain in memory in the active browser tab; the app has no backend or persistent project storage.

See [System architecture](docs/ARCHITECTURE.md) for the detailed data flow and technical decisions.

## Browser support

The primary target is a current desktop version of Chrome with wired headphones. V2 also negotiates Opus or AAC-based recording formats and includes fallbacks for older browser implementations.

Known limitations:

- Projects are lost when the page is refreshed or closed.
- Mobile audio playback, output volume, and left/right routing are not yet reliable.
- Bluetooth introduces additional latency and may change microphone routing.
- Speaker playback can bleed into new recordings; wired headphones are recommended.
- There is no undo, project save/load, individual track export, or server synchronization.

## Project documentation

- [System architecture](docs/ARCHITECTURE.md)
- [Release and patch notes](CHANGELOG.md)
- [MVP case study](docs/CASE_STUDY.md)

## Local development

No build step or dependencies are required. Serve the repository from a local HTTP server so microphone and browser media behavior can be tested in a normal page context.

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Microphone access requires user permission. Production and Vercel preview deployments use HTTPS, which satisfies the browser secure-context requirement for microphone capture.

## Deployment workflow

- `main` is the production branch deployed by Vercel.
- `preview` is used for browser and device validation in a Vercel preview environment.
- Changes are tested on `preview`, committed and pushed, then merged into `main` for release.

