import { createClient } from "@insforge/sdk";
import { config } from "./config.js";

export const insforge = createClient({
  baseUrl: config.insforge.url,
  anonKey: config.insforge.apiKey || config.insforge.anonKey
});
