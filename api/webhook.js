const VERIFY_TOKEN  = process.env.VERIFY_TOKEN;
const IG_TOKEN      = process.env.INSTAGRAM_ACCESS_TOKEN;
const AMO_TOKEN     = process.env.AMO_ACCESS_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const AMO_BASE_URL  = "https://jannatabuova.amocrm.ru";

// ==========================================
//  Сессии пользователей (in-memory)
// ==========================================
const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000;

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
    currency: 'KZT',
    currencySymbol: '₸',
    greeting: 'Сәлеметсіз бе! 👋 Алдар Көсе туралы видеомызды көргеніңізге қуаныштымыз! Сіз дұрыс жерге келдіңіз 😊',
    question: 'Сізге қалай көмектесе аламыз? Төменде жазыңыз 👇',
    langInstruction: 'Отвечай ТОЛЬКО на казахском языке. Валюта: тенге (₸).'
  },
  '2': {
    code: 'ru',
    name: 'Русский 🇷🇺',
    currency: 'KZT',
    currencySymbol: '₸',
    greeting: 'Здравствуйте! 👋 Рады, что вы нашли нас через видео про Алдар Косе! Вы обратились по адресу 😊',
    question: 'Чем можем вам помочь? Напишите ниже 👇',
    langInstruction: 'Отвечай ТОЛЬКО на русском языке. Валюта: тенге (₸).'
  },
  '3': {
    code: 'en',
    name: 'English 🇬🇧',
    currency: 'USD',
    currencySymbol: '$',
    greeting: "Hello! 👋 Great that you found us through our Aldar Kose video! You're in the right place 😊",
    question: 'How can we help you? Let us know below 👇',
    langInstruction: 'Reply ONLY in English. Currency: USD ($).'
  },
  '4': {
    code: 'uz',
    name: "O'zbekcha 🇺🇿",
    currency: 'UZS',
    currencySymbol: "so'm",
    greeting: "Assalomu alaykum! 👋 Aldar Ko'sa haqidagi videomizni ko'rganingizdan xursandmiz! To'g'ri joyga keldingiz 😊",
    question: "Sizga qanday yordam bera olamiz? Pastga yozing 👇",
    langInstruction: "Javob faqat o'zbek tilida. Valyuta: so'm (UZS)."
  },
  '5': {
    code: 'kg',
    name: 'Кыргызча 🇰🇬',
    currency: 'KGS',
    currencySymbol: 'сом',
    greeting: 'Саламатсызбы! 👋 Алдар Көсө жөнүндө видеобузду көргөнүңүзгө кубанычтабыз! Туура жерге келдиңиз 😊',
    question: 'Сизге кандай жардам бере алабыз? Төмөнгө жазыңыз 👇',
    langInstruction: 'Жооп бер ТОЛЬКО кыргыз тилинде. Валюта: сом (KGS).'
  }
};

const MENU_TEXT = `Сәлеметсіз бе! 👋 Тілді таңдаңыз:
Выберите язык / Choose language:

1️⃣ Қазақша 🇰🇿
2️⃣ Русский 🇷🇺
3️⃣ English 🇬🇧
4️⃣ O'zbekcha 🇺🇿
5️⃣ Кыргызча 🇰🇬

👆 Жіберіңіз цифрды / Отправьте цифру / Send a number`;

// ==========================================
//  Прайс-лист OrkenAI (доступные цены в KZT)
// ==========================================
const PRICE_LIST_KZT = {
  websites: {
    landing:    { price: 100000, days: '3-5' },
    corporate:  { price: 250000, days: '7-10' },
    ecommerce:  { price: 400000, days: '10-14' },
    premium:    { price: 700000, days: '14-21' }
  },
  ai_agents: {
    basic_chatbot:    { price: 80000,  days: '2-3' },
    advanced_chatbot: { price: 200000, days: '5-7' },
    full_ai_agent:    { price: 450000, days: '7-14' }
  },
  cards_images: {
    product_card:  { price: 3000,   days: '1' },
    pack_10:       { price: 25000,  days: '2-3' },
    pack_50:       { price: 100000, days: '5-7' },
    custom_design: { price: 10000,  days: '1' }
  },
  ai_video: {
    short_reel:      { price: 30000,  days: '1-2' },
    promo_video:     { price: 80000,  days: '3-5' },
    full_production: { price: 200000, days: '5-10' }
  }
};

