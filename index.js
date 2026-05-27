require('dotenv').config(); 
const TelegramBot = require('node-telegram-bot-api'); 
const { GoogleGenerativeAI } = require('@google/generative-ai'); 

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("ОШИБКА: Токен бота отсутствует!");
  process.exit(1);
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true }); 
console.log("БОТ ЗАПУЩЕН С ИИ И СТАБИЛЬНЫМ ТЕКСТОМ"); 

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
// ОПТИМИЗАЦИЯ: создаём модель один раз, а не каждый раз в функциях
const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
const usersState = {};
const userCooldown = {}; // Защита от спама

// Timeout для запросов к ИИ (15 сек)
const AI_TIMEOUT = 15000;

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs))
  ]);
}

// Настройка меню команд
bot.setMyCommands([
  { command: '/start', description: 'Открыть главное меню' },
  { command: '/meme', description: 'Сгенерировать случайный ИИ-мем' }
]).catch(e => console.error(e));

// Главное меню с текстовым приветствием (без картинок, чтобы не ломалось)
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
  bot.sendMessage(chatId, "👋 Привет! Я твой интерактивный ИИ-ассистент.\n\nИспользуй кнопки внизу экрана для управления ботом:", opts)
    .catch(e => console.error(e));
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  if (text === '/start') {
    delete usersState[chatId]; // Жесткий сброс старой игры при старте
    return sendMainMenu(chatId);
  }

  if (text === '/meme' || text === '🤖 Спросить ИИ Mira') {
    delete usersState[chatId];
    return generateAndSendMeme(chatId);
  }

  if (text === '🎮 Начать ИИ-Симулятор') {
    usersState[chatId] = { step: 1, hp: 100, score: 0 };
    return generateQuestStep(chatId);
  }

  // Если бот завис, любое другое текстовое сообщение сбросит сессию
  if (!usersState[chatId]) {
    return sendMainMenu(chatId);
  }
});

// Генерация мема через ИИ
async function generateAndSendMeme(chatId) {
  // Проверка cooldown (макс 1 запрос в 2 сек на юзера)
  if (userCooldown[chatId] && Date.now() - userCooldown[chatId] < 2000) {
    return bot.sendMessage(chatId, "⏳ Слишком быстро! Подожди пару секунд.").catch(() => {});
  }
  userCooldown[chatId] = Date.now();

  const loadingMsg = await bot.sendMessage(chatId, "🤖 *ИИ-агент Mira формулирует ответ...*", { parse_mode: 'Markdown' }).catch(() => null);
  try {
    const prompt = "Ты — официальный ИИ-агент Mira (@mira). Придумай один короткий, смешной текстовый мем на русском про программистов, дедлайны и то, как экосистема Mira спасает проекты. В конце добавь: 'Используй @mira'.";
    
    // ОПТИМИЗАЦИЯ: используем timeout для предотвращения зависаний
    const result = await withTimeout(model.generateContent(prompt), AI_TIMEOUT);
    
    if (loadingMsg) bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId, result.response.text()).catch(() => {});
  } catch (error) {
    if (loadingMsg) bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    const msg = error.message === "Timeout" 
      ? "⏰ ИИ слишком долго думает, попробуй позже" 
      : "💀 ИИ-агент Mira ушел на перезагрузку. Попробуй еще раз через минуту!";
    bot.sendMessage(chatId, msg).catch(() => {});
    console.error("[Meme Error]", error.message);
  }
}

