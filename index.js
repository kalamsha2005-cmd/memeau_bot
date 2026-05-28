require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("ОШИБКА: TELEGRAM_BOT_TOKEN отсутствует!");
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error("ОШИБКА: GEMINI_API_KEY отсутствует!");
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

console.log("БОТ ЗАПУЩЕН С TELEGRAF + GEMINI");

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({
  model: "gemini-2.5-flash"
});

// 1. Возвращаем простую текстовую функцию askGemini (без JSON требований)
async function askGemini(userPrompt) {
  try {
    const genModel = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

    const systemInstruction = `Ты — Mira, продвинутый ИИ-ассистент в Telegram-боте. Ты общаешься с IT-юмором, дружелюбно и профессионально. Отвечай на вопрос пользователя.`;

    const fullPrompt = `${systemInstruction}\n\nВопрос пользователя: ${userPrompt}`;
    const result = await genModel.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Критическая ошибка askGemini:", error);
    return "🚨 Ошибка ИИ-модели. Проверь настройки на хостинге!";
  }
}

async function generateMemeDataFromGemini(userMemeRequest) {
  try {
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
User wants an IT meme about: "${userMemeRequest}".
1. Create a detailed visual scene description for an AI image generator in ENGLISH (max 40 words).
2. Create a funny, hilarious joke or caption for this meme in RUSSIAN.

Output your response STRICTLY in this format, separated by "//" and nothing else:
[English Image Prompt Here] // [Russian Meme Caption Here]

Example:
A funny cartoon of an exhausted programmer drinking 5 cups of coffee at a desk filled with red server errors, comic book style // Когда дедлайн уже завтра, а у тебя готов только дизайн кнопки "Выйти"
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const parts = response.text().split('//');

    return {
      englishPrompt: parts[0] ? parts[0].trim() : "A funny programmer stressed at desk, digital art",
      russianJoke: parts[1] ? parts[1].trim() : "Когда код не работает, а ты не знаешь почему..."
    };
  } catch (error) {
    console.error("Ошибка при генерации данных мема:", error);
    return {
      englishPrompt: "A funny programmer stressed at desk, digital art",
      russianJoke: "Дедлайн близко! Работаем в режиме ошпаренной кошки 🚀"
    };
  }
}

const usersState = {};
const userCooldown = {};

const AI_TIMEOUT = 15000;

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs)
    )
  ]);
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
    await ctx.reply(
      "👋 Привет! Я твой интерактивный ИИ-ассистент.\n\nИспользуй кнопки ниже:",
      Markup.keyboard([
        ['🎮 Начать ИИ-Симулятор'],
        ['🤖 Спросить ИИ Mira']
      ])
        .resize()
        .persistent()
    );
  } catch (e) {
    console.error("[Menu Error]", e);
  }
}

// =========================
// START
// =========================

bot.start(async (ctx) => {
  const chatId = ctx.chat.id;

  delete usersState[chatId];

  await sendMainMenu(ctx);
});

// =========================
// MEME
// =========================

bot.command('meme', async (ctx) => {
  const chatId = ctx.chat.id;

  delete usersState[chatId];

  await generateAndSendMeme(ctx);
});

// =========================
// TEXT
// =========================

