export async function generateCommentary(metrics) {
  const key = process.env.AI_API_KEY;
  if (!key) return { mode: "statistical", summary: null,
    note: "No AI provider configured; metrics are deterministic historical calculations." };
  if (!process.env.API_KEY) return { mode: "statistical", summary: null,
    note: "AI calls disabled until API_KEY is configured to prevent unauthenticated model spend." };

  const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  // The base URL is server-managed configuration, never a caller-supplied URL.
  if (!base.startsWith("https://")) return { mode: "statistical", summary: null,
    note: "AI_BASE_URL must use HTTPS." };
  const model = process.env.AI_MODEL || "gpt-4.1-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(base + "/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model, temperature: 0.1, max_tokens: 160,
        messages: [
          { role: "system", content: "Write two factual sentences summarising observed market metrics. Do not make predictions, recommendations or unsupported claims. Mention missing data limitations. No markdown." },
          { role: "user", content: JSON.stringify(metrics) }
        ]
      })
    });
    if (!response.ok) throw new Error("AI service unavailable");
    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content;
    if (typeof summary !== "string" || !summary.trim()) throw new Error("Empty AI response");
    return { mode: "model-assisted", model, summary: summary.trim().slice(0, 1400) };
  } catch {
    return { mode: "statistical", summary: null,
      note: "AI provider unavailable; statistical metrics still valid." };
  } finally {
    clearTimeout(timer);
  }
}
