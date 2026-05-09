import { config } from "./config.js";

const HYPERSPELL_BASE_URL = "https://api.hyperspell.com";
export const HYPERSPELL_PROVIDERS = new Set(["google_calendar", "google_mail"]);

function validateProvider(provider) {
  if (!HYPERSPELL_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported Hyperspell provider: ${provider}`);
  }
}

async function hyperspellRequest(path, { method = "GET", query, body, seniorId, authToken } = {}) {
  if (!config.hyperspell.apiKey) return null;

  const url = new URL(`${HYPERSPELL_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${authToken ?? config.hyperspell.apiKey}`,
      Accept: "application/json",
      ...(seniorId ? { "X-As-User": seniorId } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Hyperspell request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function createUserToken(seniorId) {
  if (!config.hyperspell.apiKey) return null;

  try {
    return await hyperspellRequest("/auth/user_token", {
      method: "POST",
      body: {
        user_id: seniorId,
        expires_in: "2h"
      }
    });
  } catch (error) {
    console.error("Hyperspell user token creation failed", error);
    return null;
  }
}

export async function getUserAuthProfile(seniorId) {
  if (!config.hyperspell.apiKey) return null;

  try {
    const tokenData = await createUserToken(seniorId);
    const token = tokenData?.token ?? tokenData?.user_token;
    if (!token) return null;

    return await hyperspellRequest("/auth/me", { authToken: token });
  } catch (error) {
    console.error("Hyperspell auth profile lookup failed", error);
    return null;
  }
}

// Integration IDs from GET /integrations/list — used for direct link URLs
// which force a fresh OAuth flow with correct scopes.
const INTEGRATION_IDS = {
  google_mail: "019e0e15-f7ca-74bd-9a44-6087600ea2d1",
  google_drive: "019e0e15-f89d-7259-9ed6-549145a6d5a6"
};

export async function getConnectUrl(seniorId, provider, redirectUrl, userToken) {
  if (!config.hyperspell.apiKey) return null;

  try {
    const tokenData = userToken ?? await createUserToken(seniorId);
    const token = tokenData?.token ?? tokenData?.user_token;
    if (!token) return null;

    const integrationId = INTEGRATION_IDS[provider];
    const base = integrationId
      ? `https://connect.hyperspell.com/link/${integrationId}`
      : "https://connect.hyperspell.com";

    const url = new URL(base);
    url.searchParams.set("token", token);
    url.searchParams.set("popup", "false");
    url.searchParams.set("autoclose", "true");
    if (!integrationId) url.searchParams.set("providers", provider);
    if (redirectUrl) url.searchParams.set("redirect_uri", redirectUrl);

    return { url: url.toString(), expires_at: tokenData?.expires_at ?? null };
  } catch (error) {
    console.error("Hyperspell connect URL creation failed", error);
    return null;
  }
}

export async function queryMemory(seniorId, query, sources, { effort = 0, options = {} } = {}) {
  if (!config.hyperspell.apiKey) return [];

  try {
    const response = await hyperspellRequest("/memories/query", {
      method: "POST",
      seniorId,
      body: { query, sources, effort, options }
    });
    return response?.documents ?? response?.results ?? response?.memories ?? [];
  } catch (error) {
    console.error("Hyperspell memory query failed", error);
    return [];
  }
}
