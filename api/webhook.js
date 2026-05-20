const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;

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

            // Логируем лид
            console.log('📋 ===== НОВЫЙ ЛИД =====');
            console.log(JSON.stringify({
              source:    'Instagram DM',
              senderId:  senderId,
              message:   text || '[медиа-файл]',
              type:      messageType,
              timestamp: time
            }, null, 2));

            // Автоответ
            await sendReply(
              senderId,
              'Здравствуйте! Спасибо за обращение 🙏\nМенеджер свяжется с вами в ближайшее время.'
            );

            // TODO: Отправить лид в CRM (amoCRM / Bitrix24)
            // await sendToCRM(senderId, text, time);

            // TODO: Отправить в Google Sheets
            // await sendToGoogleSheets(senderId, text, time);
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

  // Другие методы не поддерживаются
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


// ==========================================
//  TODO: Интеграция с CRM
// ==========================================
// async function sendToCRM(senderId, message, timestamp) {
//   // amoCRM пример:
//   // POST https://your-domain.amocrm.ru/api/v4/leads
//   // Body: { name: "Лид из Instagram", ... }
// }


// ==========================================
//  TODO: Интеграция с Google Sheets
// ==========================================
// async function sendToGoogleSheets(senderId, message, timestamp) {
//   // Google Apps Script Web App URL
//   // POST https://script.google.com/macros/s/xxx/exec
//   // Body: { senderId, message, timestamp, source: "Instagram" }
// }
