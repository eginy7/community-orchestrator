import { getAnthropic, MODEL } from "@/lib/anthropic";

/**
 * Hebrew tokenizes densely (~2 chars per token vs ~4 for English).
 * We start with a conservative ratio and calibrate once per run with the real tokenizer.
 */
let charsPerToken = 2.2;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / charsPerToken);
}

export function currentCharsPerToken(): number {
  return charsPerToken;
}

/** Measure the true ratio on a sample and remember it for the rest of the process. */
export async function calibrateTokens(sample: string): Promise<number> {
  if (sample.length < 2000) return charsPerToken;
  const res = await getAnthropic().messages.countTokens({
    model: MODEL,
    messages: [{ role: "user", content: sample }],
  });
  if (res.input_tokens > 0) {
    // Leave 5% headroom so chunks never overshoot.
    charsPerToken = (sample.length / res.input_tokens) * 0.95;
  }
  return charsPerToken;
}
