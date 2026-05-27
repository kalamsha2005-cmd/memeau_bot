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

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;

  if (!text) return;

  if (text === '🤖 Спросить ИИ Mira') {
    delete usersState[chatId];
    return generateAndSendMeme(ctx);
  }

  if (text === '🎮 Начать ИИ-Симулятор') {
    usersState[chatId] = {
      step: 1,
      hp: 100,
      score: 0
    };

    return generateQuestStep(ctx);
  }

  if (!usersState[chatId]) {
    return sendMainMenu(ctx);
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