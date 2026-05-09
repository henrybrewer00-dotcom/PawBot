const BASE = "https://api.x.ai/v1";
const MODEL = "grok-3-mini";

export async function grokChat(messages, { temperature = 0.4, maxTokens = 512 } = {}) {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY not set");

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: maxTokens })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Grok API error: ${err.error?.message ?? res.statusText}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}
