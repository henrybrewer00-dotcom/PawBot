import dotenv from "dotenv";

dotenv.config();

const numberFromEnv = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const niaApiKey = () => {
  if (process.env.NODE_ENV === "test" && process.env.NIA_ENABLE_IN_TESTS !== "true") {
    return "";
  }
  return process.env.NIA_API_KEY ?? "";
};

export const config = {
  port: numberFromEnv("PORT", 4000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:4000",
  sendblue: {
    apiKey: process.env.SENDBLUE_API_KEY ?? "",
    apiSecret: process.env.SENDBLUE_API_SECRET ?? "",
    fromNumber: process.env.SENDBLUE_FROM_NUMBER ?? ""
  },
  nia: {
    apiKey: niaApiKey()
  },
  agent: {
    pollSeconds: numberFromEnv("AGENT_POLL_SECONDS", 30),
    followUpMinutes: numberFromEnv("MEDICATION_FOLLOW_UP_MINUTES", 15),
    escalationMinutes: numberFromEnv("MEDICATION_ESCALATION_MINUTES", 30)
  }
};
