import { config } from "./config.js";

const AGENT_SOURCE = "pawbot-agent";
const PAWBOT_TAG = "pawbot";
const NIA_BASE_URL = "https://apigcp.trynia.ai/v2";

async function niaRequest(path, { method = "GET", query, body } = {}) {
  if (!config.nia.apiKey) return null;

  const url = new URL(`${NIA_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.nia.apiKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Nia request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function seniorTags(seniorId, extraTags = []) {
  return [PAWBOT_TAG, `senior:${seniorId}`, ...extraTags].filter(Boolean);
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function titleFrom(...parts) {
  return parts.filter(Boolean).join(" - ").slice(0, 120);
}

async function saveMemory({ seniorId, memoryType, title, summary, content, metadata = {}, tags = [] }) {
  if (!config.nia.apiKey) return null;

  try {
    return await niaRequest("/contexts", {
      method: "POST",
      body: {
        title,
        summary,
        content: typeof content === "string" ? content : safeJson(content),
        tags: seniorTags(seniorId, tags),
        agent_source: AGENT_SOURCE,
        memory_type: memoryType,
        metadata: {
          seniorId,
          pawbot: true,
          ...metadata
        }
      }
    });
  } catch (error) {
    console.error("Nia memory write failed", error);
    return null;
  }
}

function hasSeniorTag(result, seniorId) {
  const tags = result?.tags ?? result?.context?.tags ?? result?.metadata?.tags ?? [];
  const metadataSeniorId = result?.metadata?.seniorId ?? result?.context?.metadata?.seniorId;
  return metadataSeniorId === seniorId || (Array.isArray(tags) && tags.includes(`senior:${seniorId}`));
}

export async function saveEpisodicMemory(seniorId, action, context, result) {
  return saveMemory({
    seniorId,
    memoryType: "episodic",
    title: titleFrom("PawBot event", action),
    summary: `PawBot recorded ${action} for senior ${seniorId}.`,
    content: {
      action,
      context,
      result,
      recordedAt: new Date().toISOString()
    },
    metadata: { action },
    tags: ["agent-event", action]
  });
}

export async function saveFactMemory(seniorId, factType, content) {
  return saveMemory({
    seniorId,
    memoryType: "fact",
    title: titleFrom("PawBot fact", factType),
    summary: `Persistent PawBot fact for senior ${seniorId}: ${factType}.`,
    content,
    metadata: { factType },
    tags: ["fact", factType]
  });
}

export async function saveProceduralMemory(seniorId, procedure) {
  return saveMemory({
    seniorId,
    memoryType: "procedural",
    title: "PawBot procedure",
    summary: `PawBot handling preference for senior ${seniorId}.`,
    content: procedure,
    metadata: { procedureType: procedure?.type ?? "general" },
    tags: ["procedure", procedure?.type]
  });
}

export async function searchSeniorMemory(seniorId, query) {
  if (!config.nia.apiKey) return [];

  try {
    const response = await niaRequest("/contexts", {
      query: {
        tags: `senior:${seniorId}`,
        q: query,
        limit: 20
      }
    });
    const results = Array.isArray(response?.items) ? response.items : [];
    return results.filter((result) => hasSeniorTag(result, seniorId));
  } catch (error) {
    console.error("Nia memory search failed", error);
    return [];
  }
}
