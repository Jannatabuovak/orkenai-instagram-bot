const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const IG_TOKEN     = process.env.INSTAGRAM_ACCESS_TOKEN;
const AMO_TOKEN    = process.env.AMO_ACCESS_TOKEN;
const AMO_BASE_URL = "https://jannatabuova.amocrm.ru";

// ==========================================
//  Сессии пользователей (in-memory)
// ==========================================
const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 часа

function getSession(senderId) {
  const s = sessions.get(senderId);
  if (s && Date.now() - s.startedAt > SESSION_TTL) {
    sessions.delete(senderId);
    return null;
  }
  return s || null;
}

// ==========================================
//  Языковые конфигурации
// ==========================================
const LANGUAGES = {
  '1': {
    code: 'kz',
    name: 'Қазақша 🇰🇿',
    greeting: 'Сәлеметсіз бе! 👋 Алдар Көсе туралы видеомызды көргеніңізге қуаныштымыз! Сіз дұрыс жерге келдіңіз 😊',
    question: 'Сізге қалай көмектесе аламыз? Төменде жазыңыз 👇'
  },
  '2': {
    code: 'ru',
    name: 'Русский 🇷🇺',
    greeting: 'Здравствуйте! 👋 Рады, что вы нашли нас через видео про Алдар Косе! Вы обратились по адресу 😊',
    question: 'Чем можем вам помочь? Напишите ниже 👇'
  },
  '3': {
    code: 'en',
    name: 'English 🇬🇧',
    greeting: "Hello! 👋 Great that you found us through our Aldar Kose video! You're in the right place 😊",
    question: 'How can we help you? Let us know below 👇'
  },
  '4': {
    code: 'uz',
    name: "O'zbekcha 🇺🇿",
    greeting: "Assalomu alaykum! 👋 Aldar Ko'sa haqidagi videomizni ko'rganingizdan xursandmiz! To'g'ri joyga keldingiz 😊",
    question: "Sizga qanday yordam bera olamiz? Pastga yozing 👇"
  },
  '5': {
    code: 'kg',
    name: 'Кыргызча 🇰🇬',
    greeting: 'Саламатсызбы! 👋 Алдар Көсө жөнүндө видеобузду көргөнүңүзгө кубанычтабыз! Туура жерге келдиңиз 😊',
    question: 'Сизге кандай жардам бере алабыз? Төмөнгө жазыңыз 👇'
  }
};

const MENU_TEXT = `Сәлеметсіз бе! 👋 Тілді таңдаңыз:
Выберите язык / Choose language:

1️⃣ Қазақша 🇰🇿
2️⃣ Русский 🇷🇺
3️⃣ English 🇬🇧
4️⃣ O'zbekcha 🇺🇿
5️⃣ Кыргызча 🇰🇬

👆 Санды жазыңыз / Отправьте цифру / Send a number`;

// ==========================================
//  MAIN HANDLER
// ==========================================
export default async function handler(req, res) {

  // ========================
  //  GET — Верификация Meta
  // ========================
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified');
      return res.status(200).send(challenge);
    }
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
            const text = (event.message.text || '').trim();
            const time = new Date(timestamp * 1000).toISOString();

            console.log('📩 ===== НОВОЕ СООБЩЕНИЕ =====');
            console.log(JSON.stringify({
              senderId,
              message: text || '[медиа-файл]',
              timestamp: time
            }, null, 2));

            const session = getSession(senderId);

            // ─────────────────────────────────
            //  ШАГ 1: Новый пользователь → Меню языков
            // ─────────────────────────────────
            if (!session) {
              sessions.set(senderId, {
                step: 'awaiting_language',
                startedAt: Date.now()
              });

              await sendReply(senderId, MENU_TEXT);

              // Создаём сделку в amoCRM сразу при первом обращении
              await createAmoDeal(senderId, text || '[первое обращение]', time);
            }

            // ─────────────────────────────────
            //  ШАГ 2: Ожидаем выбор языка
            // ─────────────────────────────────
            else if (session.step === 'awaiting_language') {
              const lang = LANGUAGES[text];

              if (lang) {
                // Язык выбран — сохраняем и приветствуем
                sessions.set(senderId, {
                  step: 'active',
                  lang: lang.code,
                  langName: lang.name,
                  startedAt: session.startedAt
                });

                const reply = `${lang.greeting}\n\n${lang.question}`;
                await sendReply(senderId, reply);
              } else {
                // Неверный ввод — показываем меню ещё раз
                await sendReply(
                  senderId,
                  `⚠️ Тілді таңдаңыз (1-5):\nВыберите язык (1-5):\n\n${MENU_TEXT}`
                );
              }
            }

            // ─────────────────────────────────
            //  ШАГ 3: Активная сессия — пересылаем в amoCRM
            // ─────────────────────────────────
            else if (session.step === 'active') {
              // Подтверждение клиенту
              const confirmations = {
                kz: '✅ Рахмет! Хабарламаңыз қабылданды. Менеджер жақын арада жауап береді 🙏',
                ru: '✅ Спасибо! Ваше сообщение принято. Менеджер ответит вам в ближайшее время 🙏',
                en: '✅ Thank you! Your message has been received. Our manager will reply shortly 🙏',
                uz: "✅ Rahmat! Xabaringiz qabul qilindi. Menejer tez orada javob beradi 🙏",
                kg: '✅ Рахмат! Кабарыңыз кабыл алынды. Менеджер жакында жооп берет 🙏'
              };

              const msg = confirmations[session.lang] || confirmations['ru'];
              await sendReply(senderId, msg);

              // Добавляем в amoCRM как примечание
              await createAmoDeal(senderId, `[${session.langName}] ${text || '[медиа-файл]'}`, time);
            }
          }

          // --- Реакция ---
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
    console.error('❌ Instagram sendReply Error:', err.message);
  }
}


// ==========================================
//  Создание сделки + контакта в amoCRM
// ==========================================
async function createAmoDeal(senderId, messageText, time) {
  try {
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
            { name: "orkenai-bot" },
            { name: "aldar-kose" }
          ]
        }
      }
    ];

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
      console.log('✅ amoCRM — сделка создана, ID:', leadId);

      if (leadId) {
        await addNoteToLead(leadId, messageText, time);
      }
    } else {
      console.error('❌ amoCRM Lead Error:', JSON.stringify(leadData));
    }
  } catch (err) {
    console.error('❌ amoCRM createDeal Error:', err.message);
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
          text: `📩 Instagram DM (${time}):\n\n${messageText}`
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
      console.log('📝 amoCRM — примечание добавлено к сделке', leadId);
    } else {
      const errData = await noteResponse.json();
      console.error('❌ amoCRM Note Error:', JSON.stringify(errData));
    }
  } catch (err) {
    console.error('❌ amoCRM addNote Error:', err.message);
  }
}
