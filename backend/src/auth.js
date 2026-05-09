import { createClient } from "@insforge/sdk";
import { config } from "./config.js";
import { HttpError } from "./http.js";

function bearerToken(req) {
  const header = req.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function requireInsForgeUser(req) {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, "Authentication required");

  const client = createClient({
    baseUrl: config.insforge.url,
    anonKey: config.insforge.anonKey,
    edgeFunctionToken: token,
    isServerMode: true
  });

  const { data, error } = await client.auth.getCurrentUser();
  if (error || !data?.user) {
    throw new HttpError(401, "Invalid or expired session");
  }

  return data.user;
}
