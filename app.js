const elements = {
  emptyState: document.querySelector("#empty-state"),
  workspace: document.querySelector("#workspace"),
  recordingPanel: document.querySelector("#recording-panel"),
  firstRecordButton: document.querySelector("#first-record-button"),
  addLayerButton: document.querySelector("#add-layer-button"),
  stopRecordingButton: document.querySelector("#stop-recording-button"),
  playAllButton: document.querySelector("#play-all-button"),
  stopAllButton: document.querySelector("#stop-all-button"),
  metronomeButton: document.querySelector("#metronome-button"),
  bpmInput: document.querySelector("#bpm-input"),
  loopModeInput: document.querySelector("#loop-mode-input"),
  loopBarsInput: document.querySelector("#loop-bars-input"),
  countInInput: document.querySelector("#count-in-input"),
  recordingLabel: document.querySelector("#recording-label"),
  recordingTime: document.querySelector("#recording-time"),
  overdubNote: document.querySelector("#overdub-note"),
  trackList: document.querySelector("#track-list"),
  layerCount: document.querySelector("#layer-count"),
  bounceLengthInput: document.querySelector("#bounce-length-input"),
  bounceButton: document.querySelector("#bounce-button"),
  bounceSummary: document.querySelector("#bounce-summary"),
  errorMessage: document.querySelector("#error-message"),
  globalErrorSlot: document.querySelector("#global-error-slot"),
  workspaceErrorSlot: document.querySelector("#workspace-error-slot"),
  trackTemplate: document.querySelector("#track-template"),
};

const tracks = [];
let nextLayerNumber = 1;
let mediaRecorder = null;
let microphoneStream = null;
let recordedChunks = [];
let recordingStartedAt = 0;
let recordingTimer = null;
let isRecording = false;
let audioContext = null;
let currentLatencyCompensation = 0;
let metronomeEnabled = false;
let metronomeTimer = null;
let nextClickTime = 0;
let nextClickBeat = 0;
let autoStopTimer = null;
let recordingPhaseTimer = null;
let currentRecordingLoop = null;
let selectedTrackId = null;
let playheadAnimationFrame = null;
let playbackMode = null;
const metronomeNodes = new Set();

const TRANSPORT_LEAD_TIME = 0.03;
const MAX_LATENCY_COMPENSATION = 0.35;
const TIMING_STEP = 0.01;
const MAX_TIMING_ADJUSTMENT = 0.5;
const METRONOME_LOOKAHEAD = 0.1;

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function showError(message) {
  placeErrorMessage();
  elements.errorMessage.textContent = message;
  elements.errorMessage.hidden = false;
}

function placeErrorMessage() {
  const destination = tracks.length > 0 && !isRecording
    ? elements.workspaceErrorSlot
    : elements.globalErrorSlot;
  if (elements.errorMessage.parentElement !== destination) destination.append(elements.errorMessage);
}

function clearError() {
  elements.errorMessage.hidden = true;
  elements.errorMessage.textContent = "";
}

async function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio is unavailable");
  audioContext ||= new AudioContextClass({ latencyHint: "interactive" });
  if (audioContext.state === "suspended") await audioContext.resume();
  return audioContext;
}

function timingAdjustment(track) {
  return track.timingAdjustment ?? track.latencyCompensation ?? 0;
}

function stopTrackPlayback(track) {
  track.activeNodes.forEach(({ source }) => {
    source.onended = null;
    try { source.stop(); } catch { /* The source may already have ended. */ }
  });
  track.activeNodes.clear();
}

function updatePlaybackModeAfterSourceEnds() {
  if (!tracks.some((track) => track.activeNodes.size > 0)) playbackMode = null;
}

function updatePlayhead() {
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId);
  const playhead = elements.trackList.querySelector(".track-card.is-selected .waveform-playhead");
  const node = selectedTrack?.activeNodes.values().next().value;
  if (playhead && node && audioContext) {
    const elapsed = Math.max(0, audioContext.currentTime - node.scheduledStart);
    let progress;
    if (node.isLoop) {
      const phase = ((node.sourceOffset - node.loopStart) + elapsed) % node.regionDuration;
      progress = phase / node.regionDuration;
    } else {
      progress = Math.min(1, elapsed / node.regionDuration);
    }
    playhead.style.opacity = "1";
    playhead.style.transform = `translateX(${progress * playhead.parentElement.clientWidth}px)`;
  } else if (playhead) {
    playhead.style.opacity = "0";
  }

  if (tracks.some((track) => track.activeNodes.size > 0)) {
    playheadAnimationFrame = window.requestAnimationFrame(updatePlayhead);
  } else {
    playheadAnimationFrame = null;
  }
}

