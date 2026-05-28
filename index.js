require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { GoogleGenAI } = require('@google/generative-ai'); 
const http = require('http');

if (!process.env.TELEGRAM_BOT_TOKEN) { console.error("Нет TELEGRAM_BOT_TOKEN"); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { console.error("Нет GEMINI_API_KEY"); process.exit(1); }

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const genAI = GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); 
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// МЫ ОСТАВИЛИ ТОЛЬКО ОДНО ОБЪЯВЛЕНИЕ ЭТИХ ПЕРЕМЕННЫХ:
const usersState = {};
const userCooldown = {};
const AI_TIMEOUT = 15000;

console.log("БОТ ИНИЦИАЛИЗИРОВАН!");

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs))
  ]);
}

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
    return "🚨 Ошибка Gemini API. Проверьте переменные окружения.";
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

bot.telegram.setMyCommands([
  { command: 'start', description: 'Открыть главное меню' },
  { command: 'meme', description: 'Сгенерировать ИИ-мем' }
]);

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
      ]).resize().persistent()
    });
  } catch (e) { console.error("[Menu Error]", e); }
}

bot.start(async (ctx) => { delete usersState[ctx.chat.id]; await sendMainMenu(ctx); });
bot.command('meme', async (ctx) => { delete usersState[ctx.chat.id]; await generateAndSendMeme(ctx); });

bot.hears('🤖 Спросить ИИ Mira', async (ctx) => {
  const chatId = ctx.chat.id;
  if (!usersState[chatId]) usersState[chatId] = { hp: 100, score: 0, step: 1 };
  usersState[chatId].isWaitingForQuestion = true;
  await ctx.reply('🤖 Я готова! Напиши свой вопрос или попроси мем.');
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

  if (!usersState[chatId]) usersState[chatId] = { hp: 100, score: 0, step: 1, isWaitingForQuestion: false };

  if (userText.startsWith('/') || userTextLower.includes('симулятор') || userTextLower.includes('мем') || userTextLower.includes('спросить') || userTextLower.includes('старт') || userText.includes('🎮') || userText.includes('🤖')) {
    usersState[chatId].isWaitingForQuestion = false; 
    return; 
  }

  if (usersState[chatId].isWaitingForQuestion) {
    try {
      if (userTextLower.includes('картинка') || userTextLower.includes('нарисуй') || userTextLower.includes('сгенерируй')) {
        await ctx.sendChatAction('typing');
        const memeData = await generateMemeDataFromGemini(userText);
        await ctx.sendChatAction('upload_photo');
        const encodedPrompt = encodeURIComponent(memeData.englishPrompt);
        const imageUrl = `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000)}`;

        await ctx.replyWithPhoto(imageUrl, {
          caption: `🚀 **Мем готов!**\n\n💬 **Шутка:**\n_${memeData.russianJoke}_`,
          parse_mode: 'Markdown'
        });
      } else {
        await ctx.sendChatAction('typing');
        const aiResponse = await askGemini(userText);
        await ctx.reply(aiResponse);
      }
    } catch (error) {
      await ctx.reply("🚨 Ошибка ИИ.");
      usersState[chatId].isWaitingForQuestion = false;
    }
  }
});

async function generateAndSendMeme(ctx) {
  const chatId = ctx.chat.id;
  if (userCooldown[chatId] && Date.now() - userCooldown[chatId] < 2000) return ctx.reply("⏳ Подождите...");
  userCooldown[chatId] = Date.now();
  let loadingMsg = await ctx.reply("🤖 ИИ Mira думает...");
  try {
    const result = await withTimeout(model.generateContent(`Придумай мем про IT на русском.`), AI_TIMEOUT);
    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    await ctx.reply(result.response.text());
  } catch (error) {
    if (loadingMsg) await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    await ctx.reply("💥 Ошибка");
  }
}

async function generateQuestStep(ctx) {
  const chatId = ctx.chat.id;
  let loadingMsg = await ctx.reply("⏳ ИИ придумывает квест...");
  try {
    const result = await withTimeout(model.generateContent(`Верни JSON квеста: {"situation":"...", "text_a":"...", "text_b":"..."}`), AI_TIMEOUT);
    let cleanText = result.response.text().replace(/```json|```/gi, "").trim();
    let questData = JSON.parse(cleanText);

    usersState[chatId].currentQuest = questData;
    if (loadingMsg) await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

    await ctx.reply(`🎮 ШАГ ${usersState[chatId].step}\n\n${questData.situation}`, Markup.inlineKeyboard([
      [Markup.button.callback(`A: ${questData.text_a}`, 'click_a')],
      [Markup.button.callback(`B: ${questData.text_b}`, 'click_b')]
    ]));
  } catch (e) {
    if (loadingMsg) await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    await ctx.reply("💥 Ошибка генерации шага");
  }
}

bot.action(['click_a', 'click_b'], async (ctx) => {
  const chatId = ctx.chat.id;
  const action = ctx.match[0];
  await ctx.answerCbQuery().catch(() => {});
  if (!usersState[chatId] || usersState[chatId].locked) return;
  usersState[chatId].locked = true;

  let responseText = action === 'click_a' ? "💥 Не повезло!" : "🚀 Отличный выбор!";
  await ctx.reply(responseText);
  usersState[chatId].step += 1;

  setTimeout(async () => {
    if (!usersState[chatId]) return;
    usersState[chatId].locked = false;
    if (usersState[chatId].step <= 3) await generateQuestStep(ctx);
    else await finishGame(ctx);
  }, 1500);
});

async function finishGame(ctx) {
  await ctx.reply(`🏁 ФИНАЛ ИГРЫ!`);
  delete usersState[ctx.chat.id];
}

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Bot running!\n'); });
server.listen(process.env.PORT || 3000);

bot.launch().then(() => console.log("Telegraf bot successfully started"));

process.on('unhandledRejection', (reason) => console.error(reason));
process.on('uncaughtException', (error) => console.error(error));