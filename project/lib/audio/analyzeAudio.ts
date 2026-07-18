import type { AudioMeta } from "@/types/echly";

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
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
      const samples = buffer.getChannelData(0);
      const frameSize = Math.max(1, Math.round(buffer.sampleRate * 0.02));
      const frameRms: number[] = [];

      for (let start = 0; start < samples.length; start += frameSize) {
        const end = Math.min(start + frameSize, samples.length);
        let sumSquares = 0;

        for (let index = start; index < end; index += 1) {
          sumSquares += samples[index] ** 2;
        }

        frameRms.push(Math.sqrt(sumSquares / Math.max(end - start, 1)));
      }

      const activeReference = percentile(frameRms, 0.9);
      const silenceThreshold = Math.max(0.006, activeReference * 0.12);
      const voicedIndexes = frameRms
        .map((rms, index) => (rms >= silenceThreshold ? index : -1))
        .filter((index) => index >= 0);

      if (!voicedIndexes.length) {
        return {
          durationSec: Number(buffer.duration.toFixed(1)),
          averageVolume: frameRms.length
            ? Number((frameRms.reduce((sum, rms) => sum + rms, 0) / frameRms.length).toFixed(3))
            : null,
          silenceRatio: 1,
          speechRate: null,
        };
      }

      // Remove start/stop operation latency from the pause measurement.
      const firstVoiced = voicedIndexes[0];
      const lastVoiced = voicedIndexes[voicedIndexes.length - 1];
      const spokenFrames = frameRms.slice(firstVoiced, lastVoiced + 1);
      const silentFrames = spokenFrames.filter((rms) => rms < silenceThreshold).length;
      const voicedFrames = spokenFrames.filter((rms) => rms >= silenceThreshold);

      return {
        durationSec: Number(buffer.duration.toFixed(1)),
        averageVolume: voicedFrames.length
          ? Number(
              (
                voicedFrames.reduce((sum, rms) => sum + rms, 0) /
                voicedFrames.length
              ).toFixed(3),
            )
          : null,
        silenceRatio: spokenFrames.length
          ? Number((silentFrames / spokenFrames.length).toFixed(3))
          : null,
        speechRate: null,
      };
    } finally {
      await context.close();
    }
  } catch {
    return fallback;
  }
}
