# Overdub MVP case study

## Summary

Overdub explores whether the essential value of multitrack audio sketching can be delivered in a browser without the setup and complexity of a traditional digital audio workstation. The MVP reduces the workflow to three actions: record, layer, and download.

The result is a static web application that captures microphone audio, schedules synchronized layers, supports tempo-based looping, and renders a downloadable WAV mix entirely on the user's device.

## Problem

Capturing a musical idea often has a disproportionate setup cost. Voice memo apps are fast but weak at layering and timing; full production tools are capable but require project creation, routing, and interface knowledge. The opportunity was a narrow tool that supports the moment between those extremes.

The product question was:

> Can a musician move from an empty page to a layered, downloadable audio idea with minimal setup and no account?

## Audience and job to be done

The initial audience is a musician, songwriter, or creator at a desktop or laptop who wants to capture a short idea before it disappears.

When inspiration arrives, the user wants to record one part, add complementary parts in time, and save a portable mix without opening a full production environment.

## MVP scope

The MVP deliberately includes:

- Immediate microphone recording.
- Multiple in-memory layers.
- Individual and synchronized playback.
- Tempo, metronome, count-in, and fixed-bar loops.
- Manual timing correction.
- A simple visual representation of recorded audio.
- A downloadable WAV mix.

It deliberately excludes:

- Accounts and collaboration.
- Saved or shareable projects.
- Editing within a waveform.
- Effects, panning, automation, and mastering controls.
- MIDI and imported audio.
- A mobile-first audio-routing solution.

This boundary kept the experiment focused on capture speed and layering usefulness rather than recreating a digital audio workstation.

## Product and technical decisions

### Browser-native and client-only

Using native browser APIs removed installation, account, and backend requirements. It also created a strong privacy property: microphone recordings do not leave the device through application code.

The tradeoff is that capture formats, latency reporting, and audio routing vary across browsers and hardware.

### Vanilla implementation

HTML, CSS, and JavaScript were sufficient for the MVP's state size and interaction model. Avoiding a framework reduced dependencies and deployment complexity. The cost is an increasingly large application module that should be separated if the product grows.

### Web Audio scheduling

Scheduling against the audio clock provides more reliable synchronization than coordinating HTML audio elements with JavaScript timers. A look-ahead scheduler supports metronome timing, while buffer-source loop points support repeatable regions.

### Offline WAV rendering

Rendering locally provides a common, lossless deliverable without storing user audio. A hand-built PCM encoder avoids an export dependency. The tradeoff is memory usage and a larger download than compressed formats.

### Desktop-first recommendation

The initial experience recommends a desktop or laptop with wired headphones. This is based on product testing, not merely a technical assumption: mobile output volume and routing were inconsistent, and speaker playback creates bleed during overdubbing.

## Iteration history

### V1: prove the complete workflow

V1 established the end-to-end loop: capture audio, create layers, align playback, record tempo-based loops, and download a mix. This demonstrated that a useful multitrack sketch could be built entirely with browser APIs.

### V2: improve real-world capture quality

Production testing exposed that leaving recorder quality to browser defaults could produce inconsistent results. V2 requests a higher recording bitrate, adds preferred capture characteristics, improves AAC negotiation, and retains compatibility fallbacks.

The change was validated in a separate Vercel preview deployment before merging into production. Qualitative tests covered isolated recording, overdubbing, looping, synchronized playback, and WAV export. Testing in a noisy environment still met the expected quality standard.

### Mobile finding

iPhone 13 testing identified a separate platform issue. Metronome playback was extremely quiet in the original production release, recorded audio did not reliably play in the app, and one microphone-recorded layer later played only through the right earbud. Because mobile optimization is not required for the current MVP, V2 documents this boundary and retains the desktop-first recommendation.

## Validation approach

The current validation is qualitative and workflow-based rather than instrumented analytics.

Tested scenarios include:

- A first recording in isolation.
- A second recording while monitoring existing material with earbuds.
- Playback of individual layers and the complete mix.
- Loop recording with metronome/count-in.
- Manual timing adjustment.
- WAV download and external playback.
- Recording in a noisy environment.
- Desktop and iPhone behavior comparison.

No quantitative adoption, retention, task-time, or audio-quality metrics have been collected yet. Any portfolio presentation should distinguish observed test results from future success measures.

## Outcomes

- Delivered the core record-layer-download workflow as a deployable web MVP.
- Kept audio processing and project data local to the browser.
- Established preview-to-production validation using GitHub branches and Vercel deployments.
- Improved recording consistency after production feedback.
- Identified and transparently scoped mobile audio routing as a future milestone.

## What the MVP demonstrates

- Product scoping around a narrow user job rather than feature parity with established tools.
- Practical use of browser media and Web Audio APIs.
- Audio-clock scheduling, latency compensation, loop regions, and offline rendering.
- Progressive compatibility through format negotiation and fallbacks.
- Evidence-based platform boundaries discovered through device testing.
- A release process that separates preview validation from production deployment.

## Risks and lessons

1. Browser support does not guarantee consistent audio behavior. Hardware routing and operating-system audio sessions matter as much as API availability.
2. Defaults are product decisions. Allowing browsers to choose encoding quality produced inconsistent output, so V2 made quality preferences explicit.
3. Headphones solve two different problems: they reduce acoustic bleed and can reduce monitoring latency, but wireless headphones may introduce routing and delay issues.
4. Client-only architecture protects privacy and simplifies deployment, but persistence will become the first major constraint for returning users.
5. Qualitative success is enough to validate an interaction, but future prioritization needs measurable usage and reliability data.

## Recommended next milestones

### Near term

- Add Open Graph metadata and a share image for intentional link previews.
- Add input-level metering and clipping feedback.
- Add browser/device diagnostics to error reports.
- Create a repeatable manual regression checklist.

### Product expansion

- Save and restore projects locally with IndexedDB.
- Rename layers and export isolated tracks.
- Add undo and lightweight trimming.
- Add a master limiter and mix-level meter.

### Mobile milestone

- Reproduce iOS routing failures with a formal device matrix.
- Test audio-context reset behavior after microphone capture.
- Verify mono/stereo interpretation through wired, Bluetooth, speaker, and receiver routes.
- Only revise the desktop-first positioning after playback and routing are reliable.

## Candidate success measures

If the MVP moves beyond exploratory use, track:

- Percentage of sessions that produce a first layer.
- Percentage of recording sessions that add a second layer.
- Percentage of projects that generate a WAV download.
- Time from page load to first completed recording.
- Recording, decoding, playback, and export failure rates by browser/device.
- Return usage after adding local project persistence.

These measures are proposals; the current application does not collect analytics.