// Обработчик нажатия на кнопку "Спросить ИИ Mira"
bot.hears('🤖 Спросить ИИ Mira', async (ctx) => {
  const chatId = ctx.chat.id;
  if (!usersState[chatId]) usersState[chatId] = { hp: 100, score: 0, step: 1 };
  usersState[chatId].isWaitingForQuestion = true;
  await ctx.reply('🤖 Я готова! Напиши свой вопрос, или попроси меня сгенерировать IT-мем/картинку (например: "сгенерируй мем про дедлайн").');
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  const userText = text.toLowerCase(); // переводим в нижний регистр для проверки

  if (!text) return;

  // Начать симулятор
  if (text === '🎮 Начать ИИ-Симулятор') {
    usersState[chatId] = {
      step: 1,
      hp: 100,
      score: 0
    };

    return generateQuestStep(ctx);
  }

  // Игнорируем служебные кнопки/команды, чтобы они не улетали в ИИ
  if (text.startsWith('/') ||
      text.includes('ИИ-Симулятор') ||
      text.includes('Спросить ИИ Mira')) {
    return;
  }

  if (!usersState[chatId]) {
    return sendMainMenu(ctx);
  }

  // 2. Глобальный обработчик текста с умным разделением на ТЕКСТ / КАРТИНКУ
  if (usersState[chatId].isWaitingForQuestion) {
    try {
      // ПРОВЕРКА: Если пользователь просит КАРТИНКУ или МЕМ
      if (userText.includes('мем') || userText.includes('картинка') || userText.includes('нарисуй') || userText.includes('сгенерируй')) {
        await ctx.sendChatAction('typing');

        // Получаем от новой модели и английский промпт, и русскую шутку
        const memeData = await generateMemeDataFromGemini(ctx.message.text);
        console.log("Сгенерированный промпт для мема:", memeData);

        await ctx.sendChatAction('upload_photo');
        const encodedPrompt = encodeURIComponent(memeData.englishPrompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000)}`;

        await ctx.replyWithPhoto(imageUrl, {
          caption: `🎬 **Ваш интерактивный мем готов!**\n\n🎯 *Запрос:* "${ctx.message.text}"\n\n💬 **Шутка от Mira:**\n_${memeData.russianJoke}_\n\n🤖 _(ИИ сгенерировал сцену: ${memeData.englishPrompt})_`,
          parse_mode: 'Markdown'
        });
      } else {
        // ОБЫЧНЫЙ ТЕКСТ: Просто отправляем в Gemini
        await ctx.sendChatAction('typing');
        const aiResponse = await askGemini(text);
        await ctx.reply(aiResponse);
      }
    } catch (error) {
      console.error("Ошибка обработчика:", error);
      await ctx.reply("🚨 Ошибка при обработке. Попробуй еще раз.");
    } finally {
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

  if (
    userCooldown[chatId] &&
    Date.now() - userCooldown[chatId] < 2000
  ) {
    return ctx.reply("⏳ Слишком быстро! Подожди пару секунд.");
  }

  userCooldown[chatId] = Date.now();

  let loadingMsg;

  try {
    loadingMsg = await ctx.reply(
      "🤖 ИИ-агент Mira формулирует ответ..."
    );

    const prompt = `
Ты — официальный ИИ-агент Mira (@mira).
Придумай короткий смешной мем на русском
про программистов, дедлайны и экосистему Mira.
В конце добавь:
"Используй @mira"
`;

    const result = await withTimeout(
      model.generateContent(prompt),
      AI_TIMEOUT
    );

    await ctx.telegram.deleteMessage(
      chatId,
      loadingMsg.message_id
    );

    await ctx.reply(result.response.text());

  } catch (error) {
    console.error("[Meme Error]", error);

    if (loadingMsg) {
      try {
        await ctx.telegram.deleteMessage(
          chatId,
          loadingMsg.message_id
        );
      } catch {}
    }

    const msg =
      error.message === "Timeout"
        ? "⏰ ИИ слишком долго думает"
        : "💀 ИИ Mira ушел на перезагрузку";

    await ctx.reply(msg);
  }
}

// =========================
// Quest Generator
// =========================

async function generateQuestStep(ctx) {
  const chatId = ctx.chat.id;

  if (
    userCooldown[chatId] &&
    Date.now() - userCooldown[chatId] < 2000
  ) {
    return ctx.reply("⏳ Подожди пару секунд.");
  }

  userCooldown[chatId] = Date.now();

  let loadingMsg;

  try {
    loadingMsg = await ctx.reply(
      "⏳ ИИ Mira придумывает испытание..."
    );

    const prompt = `
Ты — геймдизайнер текстового ИТ-квеста.

Сгенерируй одну стрессовую ИТ-ситуацию.

Верни ТОЛЬКО JSON:

{
  "situation":"...",
  "text_a":"...",
  "text_b":"..."
}
`;

    const result = await withTimeout(
      model.generateContent(prompt),
      AI_TIMEOUT
    );

    let cleanText = result.response.text()
      .replace(/```json|```/gi, "")
      .trim();

    let questData;

    try {
      questData = JSON.parse(cleanText);

      if (
        !questData.situation ||
        !questData.text_a ||
        !questData.text_b
      ) {
        throw new Error("Invalid JSON");
      }

    } catch (e) {
      console.error("[Quest Parse Error]", cleanText);

      questData = {
        situation:
          "🔥 Срочный баг в production!",
        text_a:
          "Патчить без тестов",
        text_b:
          "Использовать Mira"
      };
    }

    // Проверяем, существует ли пользователь в памяти. Если нет — создаем его структуру.
if (!usersState[chatId]) {
  usersState[chatId] = {
    hp: 100,
    score: 0,
    step: 1
  };
}

// Теперь это абсолютно безопасно, бот больше не упадет
usersState[chatId].currentQuest = questData;

    if (loadingMsg) {
      await ctx.telegram.deleteMessage(
        chatId,
        loadingMsg.message_id
      );
    }

    await ctx.reply(
      `🎮 ИТ-СИМУЛЯТОР: ШАГ ${usersState[chatId].step}\n\n${questData.situation}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `A: ${questData.text_a}`,
            'click_a'
          )
        ],
        [
          Markup.button.callback(
            `B: ${questData.text_b}`,
            'click_b'
          )
        ]
      ])
    );

  } catch (e) {
    console.error("[Quest Error]", e);

    if (loadingMsg) {
      try {
        await ctx.telegram.deleteMessage(
          chatId,
          loadingMsg.message_id
        );
      } catch {}
    }

    const msg =
      e.message === "Timeout"
        ? "⏰ ИИ слишком долго думает"
        : "💥 Ошибка генерации";

    await ctx.reply(msg);
  }
}

