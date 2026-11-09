require('dotenv').config();
const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// cria a instância do bot com a telegraf
const bot = new Telegraf(token);

module.exports = { bot, chatId };