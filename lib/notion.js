const NOTION_API = "https://api.notion.com/v1/pages";
const NOTION_VERSION = "2022-06-28";

export async function pushToNotion(lead, notionToken, databaseId) {
  if (!notionToken || !databaseId) {
    console.log("Notion not configured, skipping");
    return { skipped: true };
  }

  var payload = {
    parent: { database_id: databaseId },
    properties: {
      "Name": {
        title: [{ text: { content: lead.username || lead.senderId || "Unknown" } }]
      },
      "Platform": {
        select: { name: lead.platform || "instagram" }
      },
      "Source": {
        select: { name: lead.source || "organic" }
      },
      "Message": {
        rich_text: [{ text: { content: (lead.messageText || "").slice(0, 2000) } }]
      },
      "Sender ID": {
        rich_text: [{ text: { content: lead.senderId || "" } }]
      },
      "Event ID": {
        rich_text: [{ text: { content: lead.eventId || "" } }]
      },
      "Status": {
        select: { name: "New" }
      },
      "Created": {
        date: { start: lead.createdAt || new Date().toISOString() }
      }
    }
  };

  var res = await fetch(NOTION_API, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + notionToken,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION
    },
    body: JSON.stringify(payload)
  });

  var data = await res.json();
  console.log("Notion response:", res.status, JSON.stringify(data));
  return { ok: res.ok, status: res.status, pageId: data.id };
}