function startPlayheadAnimation() {
  if (playheadAnimationFrame === null) {
    playheadAnimationFrame = window.requestAnimationFrame(updatePlayhead);
  }
}

function scheduleClick(time, isDownbeat) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = isDownbeat ? 1250 : 900;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(isDownbeat ? 0.2 : 0.13, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
  oscillator.connect(gain).connect(audioContext.destination);
  const node = { oscillator, gain };
  metronomeNodes.add(node);
  oscillator.onended = () => metronomeNodes.delete(node);
  oscillator.start(time);
  oscillator.stop(time + 0.05);
}

function runMetronomeScheduler() {
  while (nextClickTime < audioContext.currentTime + METRONOME_LOOKAHEAD) {
    scheduleClick(nextClickTime, nextClickBeat % 4 === 0);
    const bpm = Math.min(240, Math.max(40, Number(elements.bpmInput.value) || 120));
    nextClickTime += 60 / bpm;
    nextClickBeat += 1;
  }
}

function startMetronome(startTime) {
  stopMetronome();
  nextClickTime = startTime;
  nextClickBeat = 0;
  runMetronomeScheduler();
  metronomeTimer = window.setInterval(runMetronomeScheduler, 25);
}

function playCountIn(startTime, beatCount, secondsPerBeat) {
  stopMetronome();
  for (let beat = 0; beat < beatCount; beat += 1) {
    scheduleClick(startTime + (beat * secondsPerBeat), beat === 0);
  }
}

function stopMetronome() {
  window.clearInterval(metronomeTimer);
  metronomeTimer = null;
  metronomeNodes.forEach(({ oscillator }) => {
    oscillator.onended = null;
    try { oscillator.stop(); } catch { /* The click may already have ended. */ }
  });
  metronomeNodes.clear();
}

function stopAllPlayback() {
  stopMetronome();
  tracks.forEach(stopTrackPlayback);
  playbackMode = null;
  window.cancelAnimationFrame(playheadAnimationFrame);
  playheadAnimationFrame = null;
  renderTracks();
}

function scheduleTrack(track, startTime, volume) {
  const adjustment = timingAdjustment(track);
  const earlyShift = Math.max(0, adjustment);
  const startDelay = Math.max(0, -adjustment);
  const loopStart = (track.loopBaseStart || 0) + earlyShift;
  const loopEnd = Math.min(loopStart + (track.loopDuration || 0), track.buffer.duration);
  const sourceOffset = track.loopEnabled ? loopStart : earlyShift;
  if (sourceOffset >= track.buffer.duration || (track.loopEnabled && loopEnd <= loopStart)) return;

  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  source.buffer = track.buffer;
  source.loop = track.loopEnabled;
  if (track.loopEnabled) {
    source.loopStart = loopStart;
    source.loopEnd = loopEnd;
  }
  gain.gain.value = track.muted ? 0 : volume;
  source.connect(gain).connect(audioContext.destination);

  const scheduledStart = startTime + startDelay;
  const node = {
    source,
    gain,
    volume,
    scheduledStart,
    sourceOffset,
    isLoop: track.loopEnabled,
    loopStart,
    regionDuration: track.loopEnabled ? loopEnd - loopStart : track.buffer.duration - sourceOffset,
  };
  track.activeNodes.add(node);
  source.onended = () => {
    track.activeNodes.delete(node);
    updatePlaybackModeAfterSourceEnds();
    renderTracks();
  };
  source.start(scheduledStart, sourceOffset);
  startPlayheadAnimation();
}

function scheduleMixAt(startTime) {
  const mixVolume = Math.min(0.82, 0.92 / Math.sqrt(Math.max(1, tracks.length)));
  tracks.forEach((track) => scheduleTrack(track, startTime, mixVolume));
}

