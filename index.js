require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
// Используем актуальный класс GoogleGenAI из библиотеки
const { GoogleGenAI } = require('@google/generative-ai'); 
const http = require('http');

if (!process.env.TELEGRAM_BOT_TOKEN) { console.error("Нет TELEGRAM_BOT_TOKEN"); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { console.error("Нет GEMINI_API_KEY"); process.exit(1); }

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); 

// Глобальное объявление модели, чтобы методы квеста и мемов имели к ней доступ
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const usersState = {};
const userCooldown = {};
const AI_TIMEOUT = 15000;

console.log("БОТ ИНИЦИАЛИЗИРОВАН!");

// Вспомогательная функция таймаута
function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs)
    )
  ]);
}

// Восстановленная функция askGemini
async function askGemini(userQuestion) {
  try {
    const systemInstruction = "Ты — Mira, продвинутый ИИ-ассистент в Telegram-боте. Ты общаешься с IT-юмором, дружелюбно и профессионально.";
    
    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userQuestion }] }],
        generationConfig: { systemInstruction: systemInstruction }
      }),
      AI_TIMEOUT
    );

    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("ПОЛНЫЙ ЛОГ ОШИБКИ GEMINI:", error);
    return "🚨 Ошибка Gemini API. Возможно, не задан GEMINI_API_KEY в Environment Variables или лимиты исчерпаны.";
  }
}

async function generateMemeDataFromGemini(userMemeRequest) {
  try {
    const prompt = `User wants an IT meme about: "${userMemeRequest}". Output STRICTLY in this format, separated by "//": [English Image Description] // [Russian Funny Joke]`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const parts = response.text().split('//');
    return {
      englishPrompt: parts[0] ? parts[0].trim() : "A funny programmer stressed at desk, digital art",
      russianJoke: parts[1] ? parts[1].trim() : "Когда дедлайн близко, а код не работает..."
    };
  } catch (error) {
    console.error("ПОЛНЫЙ ЛОГ ОШИБКИ МЕМ-GEMINI:", error);
    return { englishPrompt: "A funny programmer stressed at desk, digital art", russianJoke: "Дедлайн близко! Работаем!" };
  }
}

// =========================
// Команды
// =========================

bot.telegram.setMyCommands([
  { command: 'start', description: 'Открыть главное меню' },
  { command: 'meme', description: 'Сгенерировать ИИ-мем' }
]);

// =========================
// Главное меню
// =========================

async function sendMainMenu(ctx) {
  try {
    const welcomeText = 
      "👋 **Привет! Я Mira — твой интерактивный ИИ-ассистент.**\n\n" +
      "Я создана специально для IT-специалистов, чтобы разгрузить твой мозг и поднять настроение! 🚀\n\n" +
      "🌟 **Что я умею:**\n" +
      "• Проводить тебя через реалистичный **IT-Симулятор (квест)**\n" +
      "• Генерировать **смешные IT-мемы и картинки** по твоему запросу\n" +
      "• Отвечать на любые сложные технические вопросы\n\n" +
      "Выбери нужный режим на клавиатуре ниже, чтобы начать! 👇";

    await ctx.reply(welcomeText, {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        ['🎮 Начать ИИ-Симулятор'],
        ['🤖 Спросить ИИ Mira']
      ])
      .resize()
      .persistent()
    });

    console.log(`[Menu] Приветствие успешно отправлено для ${ctx.chat.id}`);
  } catch (e) {
    console.error("[Menu Error]", e);
  }
}

// =========================
// START / MEME COMMANDS
// =========================

bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  delete usersState[chatId];
  await sendMainMenu(ctx);
});

bot.command('meme', async (ctx) => {
  const chatId = ctx.chat.id;
  delete usersState[chatId];
  await generateAndSendMeme(ctx);
});

// =========================
// TEXT HANDLERS
// =========================

bot.hears('🤖 Спросить ИИ Mira', async (ctx) => {
  const chatId = ctx.chat.id;
  if (!usersState[chatId]) usersState[chatId] = { hp: 100, score: 0, step: 1 };
  usersState[chatId].isWaitingForQuestion = true;
  await ctx.reply('🤖 Я готова! Напиши свой вопрос, или попроси меня сгенерировать IT-мем/картинку (например: "сгенерируй мем про дедлайн").');
});

