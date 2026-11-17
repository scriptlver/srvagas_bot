import { buscarGupy } from './scrapers/gupy.js';
import { buscarQueroVagas } from './scrapers/querovagas.js';
import { buscarSolides } from './scrapers/solides.js';
import { buscarCatho } from './scrapers/catho.js';

const LIMITE = 4000;
const PAUSA_MS = 800;
const MAX_TERMOS = 8;
const MAX_ENVIADAS = 3000;
const RESULTADOS_TTL = 86400;
const RESULTADOS_POR_PAGINA = 8;

const DEFAULTS = {
  hour: 9,
  count: 25,
  tz: -3,
  remoto: true,
  include: [
    'desenvolvedor',
    'desenvolvedor full stack',
    'desenvolvedor back end',
    'desenvolvedor front end',
    'júnior',
    'junior',
    'estágio',
    'remoto',
  ],
  exclude: [
    'senior', 'sr', 'pleno', 'pl', 'ii', 'iii',
    'n1', 'n2', 'n3', 'hibrido', 'hibrida',
    'pcd', 'mid', 'consultor', 'php', '.net', 'angular',
  ],
  paused: false,
  awaiting: null,
  sent: [],
  lastRun: '',
};

const FONTES = [
  { chave: 'Gupy', emoji: '🟣', buscar: buscarGupy },
  { chave: 'QueroVagas', emoji: '🟢', buscar: buscarQueroVagas },
  { chave: 'Solides', emoji: '🟠', buscar: buscarSolides },
  { chave: 'Catho', emoji: '🔵', buscar: buscarCatho },
];

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const escaparHTML = (texto) =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const btn = (text, data) => ({
  text,
  callback_data: data,
});

const fmtTz = (tz) => `UTC${tz >= 0 ? '+' : ''}${tz}`;

const porData = (a, b) =>
  (new Date(b.publicadaEm || 0).getTime() || 0) -
  (new Date(a.publicadaEm || 0).getTime() || 0);

function criarUsuario(chatId) {
  return {
    ...DEFAULTS,
    include: [...DEFAULTS.include],
    exclude: [...DEFAULTS.exclude],
    sent: [],
    chatId: String(chatId),
  };
}

async function getUser(env, chatId) {
  const id = String(chatId);
  const salvo = await env.KV.get(`u:${id}`, 'json');

  if (!salvo) return criarUsuario(id);

  return {
    ...criarUsuario(id),
    ...salvo,
    chatId: id,
    include: Array.isArray(salvo.include) ? salvo.include : [...DEFAULTS.include],
    exclude: Array.isArray(salvo.exclude) ? salvo.exclude : [...DEFAULTS.exclude],
    sent: Array.isArray(salvo.sent) ? salvo.sent : [],
  };
}

async function saveUser(env, user) {
  await env.KV.put(`u:${user.chatId}`, JSON.stringify(user));
}

async function tg(env, method, data = {}) {
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

async function say(env, chatId, text, options = {}) {
  return tg(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...options,
  });
}

async function editarMensagem(env, dados) {
  try {
    return await tg(env, 'editMessageText', dados);
  } catch (error) {
    if (error.message?.includes('message is not modified')) {
      return null;
    }

    throw error;
  }
}

