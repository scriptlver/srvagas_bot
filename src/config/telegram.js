const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_TOKEN;
const chatIds = process.env.TELEGRAM_CHAT_ID
  ?.split(',')
  .map(id => id.trim())
  .filter(Boolean);

if (!token) {
  throw new Error('Defina TELEGRAM_TOKEN nas variáveis de ambiente');
}

if (!chatIds?.length) {
  throw new Error('Defina TELEGRAM_CHAT_ID no arquivo .env');
}

const bot = new Telegraf(token);

module.exports = { bot, chatIds };
