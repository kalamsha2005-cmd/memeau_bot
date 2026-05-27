require('dotenv').config(); 
const TelegramBot = require('node-telegram-bot-api'); 
const { GoogleGenerativeAI } = require('@google/generative-ai'); 

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("ОШИБКА: Токен бота отсутствует в переменных окружения!");
  process.exit(1);
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true }); 
console.log("БОТ ЗАПУЩЕН С ИИ, МЕНЮ И КАРТИНКАМИ"); 

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const usersState = {};

// Сочные картинки, которые гарантированно откроются в Telegram
const IMAGES = {
  welcome: 'https://imgflip.com', // Мем "Я у мамы хакер"
  fail: 'https://imgflip.com', // Мем "Всё горит, а я ок"
  success: 'https://imgflip.com', // Мем с Мега-мозгом
  winStatus: 'https://imgflip.com', // Гига-Фаундер
  loseStatus: 'https://imgflip.com' // Выгоревший программист
};

// Меню команд в углу
bot.setMyCommands([
  { command: '/start', description: 'Перезапустить бота и открыть меню' },
  { command: '/meme', description: 'Сгенерировать случайный ИИ-мем' }
]).catch(e => console.error(e));

// Главное меню с большими кнопками
function sendMainMenu(chatId) {
  const opts = {
    reply_markup: {
      keyboard: [
        [{ text: '🎮 Начать ИИ-Симулятор' }],
        [{ text: '🤖 Спросить ИИ Mira' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  bot.sendPhoto(chatId, IMAGES.welcome, {
    caption: "Привет 😄 Я твой интерактивный ИИ-ассистент!\n\nИспользуй кнопки внизу экрана для управления бота:",
    ...opts
  }).catch(e => console.error(e));
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  if (text === '/start') {
    return sendMainMenu(chatId);
  }

  if (text === '/meme' || text === '🤖 Спросить ИИ Mira') {
    return generateAndSendMeme(chatId);
  }

  if (text === '🎮 Начать ИИ-Симулятор') {
    usersState[chatId] = { step: 1, hp: 100, score: 0 };
    return generateQuestStep(chatId);
  }
});

// Генерация мема через ИИ
async function generateAndSendMeme(chatId) {
  const loadingMsg = await bot.sendMessage(chatId, "🤖 *ИИ-агент Mira формулирует ответ...*", { parse_mode: 'Markdown' });
  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = "Ты — официальный ИИ-агент Mira (@mira). Придумай один короткий, смешной текстовый мем на русском про программистов, дедлайны и то, как экосистема Mira спасает проекты. В конце добавь: 'Используй @mira'.";
    const result = await model.generateContent(prompt);
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    bot.sendMessage(chatId, result.response.text());
  } catch (error) {
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    bot.sendMessage(chatId, "💀 Ошибка ИИ. Попробуй еще раз!");
  }
}

// Генерация шага квеста через ИИ
async function generateQuestStep(chatId) {
  const loadingMsg = await bot.sendMessage(chatId, "⏳ *ИИ Mira придумывает для тебя испытание...*");
  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Ты — ведущий геймдизайнер текстового квеста 'Симулятор выживания разработчика'. 
    Придумай ОДНУ случайную стрессовую ИТ-ситуацию (про дедлайны, код, баги, заказчиков или преподов).
    Формат вывода строго в виде JSON-строки БЕЗ форматирования markdown и БЕЗ символов \`\`\`:
    {"situation": "Текст ситуации со смайликами", "text_a": "Вариант А (плохой)", "text_b": "Вариант Б (хороший с Mira)"}`;

    const result = await model.generateContent(prompt);
    let cleanText = result.response.text().trim();
    cleanText = cleanText.replace(/```json|```/gi, "").trim();
    
    const questData = JSON.parse(cleanText);
    usersState[chatId].currentQuest = questData;

    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: `A: ${questData.text_a}`, callback_data: 'click_a' }],
          [{ text: `B: ${questData.text_b}`, callback_data: 'click_b' }]
        ]
      }
    };

    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    bot.sendMessage(chatId, `🎮 **ИТ-СИМУЛЯТОР: ШАГ ${usersState[chatId].step}**\n\n${questData.situation}`, { parse_mode: 'Markdown', ...opts });
  } catch (e) {
    console.error(e);
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    bot.sendMessage(chatId, "💥 Не удалось сгенерировать шаг. Нажми кнопку симулятора ещё раз.");
  }
}

// Обработка кликов (ИСПРАВЛЕНО!)
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  if (data === 'click_a' || data === 'click_b') {
    if (!usersState[chatId]) return sendMainMenu(chatId);

    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chatId, messageId: msg.message_id }).catch(() => {});

    if (data === 'click_a') {
      usersState[chatId].hp -= 35;
      await bot.sendPhoto(chatId, IMAGES.fail, { 
        caption: "💔 *Плохой выбор!*\nТы потратил кучу нервов, выгорел и потерял -35 HP.", 
        parse_mode: 'Markdown' 
      }).catch(() => {});
    } else {
      usersState[chatId].score += 50;
      await bot.sendPhoto(chatId, IMAGES.success, { 
        caption: "🚀 *Отличный выбор!*\nИнструменты Mira помогли решить проблему! Ты получил +50 к продуктивности.", 
        parse_mode: 'Markdown' 
      }).catch(() => {});
    }

    usersState[chatId].step += 1;

    setTimeout(() => {
      if (usersState[chatId].step <= 3) {
        generateQuestStep(chatId);
      } else {
        const finalHp = usersState[chatId].hp;
        const finalScore = usersState[chatId].score;
        const total = finalHp + finalScore;
        
        let status = total >= 150 ? "👑 ГИГА-ФАУНДЕР" : total >= 80 ? "🧠 СВЕРХСОЗНАНИЕ" : "💀 ТИМЛИД-ВЫГОРАШ";
        let finalImage = total >= 80 ? IMAGES.winStatus : IMAGES.loseStatus;

        const finalOpts = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔥 Активировать 1 месяц Mira Pro', url: 'https://t.me' }],
              [{ text: '📢 Поделиться результатом', switch_inline_query: `Я прошел ИТ-симулятор и получил статус: ${status}. Проверить себя: ` }]
            ]
          }
        };

        bot.sendPhoto(chatId, finalImage, {
          caption: `🏁 **ФИНАЛ ИГРЫ**\n\n🏆 Твой мемный статус: **${status}**\n\n🛡️ Здоровье: ${finalHp} HP\n📈 Продуктивность: ${finalScore}\n\n🤖 *Гайд по выживанию от @mira:*\nБез нормального таск-менеджера долго не протянуть. Запускай экосистему @mira с промокодом **MIRAGROWTH2026** и лети в космос!`,
          parse_mode: 'Markdown',
          ...finalOpts
        }).catch(() => {});
        
        delete usersState[chatId];
      }
    }, 2000);
  }
});

const http = require('http');
const server = http.createServer((req, res) => { res.writeHead(200); res.end('Bot is running!\n'); });
server.listen(process.env.PORT || 3000, () => { console.log('Server running'); });
