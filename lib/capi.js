export async function sendLeadEvent({ pixelId, accessToken, lead, ip, ua }) {
  if (!pixelId || !accessToken) {
    console.log("CAPI not configured, skipping");
    return { skipped: true };
  }

  var url = "https://graph.facebook.com/v21.0/" + pixelId + "/events?access_token=" + accessToken;

  var payload = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        event_id: lead.eventId,
        action_source: "system_generated",
        user_data: {
          client_ip_address: ip || "",
          client_user_agent: ua || ""
        },
        custom_data: {
          source: lead.source,
          platform: lead.platform,
          message_preview: (lead.messageText || "").slice(0, 120)
        }
      }
    ]
  };

  var res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  var data = await res.json();
  console.log("CAPI response:", res.status, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data: data };
}