function mainView(u) {
  const text =
    `💼 <b>CONFIGURAÇÕES DO BOT</b>\n\n` +
    `⏰ Horário: <b>${String(u.hour).padStart(2, '0')}:00</b>\n` +
    `🌎 Fuso: <b>${fmtTz(u.tz)}</b>\n` +
    `📊 Limite por fonte: <b>${u.count} vagas</b>\n` +
    `🏠 Remotas: <b>${u.remoto ? 'Sim' : 'Não'}</b>\n` +
    `⏯️ Agendamento: <b>${u.paused ? 'Pausado' : 'Ativo'}</b>\n\n` +
    `✅ Termos incluídos: <b>${u.include.length}</b>\n` +
    `❌ Termos excluídos: <b>${u.exclude.length}</b>\n` +
    `🗂️ Histórico: <b>${u.sent.length} vagas já enviadas</b>\n\n` +
    `Escolha uma opção abaixo:`;

  const kb = [
    [btn('⏰ Horário', 'hour'), btn('🌎 Fuso horário', 'tz')],
    [btn('📊 Quantidade', 'count'), btn('🏠 Remoto', 'rem')],
    [btn('✅ Incluir termos', 'inc'), btn('❌ Excluir termos', 'exc')],
    [btn(u.paused ? '▶️ Ativar agendamento' : '⏸️ Pausar agendamento', 'pause')],
    [btn('🧹 Limpar histórico', 'reset')],
    [btn('🔎 Buscar vagas agora', 'now')],
  ];

  return { text, kb };
}

function hourView(u) {
  const rows = [];

  for (let h = 0; h < 24; h += 4) {
    rows.push(
      Array.from({ length: 4 }, (_, i) => {
        const hour = h + i;
        return btn(
          `${String(hour).padStart(2, '0')}:00${u.hour === hour ? ' ✓' : ''}`,
          `h:${hour}`,
        );
      }),
    );
  }

  rows.push([btn('⬅️ Voltar', 'menu')]);

  return {
    text: '⏰ <b>Horário do envio automático</b>\n\nEscolha a hora em que deseja receber as vagas.',
    kb: rows,
  };
}

function countView(u) {
  const values = [5, 10, 15, 20, 25, 30, 40, 50];

  return {
    text: '📊 <b>Quantidade de vagas</b>\n\nEscolha o limite de vagas por fonte em cada busca.',
    kb: [
      values.slice(0, 4).map((n) => btn(`${n}${u.count === n ? ' ✓' : ''}`, `c:${n}`)),
      values.slice(4).map((n) => btn(`${n}${u.count === n ? ' ✓' : ''}`, `c:${n}`)),
      [btn('⬅️ Voltar', 'menu')],
    ],
  };
}

function tzView(u) {
  const rows = [];

  for (let tz = -12; tz <= 14; tz += 3) {
    const row = [];

    for (let offset = 0; offset < 3 && tz + offset <= 14; offset++) {
      const value = tz + offset;
      row.push(btn(
        `${fmtTz(value)}${u.tz === value ? ' ✓' : ''}`,
        `z:${value}`,
      ));
    }

    rows.push(row);
  }

  rows.push([btn('⬅️ Voltar', 'menu')]);

  return {
    text: '🌎 <b>Fuso horário</b>\n\nEscolha o fuso horário usado para calcular o horário dos envios.',
    kb: rows,
  };
}

function termsView(u, kind) {
  const incluir = kind === 'include';
  const termos = u[kind];

  const lista = termos.length
    ? termos.map((t) => `• ${escaparHTML(t)}`).join('\n')
    : 'Nenhum termo cadastrado.';

  return {
    text:
      `${incluir ? '✅' : '❌'} <b>${incluir ? 'Termos incluídos' : 'Termos excluídos'}</b>\n\n` +
      `${lista}\n\n` +
      `Envie os termos separados por vírgula ou em linhas diferentes.\n` +
      `Para cancelar, use /cancelar.`,
    kb: [
      [btn('🗑️ Limpar termos', `clr:${kind}`)],
      [btn('⬅️ Voltar', 'menu')],
    ],
  };
}

const parseTerms = (texto) =>
  texto
    .split(/[,;\n]/)
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean);

function addTerms(lista, termos) {
  const existentes = new Set(lista.map((t) => normalizar(t)));

  for (const termo of termos) {
    const chave = normalizar(termo);

    if (chave && !existentes.has(chave)) {
      lista.push(termo);
      existentes.add(chave);
    }
  }
}