async function startMixPlayback() {
  await ensureAudioContext();
  stopAllPlayback();
  const startTime = audioContext.currentTime + TRANSPORT_LEAD_TIME;
  scheduleMixAt(startTime);
  playbackMode = "all";
  if (metronomeEnabled) startMetronome(startTime);
  renderTracks();
}

async function playTracksFromStart() {
  clearError();
  try {
    await startMixPlayback();
  } catch {
    showError("Playback could not start. Try pressing Play all again.");
  }
}

function preferredMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecording() {
  if (isRecording) return;
  clearError();
  stopAllPlayback();

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showError("Audio recording is not supported in this browser. Open Overdub in a current version of Chrome.");
    return;
  }

  try {
    await ensureAudioContext();
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    const mimeType = preferredMimeType();
    mediaRecorder = new MediaRecorder(microphoneStream, mimeType ? { mimeType } : undefined);
    recordedChunks = [];
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", finishRecording, { once: true });
    mediaRecorder.addEventListener("error", () => {
      showError("Something went wrong while recording. Please try again.");
    }, { once: true });

    isRecording = true;
    elements.emptyState.hidden = true;
    elements.workspace.hidden = true;
    elements.recordingPanel.hidden = false;
    const bpm = Math.min(240, Math.max(40, Number(elements.bpmInput.value) || 120));
    const loopEnabled = elements.loopModeInput.checked;
    const loopBars = Number(elements.loopBarsInput.value);
    const countInBars = loopEnabled ? Number(elements.countInInput.value) : 0;
    const secondsPerBar = (60 / bpm) * 4;
    const countInDuration = countInBars * secondsPerBar;
    const loopDuration = loopBars * secondsPerBar;
    currentRecordingLoop = {
      enabled: loopEnabled,
      bars: loopBars,
      countInDuration,
      duration: loopDuration,
    };

    elements.recordingLabel.textContent = countInDuration > 0
      ? `Count-in for Layer ${nextLayerNumber}`
      : `Recording Layer ${nextLayerNumber}`;
    elements.overdubNote.hidden = tracks.length === 0;
    elements.recordingTime.textContent = "00:00";

    const reportedLatency = audioContext.outputLatency || audioContext.baseLatency || 0;
    currentLatencyCompensation = tracks.length > 0 || loopEnabled
      ? Math.min(MAX_LATENCY_COMPENSATION, Math.max(0, reportedLatency + TRANSPORT_LEAD_TIME))
      : 0;

    recordingStartedAt = performance.now();
    mediaRecorder.start();
    const countInStartTime = audioContext.currentTime + TRANSPORT_LEAD_TIME;
    const musicalStartTime = countInStartTime + countInDuration;
    if (tracks.length > 0) scheduleMixAt(musicalStartTime);
    if (metronomeEnabled) {
      startMetronome(countInStartTime);
    } else if (countInDuration > 0) {
      playCountIn(countInStartTime, countInBars * 4, 60 / bpm);
    }

    if (countInDuration > 0) {
      recordingPhaseTimer = window.setTimeout(() => {
        elements.recordingLabel.textContent = `Recording Layer ${nextLayerNumber}`;
      }, (countInDuration + TRANSPORT_LEAD_TIME) * 1000);
    }

    if (loopEnabled) {
      autoStopTimer = window.setTimeout(
        () => {
          stopAllPlayback();
          elements.recordingLabel.textContent = "Finishing loop…";
          autoStopTimer = window.setTimeout(stopRecording, (MAX_TIMING_ADJUSTMENT + 0.08) * 1000);
        },
        (TRANSPORT_LEAD_TIME + countInDuration + loopDuration) * 1000,
      );
    }

    recordingTimer = window.setInterval(() => {
      const timeSinceStart = (performance.now() - recordingStartedAt) / 1000;
      const elapsed = Math.max(0, timeSinceStart - countInDuration - TRANSPORT_LEAD_TIME);
      if (timeSinceStart < countInDuration + TRANSPORT_LEAD_TIME) {
        const beatsRemaining = Math.max(1, Math.ceil((countInDuration + TRANSPORT_LEAD_TIME - timeSinceStart) / (60 / bpm)));
        elements.recordingLabel.textContent = `Count-in · ${beatsRemaining}`;
      }
      elements.recordingTime.textContent = formatTime(elapsed);
    }, 200);
  } catch (error) {
    stopMicrophone();
    isRecording = false;
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
    showError(denied
      ? "Microphone access was blocked. Allow microphone access for this page in Chrome, then try again."
      : "Overdub could not start audio. Check your microphone and try again.");
    updateView();
  }
}

