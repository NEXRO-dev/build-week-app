import type { AudioMeta } from "@/types/echly";

export async function analyzeAudioBlob(
  blob: Blob,
  durationSec: number,
): Promise<AudioMeta> {
  if (typeof window === "undefined") {
    return {
      durationSec,
      averageVolume: null,
      silenceRatio: null,
      speechRate: null,
    };
  }

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("AudioContext is unavailable.");
    }

    const context = new AudioContextClass();
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = buffer.getChannelData(0);
    const frameSize = 2048;
    let totalRms = 0;
    let silentFrames = 0;
    let frameCount = 0;

    for (let start = 0; start < samples.length; start += frameSize) {
      const end = Math.min(start + frameSize, samples.length);
      let sumSquares = 0;

      for (let index = start; index < end; index += 1) {
        sumSquares += samples[index] ** 2;
      }

      const rms = Math.sqrt(sumSquares / Math.max(end - start, 1));
      totalRms += rms;
      silentFrames += rms < 0.02 ? 1 : 0;
      frameCount += 1;
    }

    await context.close();

    return {
      durationSec,
      averageVolume: frameCount ? Number((totalRms / frameCount).toFixed(3)) : null,
      silenceRatio: frameCount
        ? Number((silentFrames / frameCount).toFixed(3))
        : null,
      speechRate: null,
    };
  } catch {
    return {
      durationSec,
      averageVolume: null,
      silenceRatio: null,
      speechRate: null,
    };
  }
}
