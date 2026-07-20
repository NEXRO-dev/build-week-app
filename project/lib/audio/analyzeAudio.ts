import type { AudioMeta } from "@/types/echly";

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

export function analyzePcmChannels(
  channels: Float32Array[],
  sampleRate: number,
) {
  const sampleCount = Math.max(0, ...channels.map((channel) => channel.length));
  if (!channels.length || !sampleCount || sampleRate <= 0) {
    return { averageVolume: null, silenceRatio: null };
  }

  const frameSize = Math.max(1, Math.round(sampleRate * 0.02));
  const frameRms: number[] = [];

  for (let start = 0; start < sampleCount; start += frameSize) {
    const end = Math.min(start + frameSize, sampleCount);
    let strongestChannelRms = 0;

    for (const channel of channels) {
      let sumSquares = 0;
      const channelEnd = Math.min(end, channel.length);
      for (let index = start; index < channelEnd; index += 1) {
        sumSquares += channel[index] ** 2;
      }
      const samplesInFrame = Math.max(channelEnd - start, 1);
      strongestChannelRms = Math.max(
        strongestChannelRms,
        Math.sqrt(sumSquares / samplesInFrame),
      );
    }

    frameRms.push(strongestChannelRms);
  }

  const activeReference = percentile(frameRms, 0.95);
  if (activeReference < 0.0005) {
    return {
      averageVolume: Number(
        (frameRms.reduce((sum, rms) => sum + rms, 0) / frameRms.length).toFixed(3),
      ),
      silenceRatio: 1,
    };
  }

  const noiseFloor = percentile(frameRms, 0.2);
  const adaptiveThreshold =
    noiseFloor + Math.max(0.0002, (activeReference - noiseFloor) * 0.25);
  const silenceThreshold = Math.max(
    0.0001,
    Math.min(activeReference * 0.6, adaptiveThreshold),
  );
  const voicedIndexes = frameRms
    .map((rms, index) => (rms >= silenceThreshold ? index : -1))
    .filter((index) => index >= 0);

  if (!voicedIndexes.length) {
    return {
      averageVolume: Number(
        (frameRms.reduce((sum, rms) => sum + rms, 0) / frameRms.length).toFixed(3),
      ),
      silenceRatio: 1,
    };
  }

  // Remove start/stop operation latency from the pause measurement.
  const firstVoiced = voicedIndexes[0];
  const lastVoiced = voicedIndexes[voicedIndexes.length - 1];
  const spokenFrames = frameRms.slice(firstVoiced, lastVoiced + 1);
  const silentFrames = spokenFrames.filter((rms) => rms < silenceThreshold).length;
  const voicedFrames = spokenFrames.filter((rms) => rms >= silenceThreshold);

  return {
    averageVolume: Number(
      (
        voicedFrames.reduce((sum, rms) => sum + rms, 0) / voicedFrames.length
      ).toFixed(3),
    ),
    silenceRatio: Number((silentFrames / spokenFrames.length).toFixed(3)),
  };
}

export async function analyzeAudioBlob(
  blob: Blob,
  durationSec: number,
): Promise<AudioMeta> {
  const fallback = {
    durationSec,
    averageVolume: null,
    silenceRatio: null,
    speechRate: null,
  };

  if (typeof window === "undefined") return fallback;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) throw new Error("AudioContext is unavailable.");

    const context = new AudioContextClass();

    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const channels = Array.from(
        { length: buffer.numberOfChannels },
        (_, index) => buffer.getChannelData(index),
      );
      const analysis = analyzePcmChannels(channels, buffer.sampleRate);

      return {
        durationSec: Number(buffer.duration.toFixed(1)),
        averageVolume: analysis.averageVolume,
        silenceRatio: analysis.silenceRatio,
        speechRate: null,
      };
    } finally {
      await context.close();
    }
  } catch {
    return fallback;
  }
}
