require('dotenv').config(); 
const TelegramBot = require('node-telegram-bot-api'); 
const { GoogleGenAI } = require('@google/generative-ai'); 

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true }); 
console.log("БОТ ЗАПУЩЕН С ИИ-АГЕНТОМ MIRA"); 

// Инициализируем ИИ с ключом из Render
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const usersState = {};

// Главное меню бота
function sendMainMenu(chatId) {
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🎮 Начать IT-Симулятор', callback_data: 'start_quest' },
          { text: '🤖 Спросить ИИ Mira', callback_data: 'get_ai_meme' }
        ]
      ]
    }
  };
  bot.sendMessage(chatId, "Привет 😄 Я интерактивный бот с искусственным интеллектом!\n\nВыбирай: сыграть в симулятор выживания или протестировать генерацию контента от ИИ Mira:", opts);
}

bot.onText(/\/start/, (msg) => {
  sendMainMenu(msg.chat.id);
});

bot.onText(/\/meme/, async (msg) => {
  generateAndSendMeme(msg.chat.id);
});

// Функция запроса к ИИ (имитация агента Mira)
async function generateAndSendMeme(chatId) {
  const loadingMsg = await bot.sendMessage(chatId, "🤖 *ИИ-агент Mira формулирует ответ...*", { parse_mode: 'Markdown' });
  
  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    // Брендированный промпт под экосистему Mira
    const prompt = "Ты — официальный ИИ-агент Mira (@mira), персональный AI-ассистент, который превращает разговоры в действия. Придумай ОДИН короткий, смешной и супер-жизненный текстовый мем или шутку на русском языке. Тематика: дедлайны, выгорание программистов или студентов, хаос в задачах и то, как экосистема Mira спасает проекты. В конце шутки нативно добавь фразу в духе: 'Чтобы автоматизировать задачи в реальности, используй @mira'. Используй эмодзи. Не пиши приветствий.";
    
    const result = await model.generateContent(prompt);
    const aiText = result.response.text();
    
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    bot.sendMessage(chatId, aiText);
  } catch (error) {
    console.error("Ошибка ИИ:", error);
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    bot.sendMessage(chatId, "💀 ИИ-агент Mira ушел на перезагрузку из-за наплыва задач. Попробуй через минуту!");
  }
}

// Обработка inline-кнопок
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  if (data === 'get_ai_meme') {
    return generateAndSendMeme(chatId);
  }

  // КВЕСТ: Шаг 1
  if (data === 'start_quest') {
    usersState[chatId] = { step: 1, hp: 100, score: 0 };
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'A: Лечь спать и надеяться на чудо 🛌', callback_data: 'q1_a' }],
          [{ text: 'B: Зайти в Mira и разрулить спринт через ИИ 🧠', callback_data: 'q1_b' }]
        ]
      }
    };
    return bot.sendMessage(chatId, "🎮 **ИТ-СИМУЛЯТОР: ШАГ 1**\n\n🕒 3 часа ночи. Завтра дедлайн MVP / сдачи лабы. Дизайнер ушел в запой, проджект менеджер плачет в углу. Твои действия?", { parse_mode: 'Markdown', ...opts });
  }

  // КВЕСТ: Логика Шага 1
  if (data === 'q1_a' || data === 'q1_b') {
    if (!usersState[chatId]) return sendMainMenu(chatId);

    if (data === 'q1_a') {
      usersState[chatId].hp -= 40;
      bot.sendMessage(chatId, "🔥 *Мем: Всё горит, а я ок.*\nТы проспал всё на свете. Проект сдан криво.\n💔 Здоровье: -40 HP", { parse_mode: 'Markdown' });
    } else {
      usersState[chatId].score += 50;
      bot.sendMessage(chatId, "🧠 *Мем: Мега-мозг.*\nТы распределил задачи с помощью ИИ в Mira за пару минут и спас дедлайн!\n🚀 Продуктивность: +50 очков", { parse_mode: 'Markdown' });
    }

    usersState[chatId].step = 2;
    setTimeout(() => {
      const opts = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'A: Начать спорить и выгореть 🤬', callback_data: 'q2_a' }],
            [{ text: 'B: Скормить правки ИИ-ассистенту в Mira 🤖', callback_data: 'q2_b' }]
          ]
        }
      };
      bot.sendMessage(chatId, "🎮 **ИТ-СИМУЛЯТОР: ШАГ 2**\n\n📐 Заказчик или препод просит \"поиграть со шрифтами\" и переписать ТЗ в пятый раз за день. Что делаешь?", { parse_mode: 'Markdown', ...opts });
    }, 1500);
    return;
  }

  // КВЕСТ: Логика Шага 2 -> Финал
  if (data === 'q2_a' || data === 'q2_b') {
    if (!usersState[chatId]) return sendMainMenu(chatId);

    if (data === 'q2_a') {
      usersState[chatId].hp -= 50;
      bot.sendMessage(chatId, "😭 Ты потратил кучу нервов, доказывая правоту. Шрифт остался прежним, но ты истощен.\n💔 Здоровье: -50 HP");
    } else {
      usersState[chatId].score += 50;
      bot.sendMessage(chatId, "⚡ ИИ в Mira пересобрал план за секунду. Заказчик доволен, ты спокоен!\n🚀 Продуктивность: +50 очков");
    }

    setTimeout(() => {
      if (!usersState[chatId]) return;
      const finalHp = usersState[chatId].hp;
      const finalScore = usersState[chatId].score;
      
      let status = "";
      let totalSurvival = finalHp + finalScore;

      if (totalSurvival >= 150) status = "👑 ГИГА-ФАУНДЕР (100% выживаемости)";
      else if (totalSurvival >= 80) status = "🧠 СТУДЕНТ-СВЕРХСОЗНАНИЕ (60% выживаемости)";
      else status = "💀 ТИМЛИД-ВЫГОРАШ (10% выживаемости)";

      const finalOpts = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔥 Активировать 1 месяц Mira Pro', url: 'https://t.me' }],
            [{ text: '📢 Поделиться результатом', switch_inline_query: `Я прошел ИТ-симулятор и получил статус: ${status}. Проверить себя: ` }]
          ]
        }
      };

      bot.sendMessage(chatId, `🏁 **ФИНАЛ ИГРЫ**\n\n🏆 Твой мемный статус: **${status}**\n\n🛡️ Оставшееся здоровье: ${finalHp} HP\n📈 Очки продуктивности: ${finalScore}\n\n🤖 *Гайд по выживанию от @mira:*\nТвой проект выжил, но без нормальных инструментов долго не протянуть. Жми кнопку ниже, запускай экосистему @mira с промокодом **MIRAGROWTH2026**, и твоя продуктивность улетит в космос!`, { parse_mode: 'Markdown', ...finalOpts });
      
      delete usersState[chatId];
    }, 1500);
    return;
  }
});

// HTTP Веб-сервер заглушка для хостинга Render
const http = require('http'); 
const port = process.env.PORT || 3000; 
const server = http.createServer((req, res) => { 
  res.writeHead(200, { 'Content-Type': 'text/plain' }); 
  res.end('Bot is running!\n'); 
}); 
server.listen(port, () => { 
  console.log(`Server running on port ${port}`); 
});