// Курсы конвертации (примерные)
const CURRENCY_RATES = {
  KZT: 1,
  USD: 0.002,
  UZS: 25.5,
  KGS: 0.18
};

// ==========================================
//  System Prompt для Claude
// ==========================================
function buildSystemPrompt(lang, profileInfo) {
  const langConfig = Object.values(LANGUAGES).find(l => l.code === lang);
  const currency = langConfig?.currency || 'KZT';
  const symbol = langConfig?.currencySymbol || '₸';
  const langInstruction = langConfig?.langInstruction || 'Отвечай на русском языке.';

  const rate = CURRENCY_RATES[currency] || 1;

  function convertPrice(kzt) {
    const converted = Math.round(kzt * rate);
    if (currency === 'USD') return `$${converted}`;
    return `${converted.toLocaleString()} ${symbol}`;
  }

  const profileContext = profileInfo
    ? `\n\nИнформация об Instagram-аккаунте клиента:\n- Имя: ${profileInfo.name || 'не указано'}\n- Username: @${profileInfo.username || 'не указан'}\n- Подписчиков: ${profileInfo.follower_count || 'неизвестно'}\n- Биография: ${profileInfo.biography || 'не указана'}\n- Категория: ${profileInfo.category || 'не указана'}\n- Сайт: ${profileInfo.website || 'нет'}\n\nИспользуй эту информацию чтобы адаптировать свои вопросы и предложения. Например, если у клиента магазин — предложи карточки товаров и сайт. Если блогер — AI-видео и контент. Обращайся по имени если оно известно.`
    : '';

  return `Ты — менеджер по продажам компании OrkenAI (orkenai.kz). Твоё имя — Зарина.

${langInstruction}

🎯 ТВОЯ ЗАДАЧА:
- Выяснить потребности клиента через дружелюбный диалог
- Предложить подходящие услуги OrkenAI с реальными ценами и сроками
- Собрать контактные данные (имя, сфера бизнеса, телефон/WhatsApp)
- Довести до заявки или передать менеджеру

📋 УСЛУГИ И ЦЕНЫ OrkenAI:

🌐 СОЗДАНИЕ САЙТОВ:
• Лендинг (одностраничный) — от ${convertPrice(100000)}, срок 3-5 дней
• Корпоративный сайт — от ${convertPrice(250000)}, срок 7-10 дней
• Интернет-магазин — от ${convertPrice(400000)}, срок 10-14 дней
• Премиум-сайт (дизайн + анимации) — от ${convertPrice(700000)}, срок 14-21 день

🤖 AI-АГЕНТЫ И ЧАТ-БОТЫ:
• Базовый чат-бот (FAQ, автоответы) — от ${convertPrice(80000)}, срок 2-3 дня
• Продвинутый чат-бот (AI, сценарии, CRM) — от ${convertPrice(200000)}, срок 5-7 дней
• Полноценный AI-агент (обучение на данных, интеграции) — от ${convertPrice(450000)}, срок 7-14 дней

🖼 КАРТОЧКИ И AI-ИЗОБРАЖЕНИЯ:
• 1 карточка товара — от ${convertPrice(3000)}, срок 1 день
• Пакет 10 карточек — ${convertPrice(25000)} (${convertPrice(2500)}/шт), срок 2-3 дня
• Пакет 50 карточек — ${convertPrice(100000)} (${convertPrice(2000)}/шт), срок 5-7 дней
• AI-баннер / индивидуальный дизайн — от ${convertPrice(10000)}, срок 1 день

🎬 AI-ВИДЕО:
• Короткий Reels/Shorts (до 30 сек) — от ${convertPrice(30000)}, срок 1-2 дня
• Промо-ролик (до 60 сек) — от ${convertPrice(80000)}, срок 3-5 дней
• Полный продакшн (сценарий + монтаж + AI) — от ${convertPrice(200000)}, срок 5-10 дней
${profileContext}

🧠 ПРАВИЛА ПОВЕДЕНИЯ:
1. Говори ПРОСТЫМ языком, как живой человек, без канцелярита и шаблонов
2. Будь ВЕЖЛИВЫМ и НЕНАВЯЗЧИВЫМ — не давить, не торопить
3. Задавай по 1-2 вопроса за раз, не перегружай
4. Используй эмодзи умеренно (1-3 на сообщение)
5. Вызывай ДОВЕРИЕ — будь честной, если что-то нужно уточнить — скажи "уточню у команды"
6. АДАПТИРУЙ вопросы к профилю клиента (если видишь что у него магазин — спрашивай про товары, если блогер — про контент)
7. НЕ ВЫДАВАЙ весь прайс-лист сразу — сначала узнай потребность, потом предложи подходящее
8. Если клиент спрашивает цену — называй "от ..." и уточняй детали для точного расчёта
9. Когда клиент заинтересован — мягко попроси контакт (WhatsApp/телефон) для детального обсуждения
10. Помни: клиент пришёл после видео про Алдар Көсе — можешь упомянуть это как точку контакта
11. Если клиент хочет пакет услуг — предложи комбо со скидкой (например, сайт + карточки + бот)
12. Подчёркивай что OrkenAI использует AI — поэтому быстрее и доступнее чем обычные агентства

📏 ФОРМАТ ОТВЕТОВ:
- Короткие сообщения (2-4 предложения), как в мессенджере
- Не пиши длинные списки и стены текста
- Отвечай как в живом чате, а не как в email

⚠️ ОГРАНИЧЕНИЯ:
- НЕ обещай то, что не можешь выполнить
- НЕ давай скидки больше 15% без согласования (можешь сказать "обсужу с командой")
- НЕ обсуждай конкурентов
- Если вопрос вне компетенции — вежливо перенаправь к менеджеру`;
}

