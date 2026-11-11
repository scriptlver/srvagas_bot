require('dotenv').config();
const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  throw new Error('Defina TELEGRAM_TOKEN e TELEGRAM_CHAT_ID no arquivo .env');
}

const bot = new Telegraf(token);

module.exports = { bot, chatId };