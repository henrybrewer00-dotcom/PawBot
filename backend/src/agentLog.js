import { createId } from "./id.js";
import { saveEpisodicMemory } from "./nia.js";

export async function writeAgentLog(store, seniorId, agentAction, contextUsed, result) {
  const log = await store.insert("agentLogs", {
    id: createId("log"),
    seniorId,
    agentAction,
    contextUsed,
    result,
    createdAt: new Date().toISOString()
  });
  void saveEpisodicMemory(seniorId, agentAction, contextUsed, result);
  return log;
}
