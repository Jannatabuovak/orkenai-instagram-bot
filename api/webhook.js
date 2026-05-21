import { normalizeLead } from "../lib/tracking.js";
import { pushToNotion } from "../lib/notion.js";
import { sendLeadEvent } from "../lib/capi.js";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const PIXEL_ID = process.env.PIXEL_ID;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

export default async function handler(req, res) {

  // ========================
  //  GET — Верификация Meta
  // ========================
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully');
      return res.status(200).send(challenge);
    }
    console.warn('⚠️ Verification failed — token mismatch');
    return res.status(403).send('Forbidden');
  }

  // ========================
  //  POST — Входящие DM
  // ========================
  if (req.method === 'POST') {
    const body = req.body;

    if (body.entry) {
      for (const entry of body.entry) {
        const messaging = entry.messaging || [];

        for (const event of messaging) {
          const senderId  = event.sender?.id;
          const timestamp = event.timestamp;

          // --- Входящее текстовое сообщение ---
          if (event.message && !event.message.is_echo) {
            const text        = event.message.text || '';
            const attachments = event.message.attachments || [];
            const hasMedia    = attachments.length > 0;
            const messageType = hasMedia ? 'media' : 'text';
            const time        = new Date(timestamp * 1000).toISOString();

            // ==============================
            //  TRACKING — определяем источник
            // ==============================
            let ref = null;

            if (event.referral && event.referral.ref) {
              ref = event.referral.ref;
            }
            if (event.postback && event.postback.referral && event.postback.referral.ref) {
              ref = event.postback.referral.ref;
            }

            const lead = normalizeLead({
              senderId:    senderId,
              username:    "",
              name:        "",
              messageText: text || '[медиа-файл]',
              ref:         ref,
              raw:         event
            });

            // Логируем лид
            console.log('📋 ===== НОВЫЙ ЛИД =====');
            console.log(JSON.stringify({
              source:    lead.source,
              senderId:  lead.senderId,
              message:   lead.messageText,
              type:      messageType,
              eventId:   lead.eventId,
              timestamp: time
            }, null, 2));

            // ==============================
            //  NOTION — сохраняем лид
            // ==============================
            pushToNotion(lead, NOTION_TOKEN, NOTION_DATABASE_ID)
              .then((result) => {
                console.log('✅ Notion saved:', JSON.stringify(result));
              })
              .catch((err) => {
                console.error('❌ Notion error:', err.message);
              });

            // ==============================
            //  META CAPI — отправляем событие
            // ==============================
            sendLeadEvent({
              pixelId: PIXEL_ID,
              accessToken: META_ACCESS_TOKEN,
              lead: lead,
              ip: req.headers["x-forwarded-for"]
                ? req.headers["x-forwarded-for"].split(",")[0]
                : "",
              ua: req.headers["user-agent"] || ""
            })
              .then((result) => {
                console.log('✅ CAPI sent:', JSON.stringify(result));
              })
              .catch((err) => {
                console.error('❌ CAPI error:', err.message);
              });

            // Автоответ
            await sendReply(
              senderId,
              'Здравствуйте! Спасибо за обращение 🙏\nМенеджер свяжется с вами в ближайшее время.'
            );
          }

          // --- Реакция на сообщение ---
          if (event.reaction) {
            console.log(`👍 Reaction from ${senderId}: ${event.reaction.reaction}`);
          }

          // --- Прочитано ---
          if (event.read) {
            console.log(`👁️ Read by ${senderId} at ${event.read.watermark}`);
          }
        }
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  }

  res.status(405).end();
}


// ==========================================
//  Отправка ответного сообщения в Instagram
// ==========================================
async function sendReply(recipientId, text) {
  try {
    const response = await fetch(
      'https://graph.instagram.com/v21.0/me/messages',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient:    { id: recipientId },
          message:      { text: text },
          access_token: IG_TOKEN
        })
      }
    );
    const data = await response.json();

    if (data.error) {
      console.error('❌ Instagram API Error:', data.error.message);
    } else {
      console.log('📤 Reply sent to:', recipientId);
    }
  } catch (err) {
    console.error('❌ Network Error:', err.message);
  }
}
