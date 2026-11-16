require('dotenv').config();
const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_TOKEN;

const chatIds = process.env.TELEGRAM_CHAT_ID
  ?.split(',')
  .map(id => id.trim())
  .filter(Boolean);

if (!token || !chatIds?.length) {
  throw new Error('Defina TELEGRAM_TOKEN e TELEGRAM_CHAT_ID no arquivo .env');
}

const bot = new Telegraf(token);

module.exports = { bot, chatIds };