function montarMensagens(fonte, emoji, vagas) {
  if (!vagas.length) return [];

  const cabecalho = (parte, total) =>
    `${emoji} <b>Vagas ${escaparHTML(fonte)}</b> (${vagas.length})` +
    `${total > 1 ? ` - parte ${parte}` : ''}\n\n`;

  const grupos = [];
  let atual = [];
  let tamanho = cabecalho(1, 2).length;

  for (const vaga of vagas) {
    const bloco =
      `👩‍💻 ${escaparHTML(vaga.titulo || vaga.nome || 'Vaga')}\n` +
      `🔗 <a href="${escaparHTML(vaga.link)}">Ver vaga</a>\n\n`;

    if (tamanho + bloco.length > LIMITE && atual.length) {
      grupos.push(atual);
      atual = [];
      tamanho = cabecalho(1, 2).length;
    }

    atual.push({ vaga, bloco });
    tamanho += bloco.length;
  }

  if (atual.length) grupos.push(atual);

  return grupos.map((grupo, index) => ({
    texto:
      cabecalho(index + 1, grupos.length) +
      grupo.map((item) => item.bloco).join(''),
    vagas: grupo.map((item) => item.vaga),
  }));
}

function criarTextoPagina(vagas, pagina, total) {
  const inicio = pagina * RESULTADOS_POR_PAGINA;
  const itens = vagas.slice(inicio, inicio + RESULTADOS_POR_PAGINA);
  const totalPaginas = Math.max(1, Math.ceil(total / RESULTADOS_POR_PAGINA));

  const linhas = itens.map((vaga, index) => {
    const numero = inicio + index + 1;
    const fonte = vaga.fonte ? ` <i>(${escaparHTML(vaga.fonte)})</i>` : '';
    return (
      `<b>${numero}. ${escaparHTML(vaga.titulo || vaga.nome || 'Vaga')}</b>${fonte}\n` +
      `🔗 <a href="${escaparHTML(vaga.link)}">Ver vaga</a>`
    );
  });

  return {
    texto:
      `💡 <b>Vagas adicionais encontradas</b>\n` +
      `Mostrando ${inicio + 1}–${Math.min(inicio + itens.length, total)} de ${total}\n\n` +
      linhas.join('\n\n'),
    totalPaginas,
  };
}

function tecladoPagina(id, pagina, totalPaginas) {
  const botoes = [];

  if (pagina > 0) botoes.push(btn('⬅️ Anterior', `all:${id}:${pagina - 1}`));
  if (pagina + 1 < totalPaginas) botoes.push(btn('Próxima ➡️', `all:${id}:${pagina + 1}`));

  return [
    ...(botoes.length ? [botoes] : []),
    [btn('↩️ Voltar ao relatório', `all:${id}:back`)],
  ];
}

async function mostrarPaginaRestantes(env, chatId, messageId, id, pagina) {
  const chave = `r:${chatId}:${id}`;
  const salvo = await env.KV.get(chave, 'json');

  if (!salvo || !Array.isArray(salvo.vagas) || !salvo.vagas.length) {
    return editarMensagem(env, {
      chat_id: chatId,
      message_id: messageId,
      text: '⌛ Esta lista expirou. Faça uma nova busca para consultar as oportunidades.',
      reply_markup: { inline_keyboard: [[btn('🔎 Buscar novamente', 'now')]] },
    });
  }

  if (pagina === 'back') {
    return editarMensagem(env, {
      chat_id: chatId,
      message_id: messageId,
      text: salvo.resumo,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [[btn(`💡 Ver todas as ${salvo.vagas.length} vagas restantes`, `all:${id}:0`)]],
      },
    });
  }

  const user = await getUser(env, chatId);
  const linksVistos = new Set(user.sent);
  for (const vaga of salvo.vagas) {
    if (vaga.link) linksVistos.add(vaga.link);
  }
  user.sent = [...linksVistos].slice(-MAX_ENVIADAS);
  await saveUser(env, user);

  const total = salvo.vagas.length;
  const totalPaginas = Math.ceil(total / RESULTADOS_POR_PAGINA);
  const paginaSegura = Math.min(Math.max(Number(pagina) || 0, 0), totalPaginas - 1);
  const resultado = criarTextoPagina(salvo.vagas, paginaSegura, total);

  return editarMensagem(env, {
    chat_id: chatId,
    message_id: messageId,
    text: resultado.texto,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: tecladoPagina(id, paginaSegura, resultado.totalPaginas),
    },
  });
}

