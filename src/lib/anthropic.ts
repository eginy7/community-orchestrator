import Anthropic from "@anthropic-ai/sdk";

/** Single model everywhere; Stage A/B differ only in effort and max_tokens. */
export const MODEL = "claude-opus-5";

/** USD per million tokens (Claude Opus 5). Cache reads are 10% of input, cache writes 125%. */
export const PRICING = {
  inputPerM: 5,
  outputPerM: 25,
  cacheReadPerM: 0.5,
  cacheWritePerM: 6.25,
};

export interface UsageTotals {
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheWrite: number;
}

export function costUsd(u: UsageTotals): number {
  return (
    (u.tokensIn * PRICING.inputPerM +
      u.tokensOut * PRICING.outputPerM +
      u.cacheRead * PRICING.cacheReadPerM +
      u.cacheWrite * PRICING.cacheWritePerM) /
    1_000_000
  );
}

export function usageOf(message: Anthropic.Message): UsageTotals {
  const u = message.usage;
  return {
    tokensIn: u.input_tokens,
    tokensOut: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}

const globalForClient = globalThis as unknown as { __anthropic?: Anthropic };

/**
 * Reads ANTHROPIC_API_KEY from the environment (.env.local under Next, or exported in the shell for scripts).
 * Long timeout: a 110K-token Stage A chunk can take several minutes; we always stream anyway.
 */
export function getAnthropic(): Anthropic {
  if (!globalForClient.__anthropic) {
    globalForClient.__anthropic = new Anthropic({ maxRetries: 4, timeout: 20 * 60_000 });
  }
  return globalForClient.__anthropic;
}
