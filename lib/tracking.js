export function buildEventId(senderId, timestampSec) {
  return "ig_" + senderId + "_" + timestampSec;
}

export function normalizeLead({ senderId, username, name, messageText, ref, raw }) {
  var eventTime = Math.floor(Date.now() / 1000);
  return {
    createdAt: new Date().toISOString(),
    platform: "instagram",
    source: ref || "organic",
    senderId: senderId || "",
    username: username || "",
    name: name || "",
    messageText: messageText || "",
    eventId: buildEventId(senderId, eventTime),
    raw: raw || {}
  };
}