async function sendJobs(env, user, { manual = false, cache = new Map() } = {}) {
  if (!user.include.length) {
    return say(
      env,
      user.chatId,
      'Você ainda não definiu termos para buscar. Use /menu → ✅ Incluir termos.',
    );
  }

  try {
    const termos = user.include.slice(0, MAX_TERMOS);

    const resultados = await Promise.allSettled(
      FONTES.map((fonte) =>
        fonte.buscar({
          termos,
          remoto: user.remoto,
          cache,
        }),
      ),
    );

    const todas = [];

    resultados.forEach((resultado, index) => {
      if (resultado.status === 'fulfilled' && Array.isArray(resultado.value)) {
        todas.push(...resultado.value);
      } else if (resultado.status === 'rejected') {
        console.log(
          `${FONTES[index].chave} falhou:`,
          resultado.reason?.message || resultado.reason,
        );
      }
    });

    const enviadas = new Set(user.sent);
    const vistas = new Set();
    let jaEnviadas = 0;
    let excluidas = 0;

    const novas = todas.filter((vaga) => {
      if (!vaga?.link || vistas.has(vaga.link)) return false;

      if (enviadas.has(vaga.link)) {
        jaEnviadas++;
        return false;
      }

      const nome = normalizar(vaga.nome || vaga.titulo || '');
      const palavras = new Set(nome.split(/[^a-z0-9.#+]+/).filter(Boolean));

      const excluida = user.exclude.some((termo) => {
        const t = normalizar(termo).trim();
        if (!t) return false;
        return /\s/.test(t) ? nome.includes(t) : palavras.has(t);
      });

      if (excluida) {
        excluidas++;
        return false;
      }

      vistas.add(vaga.link);
      return true;
    });

    console.log(
      `Chat ${user.chatId}: ${novas.length} novas de ${todas.length} encontradas ` +
      `(${jaEnviadas} já enviadas, ${excluidas} excluídas)`,
    );

    if (!novas.length) {
      if (manual) {
        await say(env, user.chatId, '😕 Nenhuma vaga nova com esses filtros agora.');
      }
      return;
    }

    const selecionadas = [];
    const restantes = [];

    for (const fonte of FONTES) {
      const daFonte = novas
        .filter((vaga) => normalizar(vaga.fonte) === normalizar(fonte.chave))
        .sort(porData);

      selecionadas.push(...daFonte.slice(0, user.count));
      restantes.push(...daFonte.slice(user.count));
    }

    const dataLocal = new Date(Date.now() + user.tz * 3600000);
    const dataFormatada = dataLocal.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

    const resumo =
      `💼 <b>RELATÓRIO DE VAGAS — ${dataFormatada}</b>\n\n` +
      `📌 Encontramos <b>${novas.length} novas vagas</b> compatíveis com seus filtros.\n` +
      `📨 Enviamos <b>${selecionadas.length}</b> vagas, respeitando seu limite de ${user.count} por fonte.`;

    let tecladoResumo;

    if (restantes.length) {
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await env.KV.put(
        `r:${user.chatId}:${id}`,
        JSON.stringify({ vagas: restantes, resumo }),
        { expirationTtl: RESULTADOS_TTL },
      );

      tecladoResumo = {
        inline_keyboard: [[btn(`💡 Ver todas as ${restantes.length} vagas restantes`, `all:${id}:0`)]],
      };
    }

    await say(
      env,
      user.chatId,
      resumo + (restantes.length
        ? `\n\n💡 Além dessas, encontramos <b>${restantes.length} vagas</b> que também combinam com você.`
        : '\n\nVocê recebeu todas as vagas encontradas dentro do seu limite.'),
      tecladoResumo ? { reply_markup: tecladoResumo } : {},
    );

    await dormir(PAUSA_MS);

    for (const fonte of FONTES) {
      const daFonte = selecionadas
        .filter((vaga) => normalizar(vaga.fonte) === normalizar(fonte.chave));

      const mensagens = montarMensagens(fonte.chave, fonte.emoji, daFonte);

      for (const mensagem of mensagens) {
        await say(env, user.chatId, mensagem.texto);

        for (const vaga of mensagem.vagas) enviadas.add(vaga.link);

        user.sent = [...enviadas].slice(-MAX_ENVIADAS);
        await saveUser(env, user);

        await dormir(PAUSA_MS);
      }
    }
  } catch (error) {
    console.log('Erro ao buscar vagas:', error);

    if (manual) {
      await say(
        env,
        user.chatId,
        '⚠️ Ocorreu um erro durante a busca. Tente novamente mais tarde.',
      ).catch(() => {});
    }
  } finally {
    await saveUser(env, user);
  }
}

async function runCron(env) {
  const agora = Date.now();
  const cache = new Map();
  let cursor;

  do {
    const pagina = await env.KV.list({ prefix: 'u:', cursor, limit: 1000 });

    for (const item of pagina.keys) {
      try {
        const user = await getUser(env, item.name.slice(2));

        if (user.paused || !user.include.length) continue;

        const horarioLocal = new Date(agora + user.tz * 3600000);
        const data = horarioLocal.toISOString().slice(0, 10);

        if (horarioLocal.getUTCHours() !== user.hour) continue;
        if (user.lastRun === data) continue;

        user.lastRun = data;
        await saveUser(env, user);

        await sendJobs(env, user, { cache });
      } catch (error) {
        console.log('Erro no cron:', item.name, String(error));
      }
    }

    cursor = pagina.list_complete ? undefined : pagina.cursor;
  } while (cursor);
}

async function onMessage(env, mensagem) {
  if (!mensagem?.chat?.id) return;

  const chatId = mensagem.chat.id;
  const texto = (mensagem.text || '').trim();
  if (!texto) return;

  const user = await getUser(env, chatId);
  const [comandoOriginal, ...resto] = texto.split(/\s+/);
  const comando = comandoOriginal.startsWith('/')
    ? comandoOriginal.split('@')[0].toLowerCase()
    : null;
  const argumento = resto.join(' ');

  const mostrarMenu = async (prefixo = '') => {
    const view = mainView(user);
    return say(env, chatId, prefixo + view.text, {
      reply_markup: { inline_keyboard: view.kb },
    });
  };

  if (comando) {
    if (comando === '/start' || comando === '/menu') {
      user.awaiting = null;
      await saveUser(env, user);
      return mostrarMenu(comando === '/start' ? '👋 Oi! Eu busco vagas pra você.\n\n' : '');
    }

    if (comando === '/buscar') {
      user.awaiting = null;
      return sendJobs(env, user, { manual: true });
    }

    if (comando === '/incluir' || comando === '/excluir') {
      const tipo = comando === '/incluir' ? 'include' : 'exclude';

      if (!argumento) {
        user.awaiting = tipo;
        await saveUser(env, user);
        const view = termsView(user, tipo);
        return say(env, chatId, view.text, {
          reply_markup: { inline_keyboard: view.kb },
        });
      }

      addTerms(user[tipo], parseTerms(argumento));
      await saveUser(env, user);
      return mostrarMenu();
    }

    if (comando === '/cancelar') {
      user.awaiting = null;
      await saveUser(env, user);
      return say(env, chatId, 'Ok, cancelado.');
    }

    return;
  }

  if (user.awaiting) {
    addTerms(user[user.awaiting], parseTerms(texto));
    user.awaiting = null;
    await saveUser(env, user);
    return mostrarMenu('✔️ Salvo!\n\n');
  }
}

async function onCallback(env, callback) {
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  if (!chatId || !messageId) return;

  const data = callback.data || '';

  await tg(env, 'answerCallbackQuery', { callback_query_id: callback.id });

  if (data.startsWith('all:')) {
    const [, id, pagina] = data.split(':');
    if (!/^[a-f0-9]{12}$/i.test(id || '')) return;
    return mostrarPaginaRestantes(env, chatId, messageId, id, pagina === 'back' ? 'back' : pagina);
  }

  const user = await getUser(env, chatId);
  let view;

  if (data === 'menu') {
    user.awaiting = null;
    view = mainView(user);
  } else if (data === 'hour') {
    view = hourView(user);
  } else if (data === 'count') {
    view = countView(user);
  } else if (data === 'tz') {
    view = tzView(user);
  } else if (data === 'rem') {
    user.remoto = !user.remoto;
    view = mainView(user);
  } else if (data === 'pause') {
    user.paused = !user.paused;
    view = mainView(user);
  } else if (data === 'reset') {
    user.sent = [];
    user.lastRun = '';
    user.awaiting = null;
    view = mainView(user);
  } else if (data.startsWith('h:')) {
    const hour = Number(data.slice(2));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
    user.hour = hour;
    view = mainView(user);
  } else if (data.startsWith('c:')) {
    const count = Number(data.slice(2));
    if (![5, 10, 15, 20, 25, 30, 40, 50].includes(count)) return;
    user.count = count;
    view = mainView(user);
  } else if (data.startsWith('z:')) {
    const timezone = Number(data.slice(2));
    if (!Number.isInteger(timezone) || timezone < -12 || timezone > 14) return;
    user.tz = timezone;
    view = mainView(user);
  } else if (data === 'inc' || data === 'exc') {
    const tipo = data === 'inc' ? 'include' : 'exclude';
    user.awaiting = tipo;
    view = termsView(user, tipo);
  } else if (data.startsWith('clr:')) {
    const tipo = data.slice(4);
    if (!['include', 'exclude'].includes(tipo)) return;
    user[tipo] = [];
    user.awaiting = tipo;
    view = termsView(user, tipo);
  } else if (data === 'now') {
    await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    return sendJobs(env, user, { manual: true });
  } else {
    return;
  }

  await saveUser(env, user);

  await editarMensagem(env, {
    chat_id: chatId,
    message_id: messageId,
    text: view.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: view.kb },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/setup') {
      if (!env.WEBHOOK_SECRET || url.searchParams.get('key') !== env.WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
      }

      const webhook = await tg(env, 'setWebhook', {
        url: `${url.origin}/webhook`,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query'],
      });

      const comandos = await tg(env, 'setMyCommands', {
        commands: [
          { command: 'menu', description: 'Abrir configurações' },
          { command: 'buscar', description: 'Buscar vagas agora' },
          { command: 'incluir', description: 'Adicionar termos de busca' },
          { command: 'excluir', description: 'Adicionar termos a excluir' },
          { command: 'cancelar', description: 'Cancelar operação atual' },
        ],
      });

      return Response.json({ success: true, webhook, comandos });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      if (
        !env.WEBHOOK_SECRET ||
        request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET
      ) {
        return new Response('forbidden', { status: 403 });
      }

      const update = await request.json();

      if (update.callback_query) {
        ctx.waitUntil(
          onCallback(env, update.callback_query).catch((error) => {
            console.log('Erro no callback:', String(error));
          }),
        );
      } else if (update.message) {
        ctx.waitUntil(
          onMessage(env, update.message).catch((error) => {
            console.log('Erro na mensagem:', String(error));
          }),
        );
      }

      return new Response('ok');
    }

    return new Response('vagas-bot ok');
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
};