function stopRecording() {
  if (!isRecording || mediaRecorder?.state === "inactive") return;
  elements.stopRecordingButton.disabled = true;
  window.clearInterval(recordingTimer);
  window.clearTimeout(autoStopTimer);
  window.clearTimeout(recordingPhaseTimer);
  autoStopTimer = null;
  recordingPhaseTimer = null;
  stopAllPlayback();
  mediaRecorder.stop();
}

function stopMicrophone() {
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
}

async function finishRecording() {
  const measuredDuration = (performance.now() - recordingStartedAt) / 1000;
  const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
  let addedTrack = null;
  stopMicrophone();
  isRecording = false;
  elements.stopRecordingButton.disabled = false;

  if (blob.size > 0) {
    try {
      await ensureAudioContext();
      const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
      const requiredLoopAudio = (currentRecordingLoop?.countInDuration || 0)
        + currentLatencyCompensation
        + (currentRecordingLoop?.duration || 0);
      if (currentRecordingLoop?.enabled && buffer.duration < requiredLoopAudio) {
        showError("The loop was stopped before its final beat, so it was not added.");
      } else {
        const layerNumber = nextLayerNumber++;
        addedTrack = {
          id: crypto.randomUUID?.() || `${Date.now()}-${layerNumber}`,
          name: `Layer ${layerNumber}`,
          duration: Number.isFinite(buffer.duration) ? buffer.duration : measuredDuration,
          latencyCompensation: currentLatencyCompensation,
          timingAdjustment: currentLatencyCompensation,
          muted: false,
          loopEnabled: currentRecordingLoop?.enabled || false,
          loopBars: currentRecordingLoop?.bars || 0,
          loopBaseStart: currentRecordingLoop?.countInDuration || 0,
          loopDuration: currentRecordingLoop?.duration || 0,
          blob,
          buffer,
          activeNodes: new Set(),
        };
        tracks.push(addedTrack);
        selectedTrackId = addedTrack.id;
      }
    } catch {
      showError("The recording was captured but Chrome could not decode it. Please try again.");
    }
  } else {
    showError("No audio was captured. Please try recording again.");
  }

  recordedChunks = [];
  mediaRecorder = null;
  currentRecordingLoop = null;
  updateView();
  if (addedTrack?.loopEnabled) await startMixPlayback();
}

async function toggleTrackPlayback(track) {
  if (playbackMode === "all") return;
  selectedTrackId = track.id;
  if (track.activeNodes.size > 0) {
    stopTrackPlayback(track);
    playbackMode = null;
    renderTracks();
    return;
  }
  try {
    await ensureAudioContext();
    stopAllPlayback();
    const startTime = audioContext.currentTime + TRANSPORT_LEAD_TIME;
    scheduleTrack(track, startTime, 1);
    playbackMode = "individual";
    if (metronomeEnabled) startMetronome(startTime);
    renderTracks();
  } catch {
    showError("This layer could not be played.");
  }
}

function adjustTrackTiming(track, delta) {
  stopAllPlayback();
  track.timingAdjustment = Math.max(
    -MAX_TIMING_ADJUSTMENT,
    Math.min(MAX_TIMING_ADJUSTMENT, timingAdjustment(track) + delta),
  );
  renderTracks();
}

function formatTimingAdjustment(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  if (milliseconds === 0) return "On time";
  const signedValue = milliseconds > 0 ? `−${milliseconds}` : `+${Math.abs(milliseconds)}`;
  return `${signedValue} ms ${milliseconds > 0 ? "early" : "late"}`;
}

function deleteTrack(track) {
  stopTrackPlayback(track);
  tracks.splice(tracks.indexOf(track), 1);
  if (selectedTrackId === track.id) selectedTrackId = tracks.at(-1)?.id || null;
  updateView();
}

