const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const IG_TOKEN     = process.env.INSTAGRAM_ACCESS_TOKEN;
const AMO_TOKEN    = process.env.AMO_ACCESS_TOKEN;

const AMO_BASE_URL = "https://jannatabuova.amocrm.ru";

export default async function handler(req, res) {

  // ========================
  //  GET — Верификация Meta
  // ========================
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('\u2705 Webhook verified successfully');
      return res.status(200).send(challenge);
    }
    console.warn('\u26a0\ufe0f Verification failed \u2014 token mismatch');
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

          // --- Входящее сообщение ---
          if (event.message && !event.message.is_echo) {
            const text = event.message.text || '';
            const time = new Date(timestamp * 1000).toISOString();

            console.log('\ud83d\udce9 ===== НОВОЕ СООБЩЕНИЕ =====');
            console.log(JSON.stringify({
              senderId,
              message: text || '[медиа-файл]',
              timestamp: time
            }, null, 2));

            // ==============================
            //  1. Автоответ в Instagram DM
            // ==============================
            await sendReply(
              senderId,
              'С\u0441\u04d9леметсіз бе! \ud83d\udc4b OrkenAI-ға хош келдіңіз!\n\nБіз AI-шешімдер жасаймыз: чат-боттар, автоматтандыру, вебсайттар, AI-контент.\n\n---\n\nЗдравствуйте! \ud83d\udc4b Добро пожаловать в OrkenAI!\n\nМы создаём AI-решения для бизнеса:\n\ud83e\udd16 Чат-боты (WhatsApp, Instagram, Telegram)\n\ud83c\udf10 Сайты и автоматизация\n\ud83c\udfa8 AI-контент: изображения, видео, дизайн\n\nМенеджер ответит вам в ближайшее время \ud83d\ude80'
            );

            // ==============================
            //  2. Создание сделки в amoCRM
            // ==============================
            await createAmoDeal(senderId, text || '[медиа-файл]', time);
          }

          // --- Реакция ---
          if (event.reaction) {
            console.log(`\ud83d\udc4d Reaction from ${senderId}: ${event.reaction.reaction}`);
          }

          // --- Прочитано ---
          if (event.read) {
            console.log(`\ud83d\udc41\ufe0f Read by ${senderId} at ${event.read.watermark}`);
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
      console.error('\u274c Instagram API Error:', data.error.message);
    } else {
      console.log('\ud83d\udce4 Reply sent to:', recipientId);
    }
  } catch (err) {
    console.error('\u274c Instagram sendReply Error:', err.message);
  }
}


// ==========================================
//  Создание сделки + контакта в amoCRM
// ==========================================
async function createAmoDeal(senderId, messageText, time) {
  try {
    // Используем /api/v4/leads/complex — создаёт сделку + контакт за один запрос
    const payload = [
      {
        name: `Instagram DM — OrkenAI`,
        pipeline_id: null,
        _embedded: {
          contacts: [
            {
              first_name: `Instagram: ${senderId}`,
              custom_fields_values: [
                {
                  field_code: "IM",
                  values: [
                    {
                      value: senderId,
                      enum_code: "OTHER"
                    }
                  ]
                }
              ]
            }
          ],
          tags: [
            { name: "instagram" },
            { name: "orkenai-bot" }
          ]
        }
      }
    ];

    // --- Создаём сделку с контактом ---
    const leadResponse = await fetch(`${AMO_BASE_URL}/api/v4/leads/complex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AMO_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const leadData = await leadResponse.json();

    if (leadResponse.ok) {
      const leadId = leadData[0]?.id;
      console.log('\u2705 amoCRM — сделка создана, ID:', leadId);

      // --- Добавляем примечание с текстом сообщения ---
      if (leadId) {
        await addNoteToLead(leadId, messageText, time);
      }
    } else {
      console.error('\u274c amoCRM Lead Error:', JSON.stringify(leadData));
    }
  } catch (err) {
    console.error('\u274c amoCRM createDeal Error:', err.message);
  }
}


// ==========================================
//  Добавление примечания к сделке
// ==========================================
async function addNoteToLead(leadId, messageText, time) {
  try {
    const notePayload = [
      {
        note_type: "common",
        params: {
          text: `\ud83d\udce9 Instagram DM (${time}):\n\n${messageText}`
        }
      }
    ];

    const noteResponse = await fetch(
      `${AMO_BASE_URL}/api/v4/leads/${leadId}/notes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AMO_TOKEN}`
        },
        body: JSON.stringify(notePayload)
      }
    );

    if (noteResponse.ok) {
      console.log('\ud83d\udcdd amoCRM — примечание добавлено к сделке', leadId);
    } else {
      const errData = await noteResponse.json();
      console.error('\u274c amoCRM Note Error:', JSON.stringify(errData));
    }
  } catch (err) {
    console.error('\u274c amoCRM addNote Error:', err.message);
  }
}
