# 🤖 OrkenAI Instagram Bot

Webhook-бот для отслеживания клиентов из Instagram Direct Messages.

## 📌 Что делает

- ✅ Принимает входящие DM из Instagram через Webhook
- ✅ Логирует каждое сообщение как лид
- ✅ Отправляет автоматический ответ клиенту
- 🔜 Интеграция с CRM (amoCRM / Bitrix24)
- 🔜 Логирование в Google Sheets

---

## 🚀 Быстрый старт

### 1. Клонируй репозиторий

```bash
git clone https://github.com/YOUR_USERNAME/orkenai-instagram-bot.git
cd orkenai-instagram-bot
```

### 2. Скопируй переменные окружения

```bash
cp .env.example .env
```

Заполни `.env`:
- `VERIFY_TOKEN` — любой секретный токен
- `INSTAGRAM_ACCESS_TOKEN` — токен из Meta App Dashboard

### 3. Деплой на Vercel

```bash
npm i -g vercel    # если ещё не установлен
vercel             # первый деплой
vercel --prod      # продакшен деплой
```

### 4. Добавь переменные в Vercel

Через CLI:
```bash
vercel env add VERIFY_TOKEN
vercel env add INSTAGRAM_ACCESS_TOKEN
```

Или через Vercel Dashboard → Settings → Environment Variables

### 5. Настрой Webhook в Meta

В Meta App Dashboard → Instagram → Webhooks:

| Поле | Значение |
|------|---------|
| URL обратного вызова | `https://orkenai-instagram-bot.vercel.app/api/webhook` |
| Подтверждение маркера | Значение VERIFY_TOKEN из .env |

---

## 📁 Структура проекта

```
orkenai-instagram-bot/
├── api/
│   └── webhook.js        ← Основной webhook (GET + POST)
├── .env.example           ← Шаблон переменных окружения
├── .gitignore             ← Игнор для Git
├── package.json           ← Конфигурация проекта
├── vercel.json            ← Маршруты Vercel
└── README.md              ← Этот файл
```

---

## 🔧 Переменные окружения

| Переменная | Описание |
|-----------|---------|
| `VERIFY_TOKEN` | Секретный токен для верификации webhook |
| `INSTAGRAM_ACCESS_TOKEN` | Токен доступа из Meta App Dashboard |

---

## 📊 Логика обработки DM

```
Клиент пишет DM в Instagram
        ↓
Meta отправляет POST на /api/webhook
        ↓
Бот логирует: senderId, текст, время
        ↓
Бот отправляет автоответ
        ↓
(TODO) Лид уходит в CRM
```

---

## 📝 Лицензия

MIT — OrkenAI © 2026
