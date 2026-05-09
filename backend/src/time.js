export function toDateKey(date = new Date(), timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function toLocalTime(date = new Date(), timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function scheduledIsoForLocalTime(dateKey, hhmm, timeZone = "UTC") {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit"
  }).formatToParts(utcGuess);
  const tzPart = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const offsetMatch = tzPart.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);

  if (!offsetMatch) return utcGuess.toISOString();

  const offsetHours = Number(offsetMatch[1]);
  const offsetMinutes = Number(offsetMatch[2] ?? 0);
  const offsetMs = (offsetHours * 60 + Math.sign(offsetHours) * offsetMinutes) * 60 * 1000;
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - offsetMs).toISOString();
}

export function minutesBetween(fromIso, toDate = new Date()) {
  return Math.floor((toDate.getTime() - new Date(fromIso).getTime()) / 60000);
}