bot.hears('🎮 Начать ИИ-Симулятор', async (ctx) => {
  const chatId = ctx.chat.id;
  usersState[chatId] = { hp: 100, score: 0, step: 1, isWaitingForQuestion: false }; 
  return generateQuestStep(ctx);
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const userText = ctx.message.text;
  const userTextLower = userText.toLowerCase();

  if (!usersState[chatId]) {
    usersState[chatId] = { hp: 100, score: 0, step: 1, isWaitingForQuestion: false };
  }

  // Приоритет для системных кнопок меню
  if (userText.startsWith('/') || userTextLower.includes('симулятор') || userTextLower.includes('мем') || userTextLower.includes('спросить') || userTextLower.includes('старт') || userText.includes('🎮') || userText.includes('🤖') || userText.includes('❤️')) {
    usersState[chatId].isWaitingForQuestion = false; 
    return; 
  }

  // Логика свободного текстового ввода для ИИ
  if (usersState[chatId].isWaitingForQuestion) {
    try {
      if (userTextLower.includes('картинка') || userTextLower.includes('нарисуй') || userTextLower.includes('сгенерируй') || userTextLower.includes('дорисуй')) {
        await ctx.sendChatAction('typing');
        const memeData = await generateMemeDataFromGemini(userText);
        await ctx.sendChatAction('upload_photo');

        const encodedPrompt = encodeURIComponent(memeData.englishPrompt);
        // Исправлена интерполяция строки (добавлен знак доллара $)
        const imageUrl = `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000)}`;

        await ctx.replyWithPhoto(imageUrl, {
          caption: `🚀 **Ваш интерактивный мем готов!**\n\n🎯 *Запрос:* "${userText}"\n\n💬 **Шутка от Mira:**\n_${memeData.russianJoke}_\n\n🤖 _(ИИ сгенерировал сцену: ${memeData.englishPrompt})_`,
          parse_mode: 'Markdown'
        });
      } else {
        await ctx.sendChatAction('typing');
        const aiResponse = await askGemini(userText);
        await ctx.reply(aiResponse);
      }
    } catch (error) {
      console.error("Ошибка ИИ режима:", error);
      await ctx.reply("🚨 Произошла ошибка ИИ. Попробуйте еще раз.");
      usersState[chatId].isWaitingForQuestion = false;
    }
    return;
  }
});

// =========================
// Meme Generator
// =========================

async function generateAndSendMeme(ctx) {
  const chatId = ctx.chat.id;

  if (userCooldown[chatId] && Date.now() - userCooldown[chatId] < 2000) {
    return ctx.reply("⏳ Слишком быстро! Подожди пару секунд.");
  }
  userCooldown[chatId] = Date.now();

  let loadingMsg;
  try {
    loadingMsg = await ctx.reply("🤖 ИИ-агент Mira формулирует ответ...");

    const prompt = `Ты — официальный ИИ-агент Mira (@mira). Придумай короткий смешной мем на русском про программистов, дедлайны и экосистему Mira. В конце добавь: "Используй @mira"`;

    const result = await withTimeout(
      model.generateContent(prompt),
      AI_TIMEOUT
    );

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    await ctx.reply(result.response.text());

  } catch (error) {
    console.error("[Meme Error]", error);
    if (loadingMsg) {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    }
    const msg = error.message === "Timeout" ? "⏰ ИИ слишком долго думает" : "💀 ИИ Mira ушел на перезагрузку";
    await ctx.reply(msg);
  }
}

// =========================
// Quest Generator
// =========================

