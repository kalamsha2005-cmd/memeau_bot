require('dotenv').config(); 
const TelegramBot = require('node-telegram-bot-api'); 

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true }); 
console.log("БОТ ЗАПУЩЕН"); 

// База данных игроков в оперативной памяти
const usersState = {};

const memes = [ 
  "💀 Когда исправил один баг и появилось ещё 14", 
  "☕ Developer starter pack:\n1% сна\n98% кофе\n1% надежды", 
  "🚀 Я: быстро доделаю проект за вечер\n🕒 Также я в 4 утра: почему CSS живёт своей жизнью?", 
  "🧠 ChatGPT написал код\n💀 Теперь попробуй понять почему он работает", 
  "😂 Когда клиент говорит:\n'Там маленькая правка на 5 минут'"
]; 

// Главное меню
function sendMainMenu(chatId) {
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🎮 Начать IT-Симулятор', callback_data: 'start_quest' },
          { text: '😂 Получить мем', callback_data: 'get_meme' }
        ]
      ]
    }
  };
  bot.sendMessage(chatId, "Привет 😄 Я твой интерактивный мем-бот!\n\nГотов проверить, выживешь ли ты в мире IT-дедлайнов? Жми кнопку ниже!", opts);
}

bot.onText(/\/start/, (msg) => {
  sendMainMenu(msg.chat.id);
});

bot.onText(/\/meme/, (msg) => {
  const random = memes[Math.floor(Math.random() * memes.length)];
  bot.sendMessage(msg.chat.id, random);
});

// Обработка нажатий на inline-кнопки
bot.on('callback_query', (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  // Убираем часики загрузки на кнопке
  bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

  // Кнопка обычного мема
  if (data === 'get_meme') {
    const random = memes[Math.floor(Math.random() * memes.length)];
    return bot.sendMessage(chatId, random);
  }

  // Начать квест
  if (data === 'start_quest') {
    usersState[chatId] = {
      step: 1,
      hp: 100,
      score: 0
    };

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

  // Результат Ситуации 1
  if (data === 'q1_a' || data === 'q1_b') {
    if (!usersState[chatId]) return sendMainMenu(chatId);

    if (data === 'q1_a') {
      usersState[chatId].hp -= 40;
      bot.sendMessage(chatId, "🔥 *Мем: Всё горит, а я ок.*\nТы проспал всё на свете. Проект сдан криво. Твоё здоровье пошатнулось.\n💔 Здоровье: -40 HP", { parse_mode: 'Markdown' });
    } else {
      usersState[chatId].score += 50;
      bot.sendMessage(chatId, "🧠 *Мем: Мега-мозг.*\nТы распределил задачи с помощью ИИ в Mira за пару минут и спас дедлайн!\n🚀 Продуктивность: +50 очков", { parse_mode: 'Markdown' });
    }

    // Переход к Ситуации 2
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

  // Результат Ситуации 2 -> Финал
  if (data === 'q2_a' || data === 'q2_b') {
    if (!usersState[chatId]) return sendMainMenu(chatId);

    if (data === 'q2_a') {
      usersState[chatId].hp -= 50;
      bot.sendMessage(chatId, "😭 Ты потратил кучу нервов, доказывая правоту. Шрифт остался прежним, но ты истощен.\n💔 Здоровье: -50 HP");
    } else {
      usersState[chatId].score += 50;
      bot.sendMessage(chatId, "⚡ ИИ в Mira пересобрал план за секунду. Заказчик доволен, ты спокоем!\n🚀 Продуктивность: +50 очков");
    }

    // Расчет финала
    setTimeout(() => {
      if (!usersState[chatId]) return;
      const finalHp = usersState[chatId].hp;
      const finalScore = usersState[chatId].score;
      
      let status = "";
      let totalSurvival = finalHp + finalScore;

      if (totalSurvival >= 150) {
        status = "👑 ГИГА-ФАУНДЕР (100% выживаемости)";
      } else if (totalSurvival >= 80) {
        status = "🧠 СТУДЕНТ-СВЕРХСОЗНАНИЕ (60% выживаемости)";
      } else {
        status = "💀 ТИМЛИД-ВЫГОРАШ (10% выживаемости)";
      }

      const finalOpts = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔥 Активировать 1 месяц Mira Pro', url: 'https://t.me' }],
            [{ text: '📢 Поделиться результатом', switch_inline_query: `Я прошел ИТ-симулятор и получил статус: ${status}. Проверить себя: ` }]
          ]
        }
      };

      bot.sendMessage(chatId, `🏁 **ФИНАЛ ИГРЫ**\n\n🏆 Твой мемный статус: **${status}**\n\n🛡️ Оставшееся здоровье: ${finalHp} HP\n📈 Очки продуктивности: ${finalScore}\n\n🤖 *Гайд по выживанию:*\nТвой проект выжил, но без нормальных инструментов долго не протянуть. Жми кнопку ниже, запускай экосистему Mira с промокодом **MIRAGROWTH2026**, и твоя продуктивность улетит в космос!`, { parse_mode: 'Markdown', ...finalOpts });
      
      delete usersState[chatId];
    }, 1500);
    return;
  }

  // МИНИ-ИГРА: Проверка ответа (ИСПРАВЛЕНО ТУТ)
  if (data.startsWith('guess_')) {
    const parts = data.split('_'); 
    const userGuess = parseInt(parts[1]); // Берём 1-й элемент массива
    const correctAnswer = parseInt(parts[2]); // Берём 2-й элемент массива

    if (userGuess === correctAnswer) {
      bot.sendMessage(chatId, `🎉 Ура! Вы угадали! Это было число ${correctAnswer}. Вы чертовски везучий!`);
    } else {
      bot.sendMessage(chatId, `❌ Не угадали! Я загадал число ${correctAnswer}. Попробуйте ещё раз в меню игр!`);
    }
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
