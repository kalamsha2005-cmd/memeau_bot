require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

console.log("БОТ ЗАПУЩЕН");

const memes = [
  "💀 Когда исправил один баг и появилось ещё 14",
  
  "☕ Developer starter pack:\n1% сна\n98% кофе\n1% надежды",

  "🚀 Я: быстро доделаю проект за вечер\n🕒 Также я в 4 утра: почему CSS живёт своей жизнью?",

  "🧠 ChatGPT написал код\n💀 Теперь попробуй понять почему он работает",

  "😂 Когда клиент говорит:\n'Там маленькая правка на 5 минут'",

  "📈 Productivity: 100%\n🧠 Mental health: undefined",

  "💻 Junior после первого console.log:\n'Я почти хакер'",

  "🔥 Deadline tomorrow\n😎 Brain today: давай сначала поменяем дизайн",

  "🤡 'Щас быстро пофикшу'\n— последние слова любого разработчика",

  "💀 Когда случайно удалил рабочий код\nИ CTRL+Z не помогает",

  "🚀 Startup life:\nденег нет\nсна нет\nидеи есть",

  "☕ Код не работает — panic\nКод заработал — panic",

  "🧠 AI не заменит программистов\nAI просто добавит им ещё больше багов",

  "😂 Ты пишешь код 6 часов\nОшибка:\nmissing ;",

  "💀 Teamlead:\n'Нужна маленькая фича'\nМаленькая фича:",

];

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Привет 😄 Я мем-бот!");
});

bot.onText(/\/meme/, (msg) => {
  const random = memes[Math.floor(Math.random() * memes.length)];
  bot.sendMessage(msg.chat.id, random);
});