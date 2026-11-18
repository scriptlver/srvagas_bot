export async function tg(env, method, data = {}) {
  if (!env.TELEGRAM_TOKEN) {
    throw new Error('Secret TELEGRAM_TOKEN não configurado.');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method}: ${result.description || response.status}`);
  }

  return result.result;
}

export async function say(env, chatId, text, options = {}) {
  return tg(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...options,
  });
}

export async function editarMensagem(env, dados) {
  try {
    return await tg(env, 'editMessageText', dados);
  } catch (error) {
    if (error.message?.includes('message is not modified')) {
      return null;
    }

    throw error;
  }
}