function drawWaveform(canvas, track) {
  const cssWidth = canvas.getBoundingClientRect().width;
  const cssHeight = canvas.getBoundingClientRect().height;
  if (cssWidth <= 0 || cssHeight <= 0) return;

  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * pixelRatio);
  canvas.height = Math.round(cssHeight * pixelRatio);
  const context = canvas.getContext("2d");
  context.scale(pixelRatio, pixelRatio);

  const sampleRate = track.buffer.sampleRate;
  const earlyShift = Math.max(0, timingAdjustment(track));
  const regionStart = track.loopEnabled ? (track.loopBaseStart || 0) + earlyShift : earlyShift;
  const regionEnd = track.loopEnabled
    ? Math.min(regionStart + track.loopDuration, track.buffer.duration)
    : track.buffer.duration;
  const startSample = Math.max(0, Math.floor(regionStart * sampleRate));
  const endSample = Math.min(track.buffer.length, Math.ceil(regionEnd * sampleRate));
  const barCount = Math.max(48, Math.min(180, Math.floor(cssWidth / 3)));
  const samplesPerBar = Math.max(1, Math.floor((endSample - startSample) / barCount));
  const peaks = [];

  for (let bar = 0; bar < barCount; bar += 1) {
    const from = startSample + (bar * samplesPerBar);
    const to = Math.min(endSample, from + samplesPerBar);
    let peak = 0;
    for (let channel = 0; channel < track.buffer.numberOfChannels; channel += 1) {
      const samples = track.buffer.getChannelData(channel);
      const stride = Math.max(1, Math.floor((to - from) / 80));
      for (let sample = from; sample < to; sample += stride) {
        peak = Math.max(peak, Math.abs(samples[sample] || 0));
      }
    }
    peaks.push(peak);
  }

  const highestPeak = Math.max(0.01, ...peaks);
  const center = cssHeight / 2;
  const spacing = cssWidth / barCount;
  context.fillStyle = track.muted ? "rgba(147, 153, 138, 0.38)" : "rgba(234, 255, 56, 0.78)";
  peaks.forEach((peak, index) => {
    const height = Math.max(2, (peak / highestPeak) * (cssHeight * 0.78));
    context.fillRect((index * spacing) + 0.5, center - (height / 2), Math.max(1, spacing - 1.5), height);
  });
}

function currentBpm() {
  return Math.min(240, Math.max(40, Number(elements.bpmInput.value) || 120));
}

function freeformTrackEnd(track) {
  const adjustment = timingAdjustment(track);
  return Math.max(0, track.buffer.duration - Math.max(0, adjustment) + Math.max(0, -adjustment));
}

function bounceDuration() {
  const audibleTracks = tracks.filter((track) => !track.muted);
  if (audibleTracks.length === 0) return 0;
  const secondsPerBar = (60 / currentBpm()) * 4;
  const selectedBars = Number(elements.bounceLengthInput.value);
  if (Number.isFinite(selectedBars)) return selectedBars * secondsPerBar;

  const loopDuration = Math.max(0, ...audibleTracks.filter((track) => track.loopEnabled).map((track) => track.loopDuration));
  const freeformDuration = Math.max(0, ...audibleTracks.filter((track) => !track.loopEnabled).map(freeformTrackEnd));
  if (loopDuration > 0 && freeformDuration > 0) {
    return Math.ceil(Math.max(loopDuration, freeformDuration) / secondsPerBar) * secondsPerBar;
  }
  return Math.max(loopDuration, freeformDuration);
}

function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const dataSize = buffer.length * channels * bytesPerSample;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let sample = 0; sample < buffer.length; sample += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = Math.max(-1, Math.min(1, channelData[channel][sample]));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([wav], { type: "audio/wav" });
}

