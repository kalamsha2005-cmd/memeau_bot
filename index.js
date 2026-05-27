require('dotenv').config(); 
const TelegramBot = require('node-telegram-bot-api'); 

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true }); 
console.log("БОТ ЗАПУЩЕН"); 

// База данных игроков в оперативной памяти (для сброса при перезапуске)
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

bot.on('callback_query', (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  bot.answerCallbackQuery(callbackQuery.id);

  // Кнопка обычного мема
  if (data === 'get_meme') {
    const random = memes[Math.floor(Math.random() * memes.length)];
    return bot.sendMessage(chatId, random);
  }

  // Начать квест (Инициализация игрока)
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
    
    bot.sendMessage(chatId, "🎮 **ИТ-СИМУЛЯТОР: ШАГ 1**\n\n🕒 3 часа ночи. Завтра дедлайн MVP / сдачи лабы. Дизайнер ушел в запой, проджект менеджер плачет в углу. Твои действия?", { parse_mode: 'Markdown', ...opts });
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
  }

  // Результат Ситуации 2 -> Финал
  if (data === 'q2_a' || data === 'q2_b') {
    if (!usersState[chatId]) return sendMainMenu(chatId);

    if (data === 'q2_a') {
      usersState[chatId].hp -= 50;
      bot.sendMessage(chatId, "😭 Ты потратил кучу нервов, доказывая правоту. Шрифт остался прежним, но ты истощен.\n💔 Здоровье: -50 HP");
    } else {
      usersState[chatId].score += 50;
      bot.sendMessage(chatId, "⚡ ИИ в Mira пересобрал план за секунду. Заказчик доволен, ты спокоен!\n🚀 Продуктивность: +50 очков");
    }

    // Расчет финала
    setTimeout(() => {
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

      // Гроу-хакинг и виральный шеринг
      const finalOpts = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔥 Активировать 1 месяц Mira Pro', url: 'https://t.me' }],
            [{ text: '📢 Поделиться результатом с командой', switch_inline_query: `Я прошел ИТ-симулятор и получил статус: ${status}. Проверь себя здесь!` }]
          ]
        }
      };

      bot.sendMessage(chatId, `🏁 **ФИНАЛ ИГРЫ**\n\n🏆 Твой мемный статус: **${status}**\n\n🛡️ Оставшееся здоровье: ${finalHp} HP\n📈 Очки продуктивности: ${finalScore}\n\n🤖 *Гайд по выживанию:*\nТвой проект выжил, но без нормальных инструментов долго не протянуть. Жми кнопку ниже, запускай экосистему Mira с промокодом **MIRAGROWTH2026**, и твоя продуктивность улетит в космос!`, { parse_mode: 'Markdown', ...finalOpts });
      
      // Очищаем стейт игрока после финала
      delete usersState[chatId];
    }, 1500);
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