// ==========================================
//  Получение профиля Instagram
// ==========================================
async function getInstagramProfile(userId) {
  try {
    const response = await fetch(
      `https://graph.instagram.com/v21.0/${userId}?fields=name,username,biography,follower_count,media_count,website,category&access_token=${IG_TOKEN}`
    );
    const data = await response.json();
    if (data.error) {
      console.log('ℹ️ Instagram profile not available:', data.error.message);
      return null;
    }
    console.log('👤 Instagram profile loaded:', data.username || userId);
    return data;
  } catch (err) {
    console.log('ℹ️ Could not fetch profile:', err.message);
    return null;
  }
}

// ==========================================
//  Запрос к Claude Sonnet API
// ==========================================
async function chatWithClaude(systemPrompt, conversationHistory) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages: conversationHistory
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('❌ Claude API Error:', data.error.message);
      return null;
    }

    const reply = data.content?.[0]?.text;
    console.log('🧠 Claude response generated, length:', reply?.length);
    return reply;
  } catch (err) {
    console.error('❌ Claude API Error:', err.message);
    return null;
  }
}

// ==========================================
//  MAIN HANDLER
// ==========================================
export default async function handler(req, res) {

  // GET — Верификация Meta
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

  // POST — Входящие DM
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
              message: text || '[медиа]',
              timestamp: time
            }, null, 2));

            const session = getSession(senderId);

            // ─── ШАГ 1: Новый пользователь → Меню языков ───
            if (!session) {
              sessions.set(senderId, {
                step: 'awaiting_language',
                startedAt: Date.now(),
                history: [],
                profile: null
              });

              await sendReply(senderId, MENU_TEXT);
              await createAmoDeal(senderId, text || '[первое обращение]', time);
            }

            // ─── ШАГ 2: Выбор языка ───
            else if (session.step === 'awaiting_language') {
              const lang = LANGUAGES[text];

              if (lang) {
                const profile = await getInstagramProfile(senderId);

                sessions.set(senderId, {
                  step: 'active',
                  lang: lang.code,
                  langName: lang.name,
                  currency: lang.currency,
                  startedAt: session.startedAt,
                  history: [],
                  profile: profile,
                  systemPrompt: buildSystemPrompt(lang.code, profile)
                });

                const greetingMsg = `${lang.greeting}\n\n${lang.question}`;
                await sendReply(senderId, greetingMsg);
              } else {
                await sendReply(
                  senderId,
                  `⚠️ Тілді таңдаңыз (1-5) / Выберите язык (1-5):\n\n${MENU_TEXT}`
                );
              }
            }

            // ─── ШАГ 3: Активная сессия → Claude AI ───
            else if (session.step === 'active') {
              session.history.push({ role: 'user', content: text || '[медиа-файл]' });

              if (session.history.length > 20) {
                session.history = session.history.slice(-20);
              }

              const claudeReply = await chatWithClaude(
                session.systemPrompt,
                session.history
              );

              if (claudeReply) {
                session.history.push({ role: 'assistant', content: claudeReply });

                const chunks = splitMessage(claudeReply, 950);
                for (const chunk of chunks) {
                  await sendReply(senderId, chunk);
                }
              } else {
                const fallbacks = {
                  kz: '🙏 Менеджер жақын арада жауап береді!',
                  ru: '🙏 Менеджер ответит вам в ближайшее время!',
                  en: '🙏 Sorry, minor technical issue. Our manager will reply shortly!',
                  uz: "🙏 Uzr, texnik nosozlik. Menejer tez orada javob beradi!",
                  kg: '🙏 Кечиресиз, техникалык кыйынчылык. Менеджер жакында жооп берет!'
                };
                await sendReply(senderId, fallbacks[session.lang] || fallbacks['ru']);
              }

              sessions.set(senderId, session);

              await addNoteBySearch(
                senderId,
                `[${session.langName}] Клиент: ${text}${claudeReply ? '\n\n🤖 AI: ' + claudeReply : ''}`,
                time
              );
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
//  Разбивка длинных сообщений
// ==========================================
function splitMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < maxLength * 0.5) {
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitAt < maxLength * 0.3) {
      splitAt = maxLength;
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trim();
  }

  return chunks;
}