async function downloadBounce() {
  const audibleTracks = tracks.filter((track) => !track.muted);
  const duration = bounceDuration();
  if (audibleTracks.length === 0 || duration <= 0) {
    showError("Unmute at least one layer before downloading a mix.");
    return;
  }

  clearError();
  stopAllPlayback();
  elements.bounceButton.disabled = true;
  elements.bounceButton.textContent = "Bouncing…";
  try {
    const sampleRate = 44100;
    const frameCount = Math.ceil(duration * sampleRate);
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offlineContext = new OfflineContext(2, frameCount, sampleRate);
    const masterGain = offlineContext.createGain();
    const fadeDuration = Math.min(0.02, duration / 2);
    masterGain.gain.setValueAtTime(1, 0);
    masterGain.gain.setValueAtTime(1, Math.max(0, duration - fadeDuration));
    masterGain.gain.linearRampToValueAtTime(0, duration);
    masterGain.connect(offlineContext.destination);

    const mixVolume = Math.min(0.82, 0.92 / Math.sqrt(audibleTracks.length));
    audibleTracks.forEach((track) => {
      const adjustment = timingAdjustment(track);
      const earlyShift = Math.max(0, adjustment);
      const startDelay = Math.max(0, -adjustment);
      const source = offlineContext.createBufferSource();
      const gain = offlineContext.createGain();
      source.buffer = track.buffer;
      gain.gain.value = mixVolume;
      source.connect(gain).connect(masterGain);

      if (track.loopEnabled) {
        const loopStart = (track.loopBaseStart || 0) + earlyShift;
        const loopEnd = Math.min(loopStart + track.loopDuration, track.buffer.duration);
        if (loopEnd <= loopStart || startDelay >= duration) return;
        source.loop = true;
        source.loopStart = loopStart;
        source.loopEnd = loopEnd;
        source.start(startDelay, loopStart);
        source.stop(duration);
      } else {
        if (earlyShift >= track.buffer.duration || startDelay >= duration) return;
        source.start(startDelay, earlyShift);
      }
    });

    const renderedBuffer = await offlineContext.startRendering();
    const url = URL.createObjectURL(encodeWav(renderedBuffer));
    const link = document.createElement("a");
    link.href = url;
    link.download = `overdub-mix-${new Date().toISOString().slice(0, 10)}.wav`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    showError("The WAV mix could not be created. Please try again.");
  } finally {
    elements.bounceButton.disabled = false;
    elements.bounceButton.textContent = "Download WAV";
  }
}

function updateBounceSummary() {
  const duration = bounceDuration();
  const isAuto = elements.bounceLengthInput.value === "auto";
  elements.bounceSummary.textContent = duration > 0
    ? `${isAuto ? "Auto" : "Selected"} length · ${formatTime(duration)}`
    : "Unmute a layer to create a mix.";
  elements.bounceButton.disabled = duration <= 0;
}

function renderTracks() {
  elements.trackList.replaceChildren();
  tracks.forEach((track, index) => {
    const card = elements.trackTemplate.content.firstElementChild.cloneNode(true);
    card.classList.toggle("is-muted", track.muted);
    card.classList.toggle("is-selected", selectedTrackId === track.id);
    card.querySelector("h3").textContent = track.name;
    card.querySelector(".track-duration").textContent = track.loopEnabled
      ? `${track.loopBars} ${track.loopBars === 1 ? "bar" : "bars"} · ${formatTime(track.loopDuration)} loop`
      : formatTime(track.duration);

    const playButton = card.querySelector(".track-play");
    const muteButton = card.querySelector(".track-mute");
    const deleteButton = card.querySelector(".track-delete");
    const earlierButton = card.querySelector(".track-earlier");
    const laterButton = card.querySelector(".track-later");
    const timingValue = card.querySelector(".timing-value");
    const isPlaying = track.activeNodes.size > 0;
    const individualPlayDisabled = playbackMode === "all";
    const isIndividualPlayback = isPlaying && playbackMode === "individual";

    playButton.querySelector("span").textContent = isIndividualPlayback ? "■" : "▶";
    playButton.disabled = individualPlayDisabled;
    playButton.setAttribute(
      "aria-label",
      individualPlayDisabled ? `${track.name} playback unavailable during Play all` : `${isIndividualPlayback ? "Stop" : "Play"} ${track.name}`,
    );
    muteButton.classList.toggle("is-active", track.muted);
    muteButton.querySelector("span").textContent = track.muted ? "×" : "◖";
    muteButton.setAttribute("aria-label", `${track.muted ? "Unmute" : "Mute"} ${track.name}`);
    deleteButton.setAttribute("aria-label", `Delete ${track.name}`);
    timingValue.textContent = formatTimingAdjustment(timingAdjustment(track));
    earlierButton.setAttribute("aria-label", `Move ${track.name} 10 milliseconds earlier`);
    laterButton.setAttribute("aria-label", `Move ${track.name} 10 milliseconds later`);
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, select, label")) return;
      selectedTrackId = selectedTrackId === track.id ? null : track.id;
      renderTracks();
    });

    playButton.addEventListener("click", () => toggleTrackPlayback(track));
    muteButton.addEventListener("click", () => {
      selectedTrackId = track.id;
      track.muted = !track.muted;
      track.activeNodes.forEach(({ gain, volume }) => {
        gain.gain.setValueAtTime(track.muted ? 0 : volume, audioContext.currentTime);
      });
      renderTracks();
    });
    deleteButton.addEventListener("click", () => deleteTrack(track));
    earlierButton.addEventListener("click", () => adjustTrackTiming(track, TIMING_STEP));
    laterButton.addEventListener("click", () => adjustTrackTiming(track, -TIMING_STEP));
    elements.trackList.append(card);
    if (selectedTrackId === track.id) drawWaveform(card.querySelector(".track-waveform"), track);
  });

  elements.layerCount.textContent = `${tracks.length} ${tracks.length === 1 ? "layer" : "layers"}`;
  updateBounceSummary();
}

