import "server-only";

// Anthropic Claude integration point — PLACEHOLDER (Phase 12).
// No network call is made yet. When the AI layer goes live, this is where the real
// Messages API call lands (read ANTHROPIC_API_KEY, build the prompt from the
// merchant's data, return the text). Until then `askClaude` returns a stub and the
// AI endpoints serve mock data from ./stub.

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function askClaude(
  _prompt: string,
): Promise<{ text: string; stub: boolean }> {
  // TODO(phase-12+): call the Anthropic Messages API with claude-* and return text.
  // Example shape (not wired):
  //   const res = await fetch("https://api.anthropic.com/v1/messages", { … });
  return {
    text: "AI is not enabled yet (placeholder).",
    stub: true,
  };
}