// =========================
// CALLBACKS
// =========================

bot.action(['click_a', 'click_b'], async (ctx) => {
  const chatId = ctx.chat.id;
  const action = ctx.match[0];

  await ctx.answerCbQuery();

  if (!usersState[chatId]) {
    return sendMainMenu(ctx);
  }

  if (usersState[chatId].locked) {
    return;
  }

  usersState[chatId].locked = true;

  let responseText = "";

  if (action === 'click_a') {
    usersState[chatId].hp -= 35;

    responseText =
      `💥 Плохой выбор!\n\n` +
      `-35 HP\n` +
      `❤️ HP: ${usersState[chatId].hp}`;

  } else {
    usersState[chatId].score += 50;

    responseText =
      `🚀 Отличный выбор!\n\n` +
      `+50 продуктивности\n` +
      `📈 Очки: ${usersState[chatId].score}`;
  }

  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: []
    });
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

  let status =
    total >= 150
      ? "👑 ГИГА-ФАУНДЕР"
      : total >= 80
      ? "🧠 СВЕРХСОЗНАНИЕ"
      : "💀 ТИМЛИД-ВЫГОРАШ";

  await ctx.reply(
    `🏁 ФИНАЛ ИГРЫ\n\n` +
    `🏆 Статус: ${status}\n\n` +
    `❤️ HP: ${finalHp}\n` +
    `📈 Очки: ${finalScore}`,
    Markup.inlineKeyboard([
      [
        Markup.button.url(
          '🔥 Mira Pro',
          'https://t.me'
        )
      ],
      [
        Markup.button.switchToChat(
          '📢 Поделиться',
          `Я получил статус ${status}`
        )
      ]
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
  console.log(
    'Server running on port',
    process.env.PORT || 3000
  );
});

// =========================
// Launch
// =========================

bot.launch();

console.log("Telegraf bot started");

// =========================
// Errors
// =========================

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// =========================
// Graceful shutdown
// =========================

process.once('SIGINT', () => {
  console.log("Stopping bot...");
  bot.stop('SIGINT');

  server.close(() => {
    process.exit(0);
  });
});

process.once('SIGTERM', () => {
  console.log("Stopping bot...");
  bot.stop('SIGTERM');

  server.close(() => {
    process.exit(0);
  });
});