function updateView() {
  elements.recordingPanel.hidden = !isRecording;
  elements.emptyState.hidden = isRecording || tracks.length > 0;
  elements.workspace.hidden = isRecording || tracks.length === 0;
  const tempoIsLocked = tracks.some((track) => track.loopEnabled);
  elements.bpmInput.disabled = isRecording || tempoIsLocked;
  elements.bpmInput.title = tempoIsLocked ? "Delete loop layers to change the project tempo." : "";
  elements.loopModeInput.disabled = isRecording;
  elements.loopBarsInput.disabled = isRecording || !elements.loopModeInput.checked;
  elements.countInInput.disabled = isRecording || !elements.loopModeInput.checked;
  placeErrorMessage();
  renderTracks();
}

elements.firstRecordButton.addEventListener("click", startRecording);
elements.addLayerButton.addEventListener("click", startRecording);
elements.stopRecordingButton.addEventListener("click", stopRecording);
elements.playAllButton.addEventListener("click", playTracksFromStart);
elements.stopAllButton.addEventListener("click", stopAllPlayback);
elements.bounceButton.addEventListener("click", downloadBounce);
elements.bounceLengthInput.addEventListener("change", updateBounceSummary);
elements.metronomeButton.addEventListener("click", async () => {
  metronomeEnabled = !metronomeEnabled;
  elements.metronomeButton.setAttribute("aria-pressed", String(metronomeEnabled));
  elements.metronomeButton.textContent = `Metronome ${metronomeEnabled ? "on" : "off"}`;
  elements.countInInput.disabled = isRecording || !elements.loopModeInput.checked;
  if (!metronomeEnabled) {
    stopMetronome();
    return;
  }
  try {
    await ensureAudioContext();
    startMetronome(audioContext.currentTime + TRANSPORT_LEAD_TIME);
  } catch {
    metronomeEnabled = false;
    elements.metronomeButton.setAttribute("aria-pressed", "false");
    elements.metronomeButton.textContent = "Metronome off";
    showError("The metronome could not start.");
  }
});
elements.bpmInput.addEventListener("change", () => {
  const bpm = Math.min(240, Math.max(40, Number(elements.bpmInput.value) || 120));
  elements.bpmInput.value = String(Math.round(bpm));
  if (metronomeTimer !== null) startMetronome(audioContext.currentTime + TRANSPORT_LEAD_TIME);
});
elements.loopModeInput.addEventListener("change", () => {
  elements.loopBarsInput.disabled = !elements.loopModeInput.checked;
  elements.countInInput.disabled = !elements.loopModeInput.checked;
});

window.addEventListener("beforeunload", () => {
  stopMicrophone();
  stopAllPlayback();
  audioContext?.close();
});
window.addEventListener("resize", renderTracks);

updateView();
