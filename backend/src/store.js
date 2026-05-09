import { insforge } from "./db.js";

const TABLES = {
  users: "users",
  careRelationships: "care_relationships",
  medications: "medications",
  medicationLogs: "medication_logs",
  calendarEvents: "calendar_events",
  scamAlerts: "scam_alerts",
  agentLogs: "agent_logs",
  hyperspellConnections: "hyperspell_connections",
  seniorPersonalInfo: "senior_personal_info"
};

const toSnake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const rowToSnake = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [toSnake(k), v]));

const rowToCamel = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [toCamel(k), v]));

export class InsForgeStore {
  async all(collection) {
    const { data, error } = await insforge.database.from(TABLES[collection]).select();
    if (error) throw new Error(`store.all(${collection}): ${error.message}`);
    return (data ?? []).map(rowToCamel);
  }

  async find(collection, predicate) {
    const rows = await this.all(collection);
    return rows.find(predicate) ?? null;
  }

  async insert(collection, item) {
    const { data, error } = await insforge.database
      .from(TABLES[collection])
      .insert([rowToSnake(item)])
      .select();
    if (error) throw new Error(`store.insert(${collection}): ${error.message}`);
    return rowToCamel(data[0]);
  }

  async update(collection, id, changes) {
    const { data, error } = await insforge.database
      .from(TABLES[collection])
      .update(rowToSnake(changes))
      .eq("id", id)
      .select();
    if (error) throw new Error(`store.update(${collection}): ${error.message}`);
    return data[0] ? rowToCamel(data[0]) : null;
  }

  async delete(collection, id) {
    const { error } = await insforge.database
      .from(TABLES[collection])
      .delete()
      .eq("id", id);
    if (error) throw new Error(`store.delete(${collection}): ${error.message}`);
  }
}

export const store = new InsForgeStore();
