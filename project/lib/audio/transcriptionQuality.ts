export type TranscriptionProvider = "nova-3" | "whisper";

export type TranscriptionCandidate = {
  transcript: string;
  hallucination: boolean;
  provider: TranscriptionProvider;
  confidence: number | null;
  speechProbability: number | null;
};

export type TranscriptionSelection = {
  accepted: TranscriptionCandidate | null;
  agreement: number | null;
  candidates: TranscriptionCandidate[];
};

const STRONG_NOVA_CONFIDENCE = 0.85;

export function normalizeTranscript(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s。、,.!！?？「」『』"'()[\]【】]/g, "");
}

export function transcriptAgreement(left: string, right: string) {
  const a = normalizeTranscript(left);
  const b = normalizeTranscript(right);
  if (!a || !b) return null;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }

  return Number(
    (1 - previous[b.length] / Math.max(a.length, b.length)).toFixed(3),
  );
}

export function isLikelySilenceHallucination(transcript: string) {
  const normalized = normalizeTranscript(transcript);

  return (
    /^(ご視聴ありがとうございました)+$/.test(normalized) ||
    /^(ご視聴ありがとうございます)+$/.test(normalized) ||
    /^(最後までご視聴ありがとうございました)+$/.test(normalized) ||
    /^(ご清聴ありがとうございました)+$/.test(normalized) ||
    /^(お聞きいただきありがとうございました)+$/.test(normalized) ||
    /チャンネル登録.*(お願い|ありがとう)/.test(normalized) ||
    /字幕.*(提供|作成)/.test(normalized) ||
    /^(thankyou|thanks)for(watching|listening)$/.test(normalized) ||
    /^pleasesubscribe/.test(normalized) ||
    /^(音楽|拍手|無音)$/.test(normalized)
  );
}

function isReliable(candidate: TranscriptionCandidate) {
  return Boolean(candidate.transcript.trim() && !candidate.hallucination);
}

function strongestCandidate(
  candidates: TranscriptionCandidate[],
  provider: TranscriptionProvider,
) {
  return candidates
    .filter((candidate) => candidate.provider === provider)
    .sort((left, right) => {
      const leftStrength =
        provider === "nova-3"
          ? left.confidence ?? 0
          : left.speechProbability ?? 0.5;
      const rightStrength =
        provider === "nova-3"
          ? right.confidence ?? 0
          : right.speechProbability ?? 0.5;
      return rightStrength - leftStrength;
    })[0];
}

export function selectTranscriptionCandidate(
  input: TranscriptionCandidate[],
): TranscriptionSelection {
  const candidates = input.filter(isReliable);
  const nova = strongestCandidate(candidates, "nova-3");
  const whisper = strongestCandidate(candidates, "whisper");
  const agreement =
    nova && whisper
      ? transcriptAgreement(nova.transcript, whisper.transcript)
      : null;

  if (nova && whisper) {
    // Deepgram exposes calibrated transcript confidence. Prefer that evidence
    // over transcript length; a verbose Whisper hallucination must never win
    // merely because it contains more characters.
    const novaIsNearZeroConfidence =
      nova.confidence !== null && nova.confidence < 0.15;
    return {
      accepted: novaIsNearZeroConfidence ? whisper : nova,
      agreement,
      candidates,
    };
  }

  return {
    accepted: nova ?? whisper ?? null,
    agreement,
    candidates,
  };
}

export function isStrongNovaCandidate(candidate: TranscriptionCandidate) {
  return Boolean(
    isReliable(candidate) &&
      candidate.provider === "nova-3" &&
      candidate.confidence !== null &&
      candidate.confidence >= STRONG_NOVA_CONFIDENCE,
  );
}