// ==========================================
//  Отправка сообщения в Instagram
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
      console.error('❌ IG API Error:', data.error.message);
    } else {
      console.log('📤 Sent to:', recipientId);
    }
  } catch (err) {
    console.error('❌ IG sendReply Error:', err.message);
  }
}


// ==========================================
//  amoCRM: Создание сделки
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
                  values: [{ value: senderId, enum_code: "OTHER" }]
                }
              ]
            }
          ],
          tags: [
            { name: "instagram" },
            { name: "orkenai-bot" },
            { name: "aldar-kose" },
            { name: "ai-sales" }
          ]
        }
      }
    ];

    const resp = await fetch(`${AMO_BASE_URL}/api/v4/leads/complex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AMO_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (resp.ok) {
      const leadId = data[0]?.id;
      console.log('✅ amoCRM lead created, ID:', leadId);
      if (leadId) {
        await addNoteToLead(leadId, messageText, time);
      }
    } else {
      console.error('❌ amoCRM Lead Error:', JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ amoCRM Error:', err.message);
  }
}


// ==========================================
//  amoCRM: Поиск сделки и добавление примечания
// ==========================================
async function addNoteBySearch(senderId, noteText, time) {
  try {
    const searchResp = await fetch(
      `${AMO_BASE_URL}/api/v4/leads?query=Instagram%20DM%20%E2%80%94%20OrkenAI&limit=1`,
      {
        headers: { 'Authorization': `Bearer ${AMO_TOKEN}` }
      }
    );

    const searchData = await searchResp.json();
    const leadId = searchData?._embedded?.leads?.[0]?.id;

    if (leadId) {
      await addNoteToLead(leadId, noteText, time);
    } else {
      await createAmoDeal(senderId, noteText, time);
    }
  } catch (err) {
    console.error('❌ amoCRM search Error:', err.message);
    await createAmoDeal(senderId, noteText, time);
  }
}


// ==========================================
//  amoCRM: Добавление примечания
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

    const resp = await fetch(
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

    if (resp.ok) {
      console.log('📝 amoCRM note added to lead', leadId);
    } else {
      const errData = await resp.json();
      console.error('❌ amoCRM Note Error:', JSON.stringify(errData));
    }
  } catch (err) {
    console.error('❌ amoCRM Note Error:', err.message);
  }
}
