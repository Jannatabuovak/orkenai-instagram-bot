const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const IG_TOKEN     = process.env.INSTAGRAM_ACCESS_TOKEN;

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

          if (event.message && !event.message.is_echo) {
            const text = event.message.text || '';
            const time = new Date(timestamp * 1000).toISOString();

            console.log('📩 ===== НОВОЕ СООБЩЕНИЕ =====');
            console.log(JSON.stringify({ senderId, message: text || '[медиа-файл]', timestamp: time }, null, 2));

            // Автоответ
            await sendReply(
              senderId,
              'Мы создаём AI-решения для бизнеса: Чат-боты (WhatsApp, Instagram, Telegram) Сайты и автоматизация AI-контент: изображения, видео, дизайн Менеджер ответит вам в ближайшее время 🚀'
            );
          }
        }
      }
    }
    return res.status(200).send('EVENT_RECEIVED');
  }

  res.status(405).end();
}

// Отправка ответа в Instagram DM
async function sendReply(recipientId, text) {
  try {
    const response = await fetch('https://graph.instagram.com/v21.0/me/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient:    { id: recipientId },
        message:      { text: text },
        access_token: IG_TOKEN
      })
    });
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