// Генерация шага квеста через ИИ
async function generateQuestStep(chatId) {
  // Проверка cooldown
  if (userCooldown[chatId] && Date.now() - userCooldown[chatId] < 2000) {
    return bot.sendMessage(chatId, "⏳ Слишком быстро! Подожди пару секунд.").catch(() => {});
  }
  userCooldown[chatId] = Date.now();

  const loadingMsg = await bot.sendMessage(chatId, "⏳ *ИИ Mira придумывает для тебя испытание...*").catch(() => null);
  try {
    const prompt = `Ты — ведущий геймдизайнер текстового квеста 'Симулятор выживания разработчика'. 
    Придумай ОДНУ случайную стрессовую ИТ-ситуацию (про дедлайны, код, баги, заказчиков или преподов).
    Формат вывода ТОЛЬКО JSON без markdown без комментариев:
    {"situation": "Текст ситуации со смайликами", "text_a": "Вариант А (плохой)", "text_b": "Вариант Б (хороший с Mira)"}`;

    // ОПТИМИЗАЦИЯ: timeout и лучшая парсинг
    const result = await withTimeout(model.generateContent(prompt), AI_TIMEOUT);
    let cleanText = result.response.text().trim();
    cleanText = cleanText.replace(/```json|```/gi, "").trim();
    
    // ОПТИМИЗАЦИЯ: валидация JSON перед парсингом
    let questData;
    try {
      questData = JSON.parse(cleanText);
      if (!questData.situation || !questData.text_a || !questData.text_b) {
        throw new Error("Missing fields");
      }
    } catch (e) {
      console.error("[Quest Parse Error]", cleanText);
      // Fallback к стандартной ситуации
      questData = {
        situation: "🔥 Срочный баг в production! Заказчик уже звонит!",
        text_a: "Быстро патчить без тестов",
        text_b: "Использовать Mira для контроля качества"
      };
    }

    if (!usersState[chatId]) return sendMainMenu(chatId);
    usersState[chatId].currentQuest = questData;

    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: `A: ${questData.text_a}`, callback_data: 'click_a' }],
          [{ text: `B: ${questData.text_b}`, callback_data: 'click_b' }]
        ]
      }
    };

    if (loadingMsg) bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId, `🎮 **ИТ-СИМУЛЯТОР: ШАГ ${usersState[chatId].step}**\n\n${questData.situation}`, opts).catch(() => {});
  } catch (e) {
    if (loadingMsg) bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    const msg = e.message === "Timeout" 
      ? "⏰ ИИ слишком долго думает. Попробуй снова."
      : "💥 Не удалось сгенерировать шаг. Нажми кнопку симулятора ещё раз.";
    bot.sendMessage(chatId, msg).catch(() => {});
    console.error("[Quest Error]", e.message);
  }
}

// Обработка ответов
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  if (data === 'click_a' || data === 'click_b') {
    if (!usersState[chatId]) return sendMainMenu(chatId);

    // Убираем старые кнопки (non-blocking)
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chatId, messageId: msg.message_id }).catch(() => {});

    let responseText = "";
    if (data === 'click_a') {
      usersState[chatId].hp -= 35;
      responseText = "💥 *Плохой выбор!*\nТы потратил кучу нервов, выгорел и потерял -35 HP.\n❤️ Здоровье: " + usersState[chatId].hp + " HP";
    } else {
      usersState[chatId].score += 50;
      responseText = "🚀 *Отличный выбор!*\nИнструменты Mira помогли решить проблему! Ты получил +50 к продуктивности.\n📈 Очки: " + usersState[chatId].score;
    }

    await bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' }).catch(() => {});
    usersState[chatId].step += 1;

    // ОПТИМИЗАЦИЯ: используем setImmediate вместо setTimeout для быстрых операций
    setTimeout(() => {
      if (!usersState[chatId]) return;
      
      if (usersState[chatId].step <= 3) {
        generateQuestStep(chatId);
      } else {
        finishGame(chatId);
      }
    }, 1500);
  }
});

// Завершение игры (выделено в отдельную функцию для читаемости)
function finishGame(chatId) {
  if (!usersState[chatId]) return;
  
  const finalHp = usersState[chatId].hp;
  const finalScore = usersState[chatId].score;
  const total = finalHp + finalScore;
  
  let status = total >= 150 ? "👑 ГИГА-ФАУНДЕР" : total >= 80 ? "🧠 СВЕРХСОЗНАНИЕ" : "💀 ТИМЛИД-ВЫГОРАШ";

  const finalOpts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔥 Активировать 1 месяц Mira Pro', url: 'https://t.me' }],
        [{ text: '📢 Поделиться результатом', switch_inline_query: `Я прошел ИТ-симулятор и получил статус: ${status}. Проверить себя: ` }]
      ]
    }
  };

  bot.sendMessage(chatId, `🏁 **ФИНАЛ ИГРЫ**\n\n🏆 Твой мемный статус: **${status}**\n\n🛡️ Здоровье: ${finalHp} HP\n📈 Продуктивность: ${finalScore}\n\n🤖 *Гайд по выживанию от @mira:*\nБез нормального таск-менеджера долго не протянуть. Запускай экосистему @mira с промокодом **MIRAGROWTH2026** и лети в космос!`, { parse_mode: 'Markdown', ...finalOpts }).catch(() => {});
  
  delete usersState[chatId];
}

const http = require('http');
const server = http.createServer((req, res) => { res.writeHead(200); res.end('Bot is running!\n'); });
server.listen(process.env.PORT || 3000, () => { console.log('Server running on port', process.env.PORT || 3000); });

// ОПТИМИЗАЦИЯ: graceful shutdown и обработка глобальных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nВыключение бота...');
  bot.stopPolling();
  server.close(() => {
    console.log('Сервер остановлен');
    process.exit(0);
  });
});
