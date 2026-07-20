export const TRANSCRIPTION_SAMPLE_RATE = 16_000;
const TARGET_ACTIVE_RMS = 0.08;
const MAX_GAIN = 64;

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

export function normalizePcmForSpeech(
  samples: Float32Array,
  sampleRate: number,
) {
  if (!samples.length || sampleRate <= 0) {
    return { samples, gain: 1, activeRms: 0 };
  }

  const frameSize = Math.max(1, Math.round(sampleRate * 0.02));
  const frameRms: number[] = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(start + frameSize, samples.length);
    let sumSquares = 0;
    for (let index = start; index < end; index += 1) {
      sumSquares += samples[index] ** 2;
    }
    frameRms.push(Math.sqrt(sumSquares / Math.max(end - start, 1)));
  }

  const activeRms = percentile(frameRms, 0.95);
  if (activeRms < 0.000001) {
    return { samples, gain: 1, activeRms };
  }

  const gain = Math.min(MAX_GAIN, Math.max(0.5, TARGET_ACTIVE_RMS / activeRms));
  if (Math.abs(gain - 1) < 0.01) return { samples, gain: 1, activeRms };

  const normalized = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    normalized[index] = Math.max(-1, Math.min(1, samples[index] * gain));
  }
  return { samples: normalized, gain, activeRms };
}

export function resamplePcm(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = TRANSCRIPTION_SAMPLE_RATE,
) {
  if (
    !samples.length ||
    sourceSampleRate <= 0 ||
    targetSampleRate <= 0 ||
    sourceSampleRate === targetSampleRate
  ) {
    return new Float32Array(samples);
  }

  const outputLength = Math.max(
    1,
    Math.round(samples.length * targetSampleRate / sourceSampleRate),
  );
  const output = new Float32Array(outputLength);
  const ratio = sourceSampleRate / targetSampleRate;

  for (let index = 0; index < outputLength; index += 1) {
    const sourceStart = index * ratio;
    if (ratio <= 1) {
      const left = Math.min(samples.length - 1, Math.floor(sourceStart));
      const right = Math.min(samples.length - 1, left + 1);
      const fraction = sourceStart - left;
      output[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
      continue;
    }

    const first = Math.floor(sourceStart);
    const last = Math.min(samples.length, Math.ceil((index + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let sourceIndex = first; sourceIndex < last; sourceIndex += 1) {
      sum += samples[sourceIndex];
      count += 1;
    }
    output[index] = count ? sum / count : 0;
  }

  return output;
}

export function encodePcm16Wav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  function writeText(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(
      44 + index * bytesPerSample,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }

  return buffer;
}

export async function normalizeTranscriptionAudio(blob: Blob) {
  if (typeof window === "undefined") return blob;

  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
  const OfflineAudioContextClass =
    window.OfflineAudioContext ||
    (window as typeof window & {
      webkitOfflineAudioContext?: typeof OfflineAudioContext;
    }).webkitOfflineAudioContext;

  if (!AudioContextClass || !OfflineAudioContextClass) return blob;

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const frameCount = Math.max(
      1,
      Math.ceil(decoded.duration * TRANSCRIPTION_SAMPLE_RATE),
    );
    const offlineContext = new OfflineAudioContextClass(
      1,
      frameCount,
      TRANSCRIPTION_SAMPLE_RATE,
    );
    const source = offlineContext.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineContext.destination);
    source.start();
    const rendered = await offlineContext.startRendering();
    const normalized = normalizePcmForSpeech(
      rendered.getChannelData(0),
      rendered.sampleRate,
    );
    const wav = encodePcm16Wav(
      normalized.samples,
      rendered.sampleRate,
    );
    return new Blob([wav], { type: "audio/wav" });
  } catch {
    // The original browser recording remains a valid fallback.
    return blob;
  } finally {
    await context.close();
  }
}
