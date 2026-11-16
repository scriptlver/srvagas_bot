const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_TOKEN;

if (!token) {
  throw new Error('Defina TELEGRAM_TOKEN nas variáveis de ambiente');
}

const bot = new Telegraf(token);

module.exports = { bot };