async function generateQuestStep(ctx) {
  const chatId = ctx.chat.id;

  if (userCooldown[chatId] && Date.now() - userCooldown[chatId] < 2000) {
    return ctx.reply("⏳ Подожди пару секунд.");
  }
  userCooldown[chatId] = Date.now();

  let loadingMsg;
  try {
    loadingMsg = await ctx.reply("⏳ ИИ Mira придумывает испытание...");

    const prompt = `Ты — геймдизайнер текстового ИТ-квеста. Сгенерируй одну стрессовую ИТ-ситуацию. Верни ТОЛЬКО JSON объекта без форматирования markdown: {"situation":"...", "text_a":"...", "text_b":"..."}`;

    const result = await withTimeout(
      model.generateContent(prompt),
      AI_TIMEOUT
    );

    let cleanText = result.response.text().replace(/```json|```/gi, "").trim();
    let questData;

    try {
      questData = JSON.parse(cleanText);
      if (!questData.situation || !questData.text_a || !questData.text_b) {
        throw new Error("Invalid JSON");
      }
    } catch (e) {
      console.error("[Quest Parse Error]", cleanText);
      questData = {
        situation: "🔥 Срочный баг в production!",
        text_a: "Патчить без тестов",
        text_b: "Использовать Mira"
      };
    }

    if (!usersState[chatId]) {
      usersState[chatId] = { hp: 100, score: 0, step: 1 };
    }
    usersState[chatId].currentQuest = questData;

    if (loadingMsg) {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    }

    await ctx.reply(
      `🎮 ИТ-СИМУЛЯТОР: ШАГ ${usersState[chatId].step}\n\n${questData.situation}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(`A: ${questData.text_a}`, 'click_a')],
        [Markup.button.callback(`B: ${questData.text_b}`, 'click_b')]
      ])
    );

  } catch (e) {
    console.error("[Quest Error]", e);
    if (loadingMsg) {
      await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    }
    const msg = e.message === "Timeout" ? "⏰ ИИ слишком долго думает" : "💥 Ошибка генерации";
    await ctx.reply(msg);
  }
}

// =========================
// CALLBACKS
// =========================

bot.action(['click_a', 'click_b'], async (ctx) => {
  const chatId = ctx.chat.id;
  const action = ctx.match[0];

  await ctx.answerCbQuery().catch(() => {});

  if (!usersState[chatId]) {
    return sendMainMenu(ctx);
  }

  if (usersState[chatId].locked) return;
  usersState[chatId].locked = true;

  let responseText = "";
  if (action === 'click_a') {
    usersState[chatId].hp -= 35;
    responseText = `💥 Плохой выбор!\n\n-35 HP\n❤️ HP: ${usersState[chatId].hp}`;
  } else {
    usersState[chatId].score += 50;
    responseText = `🚀 Отличный выбор!\n\n+50 продуктивности\n📈 Очки: ${usersState[chatId].score}`;
  }

  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (e) {
    console.log("[Edit Error]", e.message);
  }

  await ctx.reply(responseText);
  usersState[chatId].step += 1;

  setTimeout(async () => {
    if (!usersState[chatId]) return;
    usersState[chatId].locked = false;

    if (usersState[chatId].step <= 3) {
      await generateQuestStep(ctx);
    } else {
      await finishGame(ctx);
    }
  }, 1500);
});

// =========================
// Finish Game
// =========================

async function finishGame(ctx) {
  const chatId = ctx.chat.id;
  if (!usersState[chatId]) return;

  const finalHp = usersState[chatId].hp;
  const finalScore = usersState[chatId].score;
  const total = finalHp + finalScore;

  let status = total >= 150 ? "👑 ГИГА-ФАУНДЕР" : total >= 80 ? "🧠 СВЕРХСОЗНАНИЕ" : "💀 ТИМЛИД-ВЫГОРАШ";

  await ctx.reply(
    `🏁 ФИНАЛ ИГРЫ\n\n🏆 Статус: ${status}\n\n❤️ HP: ${finalHp}\n📈 Очки: ${finalScore}`,
    Markup.inlineKeyboard([
      [Markup.button.url('🔥 Mira Pro', 'https://t.me')],
      [Markup.button.switchToChat('📢 Поделиться', `Я получил статус ${status}`)]
    ])
  );

  delete usersState[chatId];
}

// =========================
// HTTP SERVER
// =========================

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running!\n');
});

server.listen(process.env.PORT || 3000, () => {
  console.log('Server running on port', process.env.PORT || 3000);
});

// =========================
// Launch
// =========================

bot.launch().then(() => {
  console.log("Telegraf bot successfully started");
});

// Процессы завершения кода...
process.on('unhandledRejection', (reason) => { console.error('Unhandled Rejection:', reason); });
process.on('uncaughtException', (error) => { console.error('Uncaught Exception:', error); });

const shutdown = (signal) => {
  console.log(`Stopping bot via ${signal}...`);
  bot.stop(signal);
  server.close(() => { process.exit(0); });
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM')); 