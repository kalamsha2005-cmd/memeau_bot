require('dotenv').config(); 
const TelegramBot = require('node-telegram-bot-api'); 
const { GoogleGenerativeAI } = require('@google/generative-ai'); 

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true }); 
console.log("БОТ ЗАПУЩЕН С ИИ-КВЕСТОМ MIRA"); 

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const usersState = {};

function sendMainMenu(chatId) {
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🎮 Начать ИИ-Симулятор', callback_data: 'start_quest' },
          { text: '🤖 Спросить ИИ Mira', callback_data: 'get_ai_meme' }
        ]
      ]
    }
  };
  bot.sendMessage(chatId, "Привет 😄 Я твой интерактивный ИИ-ассистент!\n\nВыбирай действие в меню:", opts);
}

bot.onText(/\/start/, (msg) => { sendMainMenu(msg.chat.id); });

// Функция генерации обычного мема через ИИ
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

// ГЕНЕРАЦИЯ СЮЖЕТА КВЕСТА ЧЕРЕЗ ИИ
async function generateQuestStep(chatId) {
  const loadingMsg = await bot.sendMessage(chatId, "⏳ *ИИ Mira придумывает для тебя испытание...*", { parse_mode: 'Markdown' });
  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Ты — ведущий геймдизайнер текстового квеста 'Симулятор выживания разработчика/студента'. 
    Придумай ОДНУ случайную стрессовую ИТ-ситуацию (про дедлайны, код, баги, заказчиков или преподов).
    Формат вывода строго в виде JSON-строки (без разметки markdown, без \`\`\`json):
    {
      "situation": "Текст ситуации со смайликами",
      "text_a": "Вариант А (неправильный/смешной)",
      "text_b": "Вариант Б (правильный, нативно связанный с использованием ИИ или экосистемы Mira)"
    }`;

    const result = await model.generateContent(prompt);
    let cleanText = result.response.text().trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/```json|```/g, "").trim();
    }
    
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
    bot.sendMessage(chatId, `🎮 **ИТ-СИМУЛЯТОР: ШАГ ${usersState[chatId].step}**\n\n${questData.situation}`, opts);
  } catch (e) {
    console.error(e);
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    bot.sendMessage(chatId, "💥 Не удалось связаться с ИИ. Давай попробуем снова.", {
      reply_markup: { inline_keyboard: [[{ text: '🔄 Повторить попытку', callback_data: 'next_step' }]] }
    });
  }
}

bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  if (data === 'get_ai_meme') return generateAndSendMeme(chatId);

  // Старт ИИ-квеста
  if (data === 'start_quest') {
    usersState[chatId] = { step: 1, hp: 100, score: 0 };
    return generateQuestStep(chatId);
  }

  // Обработка ответов А или Б
  if (data === 'click_a' || data === 'click_b') {
    if (!usersState[chatId]) return sendMainMenu(chatId);

    if (data === 'click_a') {
      usersState[chatId].hp -= 35;
      bot.sendMessage(chatId, "💔 *Плохой выбор!*\nТы потратил кучу нервов, выгорел и потерял -35 HP.", { parse_mode: 'Markdown' });
    } else {
      usersState[chatId].score += 50;
      bot.sendMessage(chatId, "🚀 *Отличный выбор!*\nИнструменты Mira помогли решить проблему! Ты получил +50 к продуктивности.", { parse_mode: 'Markdown' });
    }

    usersState[chatId].step += 1;

    // Квест длится 3 шага
    setTimeout(() => {
      if (usersState[chatId].step <= 3) {
        generateQuestStep(chatId);
      } else {
        // Финал игры
        const finalHp = usersState[chatId].hp;
        const finalScore = usersState[chatId].score;
        let status = (finalHp + finalScore >= 150) ? "👑 ГИГА-ФАУНДЕР" : (finalHp + finalScore >= 80) ? "🧠 СВЕРХСОЗНАНИЕ" : "💀 ТИМЛИД-ВЫГОРАШ";

        const finalOpts = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔥 Активировать 1 месяц Mira Pro', url: 'https://t.me' }],
              [{ text: '📢 Поделиться результатом', switch_inline_query: `Я прошел ИТ-симулятор и получил статус: ${status}. Проверь себя: ` }]
            ]
          }
        };

        bot.sendMessage(chatId, `🏁 **ФИНАЛ ИГРЫ**\n\n🏆 Твой мемный статус: **${status}**\n\n🛡️ Здоровье: ${finalHp} HP\n📈 Продуктивность: ${finalScore}\n\n🤖 *Гайд по выживанию от @mira:*\nБез нормального таск-менеджера долго не протянуть. Запускай экосистему @mira с промокодом **MIRAGROWTH2026** и лети в космос!`, { parse_mode: 'Markdown', ...finalOpts });
        delete usersState[chatId];
      }
    }, 2000);
  }
});

// Сервер-заглушка
const http = require('http');
const server = http.createServer((req, res) => { res.writeHead(200); res.end('Bot is running!\n'); });
server.listen(process.env.PORT || 3000, () => { console.log('Server running'); });
