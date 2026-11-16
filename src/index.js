const fs = require("fs");
const path = require("path");

const { bot, chatIds } = require("./config/telegram");

const { buscarGupy } = require("./scrapers/gupy");
const { buscarLinkedin } = require("./scrapers/linkedin");
const { buscarQueroVagas } = require("./scrapers/querovagas");

const ARQUIVO_ENVIADAS = path.join(__dirname, "..", "enviadas.json");

const LIMITE = 4000;
const PAUSA_MS = 800;
const MAX_TERMOS = 8;

const DEFAULTS = {
  hour: 9, count: 25, tz: -3, remoto: true,
  include: ['desenvolvedor', 'desenvolvedor full stack', 'desenvolvedor back end', 'desenvolvedor front end', 'júnior', 'junior', 'estágio', 'remoto'],
  exclude: ['senior', 'sr', 'pleno', 'pl', 'ii', 'iii', 'n1', 'n2', 'n3', 'hibrido', 'hibrida', 'pcd', 'mid', 'consultor', 'php', '.net', 'angular'],
  paused: false, awaiting: null, sent: [], lastRun: '',
};

const pad = (n) => String(n).padStart(2, '0');
const btn = (text, data) => ({ text, callback_data: data });
const fmtTz = (tz) => `UTC${tz >= 0 ? '+' : ''}${tz}`;
const porData = (a, b) => (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0);

function lerEnviadas() {
  try {
    return new Set(JSON.parse(fs.readFileSync(ARQUIVO_ENVIADAS, "utf8")));
  } catch {
    return new Set();
  }
}

function salvarEnviadas(set) {
  fs.writeFileSync(ARQUIVO_ENVIADAS, JSON.stringify([...set], null, 2));
}

async function enviarCabecalho(total) {
  const data = new Date().toLocaleDateString("pt-BR");

  const mensagem = `
💼 <b>RELATÓRIO DE VAGAS — ${data}</b>

📌 Encontramos <b>${total} novas vagas</b> para você.

Confira as oportunidades abaixo!
  `;

  await bot.telegram.sendMessage(chatIds, mensagem, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });

  await dormir(PAUSA_MS);
}

function montarMensagens(fonte, emoji, vagas) {
  const cab = (parte, total) =>
    `${emoji} <b>Vagas ${esc(fonte)}</b> (${vagas.length})${total > 1 ? ` - parte ${parte}` : ''}\n\n`;
  const blocos = vagas.map((v) => ({ v, t: `👩‍💻 ${esc(v.titulo)}\n🔗 <a href="${esc(v.link)}">Ver vaga</a>\n\n` }));

  const grupos = [];
  let atual = [];
  let tam = cab(1, 2).length;
  for (const b of blocos) {
    if (tam + b.t.length > LIMITE && atual.length) { grupos.push(atual); atual = []; tam = cab(1, 2).length; }
    atual.push(b);
    tam += b.t.length;
  }
  if (atual.length) grupos.push(atual);

  return grupos.map((g, i) => ({ texto: cab(i + 1, grupos.length) + g.map((b) => b.t).join(''), vagas: g.map((b) => b.v) }));
}

async function sendJobs(env, u, { manual = false, cache = new Map() } = {}) {
  if (!u.include.length) {
    return say(env, u.chatId, 'Você ainda não definiu termos para buscar. Use /menu → ✅ Incluir termos.');
  }
  try {
    const termos = u.include.slice(0, MAX_TERMOS);
    const resultados = await Promise.allSettled(FONTES.map((f) => f.buscar({ termos, remoto: u.remoto, cache })));

    const todas = [];
    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled') todas.push(...r.value);
      else console.log(`${FONTES[i].chave} falhou:`, r.reason?.message);
    });

    const enviadas = new Set(u.sent);
    const vistas = new Set();
    const excl = u.exclude.map(reTermo);
    const novas = todas.filter((v) => {
      if (!v.link || enviadas.has(v.link) || vistas.has(v.link)) return false;
      if (excl.some((re) => re.test(normalizar(v.nome)))) return false;
      vistas.add(v.link);
      return true;
    });

    console.log(`Chat ${u.chatId}: ${novas.length} novas de ${todas.length} encontradas`);
    if (!novas.length) {
      if (manual) await say(env, u.chatId, '😕 Nenhuma vaga nova com esses filtros agora.');
      return;
    }

    const local = new Date(Date.now() + u.tz * 3600e3);
    await say(env, u.chatId,
      `\n💼 <b>RELATÓRIO DE VAGAS — ${local.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</b>\n\n` +
      `📌 Encontramos <b>${novas.length} novas vagas</b> para você.\n\nConfira as oportunidades abaixo!`);
    await dormir(PAUSA_MS);

    for (const { chave, emoji } of FONTES) {
      const daFonte = novas.filter((v) => v.fonte === chave).sort(porData).slice(0, u.count);
      for (const msg of montarMensagens(chave, emoji, daFonte)) {
        await bot.telegram.sendMessage(chatIds, msg.texto, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });

        msg.vagas.forEach((vaga) => {
          enviadas.add(vaga.link);
        });

        salvarEnviadas(enviadas);

        total += msg.vagas.length;

        await dormir(PAUSA_MS);
      }
    }
  } finally {
    await saveUser(env, u); 
  }
}

// ───────────── cron ─────────────
async function runCron(env) {
  const now = Date.now();
  const cache = new Map(); 
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 'u:', cursor });
    for (const k of page.keys) {
      try {
        const u = await getUser(env, k.name.slice(2));
        if (u.paused || !u.include.length) continue;
        const local = new Date(now + u.tz * 3600e3);
        const date = local.toISOString().slice(0, 10);
        if (local.getUTCHours() !== u.hour || u.lastRun === date) continue;
        u.lastRun = date;
        await sendJobs(env, u, { cache });
      } catch (e) { console.log('cron erro', k.name, String(e)); }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

const parseTerms = (s) => s.split(/[,;\n]/).map((t) => t.trim().slice(0, 40)).filter(Boolean);
const addTerms = (list, terms) => {
  const lower = new Set(list.map((t) => t.toLowerCase()));
  for (const t of terms) if (!lower.has(t.toLowerCase())) { list.push(t); lower.add(t.toLowerCase()); }
};

async function onMessage(env, m) {
  const chatId = m.chat.id;
  const text = (m.text || '').trim();
  if (!text) return;
  const u = await getUser(env, chatId);
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.startsWith('/') ? cmdRaw.split('@')[0].toLowerCase() : null;
  const arg = rest.join(' ');
  const showMenu = (prefix = '') => {
    const v = mainView(u);
    return say(env, chatId, prefix + v.text, { reply_markup: { inline_keyboard: v.kb } });
  };

  if (cmd) {
    u.awaiting = null;
    if (cmd === '/start' || cmd === '/menu') {
      await saveUser(env, u);
      return showMenu(cmd === '/start' ? '👋 Oi! Eu busco vagas pra você.\n\n' : '');
    }
    if (cmd === '/buscar') return sendJobs(env, u, { manual: true });
    if (cmd === '/incluir' || cmd === '/excluir') {
      const kind = cmd === '/incluir' ? 'include' : 'exclude';
      if (!arg) {
        u.awaiting = kind;
        await saveUser(env, u);
        const v = termsView(u, kind);
        return say(env, chatId, v.text, { reply_markup: { inline_keyboard: v.kb } });
      }
      addTerms(u[kind], parseTerms(arg));
      await saveUser(env, u);
      return showMenu();
    }
    if (cmd === '/cancelar') { await saveUser(env, u); return say(env, chatId, 'Ok, cancelado.'); }
    return;
  }

  if (u.awaiting) {
    addTerms(u[u.awaiting], parseTerms(text));
    u.awaiting = null;
    await saveUser(env, u);
    return showMenu('✔️ Salvo!\n\n');
  }
}

async function onCallback(env, cq) {
  const chat_id = cq.message.chat.id;
  const message_id = cq.message.message_id;
  const d = cq.data;
  const u = await getUser(env, chat_id);
  await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });

  let v;
  if (d === 'menu') { u.awaiting = null; v = mainView(u); }
  else if (d === 'hour') v = hourView(u);
  else if (d === 'count') v = countView(u);
  else if (d === 'tz') v = tzView(u);
  else if (d === 'rem') { u.remoto = !u.remoto; v = mainView(u); }
  else if (d === 'pause') { u.paused = !u.paused; v = mainView(u); }
  else if (d.startsWith('h:')) { u.hour = +d.slice(2); v = mainView(u); }
  else if (d.startsWith('c:')) { u.count = +d.slice(2); v = mainView(u); }
  else if (d.startsWith('z:')) { u.tz = +d.slice(2); v = mainView(u); }
  else if (d === 'inc' || d === 'exc') {
    const kind = d === 'inc' ? 'include' : 'exclude';
    u.awaiting = kind;
    v = termsView(u, kind);
  } else if (d.startsWith('clr:')) {
    const kind = d.slice(4);
    u[kind] = [];
    u.awaiting = kind;
    v = termsView(u, kind);
  } else if (d === 'now') {
    await tg(env, 'sendChatAction', { chat_id, action: 'typing' });
    return sendJobs(env, u, { manual: true });
  } else return;

  await saveUser(env, u);
  await tg(env, 'editMessageText', {
    chat_id, message_id, text: v.text, parse_mode: 'HTML',
    link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: v.kb },
  });
}

const allowed = (env, chatId) =>
  !env.TELEGRAM_CHAT_ID || env.TELEGRAM_CHAT_ID.split(',').map((s) => s.trim()).includes(String(chatId));

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // ABRIR uma vez no navegador: /setup?key=SEU_WEBHOOK_SECRET
    if (url.pathname === '/setup') {
      if (url.searchParams.get('key') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const hook = await tg(env, 'setWebhook', {
        url: `${url.origin}/webhook`,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query'],
      });
      const cmds = await tg(env, 'setMyCommands', {
        commands: [
          { command: 'menu', description: 'Abrir configurações' },
          { command: 'buscar', description: 'Buscar vagas agora' },
          { command: 'incluir', description: 'Adicionar termos de busca' },
          { command: 'excluir', description: 'Adicionar termos a excluir' },
        ],
      });
      return Response.json({ hook, cmds });
    }

    if (url.pathname === '/webhook' && req.method === 'POST') {
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const update = await req.json();
      const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
      if (chatId && allowed(env, chatId)) {
        ctx.waitUntil(
          (update.callback_query ? onCallback(env, update.callback_query) : onMessage(env, update.message))
            .catch((e) => console.log('erro', String(e))),
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