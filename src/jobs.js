import {
  MAX_TERMOS,
  PAUSA_MS,
  RESULTADOS_TTL,
  RESULTADOS_POR_PAGINA,
} from "./config.js";
import { btn, dormir, normalizar, porData, escaparHTML } from "./utils.js";
import { fontesAtivas } from "./sources.js";
import { formatarLocal } from "./local.js";
import { getUser, saveUser } from "./user.js";
import { say, editarMensagem } from "./telegram.js";
import { criarTextoPagina, montarMensagens, tecladoPagina } from "./views.js";

const CONCORRENCIA = 10;

async function pool(lista, concorrencia, fn) {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(concorrencia, lista.length) },
    async () => {
      while (i < lista.length) {
        const item = lista[i++];
        await fn(item).catch(() => {});
      }
    },
  );
  await Promise.all(workers);
}

export async function mostrarPaginaRestantes(
  env,
  chatId,
  messageId,
  id,
  pagina,
) {
  const chave = `r:${chatId}:${id}`;
  const salvo = await env.KV.get(chave, "json");

  if (!salvo || !Array.isArray(salvo.vagas) || !salvo.vagas.length) {
    return editarMensagem(env, {
      chat_id: chatId,
      message_id: messageId,
      text: "⌛ Esta lista expirou. Faça uma nova busca para consultar as oportunidades.",
      reply_markup: { inline_keyboard: [[btn("🔎 Buscar novamente", "now")]] },
    });
  }

  if (pagina === "back") {
    return editarMensagem(env, {
      chat_id: chatId,
      message_id: messageId,
      text: salvo.resumo,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [
            btn(
              `💡 Ver todas as ${salvo.vagas.length} vagas restantes`,
              `all:${id}:0`,
            ),
          ],
        ],
      },
    });
  }

  const total = salvo.vagas.length;
  const totalPaginas = Math.ceil(total / RESULTADOS_POR_PAGINA);
  const paginaSegura = Math.min(
    Math.max(Number(pagina) || 0, 0),
    totalPaginas - 1,
  );
  const resultado = criarTextoPagina(salvo.vagas, paginaSegura, total);

  return editarMensagem(env, {
    chat_id: chatId,
    message_id: messageId,
    text: resultado.texto,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: tecladoPagina(id, paginaSegura, resultado.totalPaginas),
    },
  });
}

export async function sendJobs(
  env,
  user,
  { manual = false, cache = new Map() } = {},
) {
  if (!user.include.length) {
    if (manual) {
      await say(
        env,
        user.chatId,
        "Você ainda não definiu termos para buscar. Use /menu → ✅ Incluir termos.",
      );
    }
    return true;
  }

  try {
    const termos = user.include.slice(0, MAX_TERMOS);
    const fontes = fontesAtivas(user);

    if (!fontes.length) {
      throw new Error("Nenhuma fonte de vagas está ativa.");
    }

    const resultados = await Promise.allSettled(
      fontes.map((fonte) =>
        fonte.buscar({
          termos,
          remoto: user.remoto,
          local: user.local,
          cache,
        }),
      ),
    );

    if (resultados.every((resultado) => resultado.status === "rejected")) {
      throw new Error("Todas as fontes de vagas falharam.");
    }

    const todas = [];

    resultados.forEach((resultado, index) => {
      if (resultado.status === "fulfilled" && Array.isArray(resultado.value)) {
        todas.push(...resultado.value);
      } else if (resultado.status === "rejected") {
        console.log(
          `${fontes[index].chave} falhou:`,
          resultado.reason?.message || resultado.reason,
        );
      }
    });

    const vistas = new Set();
    let excluidas = 0;

    const novas = todas.filter((vaga) => {
      if (!vaga?.link || vistas.has(vaga.link)) return false;

      const nome = normalizar(vaga.nome || vaga.titulo || "");
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
      `Chat ${user.chatId}: ${novas.length} vagas de ${todas.length} encontradas ` +
        `(${excluidas} excluídas)`,
    );

    if (!novas.length) {
      if (manual) {
        await say(
          env,
          user.chatId,
          "😕 Nenhuma vaga encontrada com esses filtros agora.",
        );
      }
      return true;
    }

    const selecionadas = [];
    const restantes = [];

    for (const fonte of fontes) {
      const daFonte = novas
        .filter((vaga) => normalizar(vaga.fonte) === normalizar(fonte.chave))
        .sort(porData);

      selecionadas.push(...daFonte.slice(0, user.count));
      restantes.push(...daFonte.slice(user.count));
    }

    const dataLocal = new Date(Date.now() + user.tz * 3600000);
    const dataFormatada = dataLocal.toLocaleDateString("pt-BR", {
      timeZone: "UTC",
    });

    const filtroLocal = user.remoto
      ? "🏠 Apenas vagas remotas"
      : user.local
        ? `📍 ${escaparHTML(formatarLocal(user.local))}`
        : "📍 Todo o Brasil";

    const resumo =
      `💼 <b>RELATÓRIO DE VAGAS — ${dataFormatada}</b>\n\n` +
      `${filtroLocal}\n` +
      `📌 Encontramos <b>${novas.length} vagas</b> compatíveis com seus filtros.\n` +
      `📨 Enviamos <b>${selecionadas.length}</b> vagas, respeitando seu limite de ${user.count} por fonte.`;

    let tecladoResumo;

    if (restantes.length) {
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

      await env.KV.put(
        `r:${user.chatId}:${id}`,
        JSON.stringify({ vagas: restantes, resumo }),
        { expirationTtl: RESULTADOS_TTL },
      );

      tecladoResumo = {
        inline_keyboard: [
          [
            btn(
              `💡 Ver todas as ${restantes.length} vagas restantes`,
              `all:${id}:0`,
            ),
          ],
        ],
      };
    }

    for (const fonte of fontes) {
      const daFonte = selecionadas.filter(
        (vaga) => normalizar(vaga.fonte) === normalizar(fonte.chave),
      );

      const mensagens = montarMensagens(fonte.chave, fonte.emoji, daFonte);

      for (const mensagem of mensagens) {
        await say(env, user.chatId, mensagem.texto);

        user.sentJobs += mensagem.vagas.length;
        user.sentMessages++;

        await dormir(PAUSA_MS);
      }
    }

    await say(
      env,
      user.chatId,
      resumo +
        (restantes.length
          ? `\n\n💡 Além dessas, encontramos <b>${restantes.length} vagas</b> que também combinam com você.`
          : "\n\nVocê recebeu todas as vagas encontradas dentro do seu limite."),
      tecladoResumo ? { reply_markup: tecladoResumo } : {},
    );

    return true;
  } catch (error) {
    console.log(
      `Erro ao buscar vagas para ${user.chatId}:`,
      error?.stack || String(error),
    );

    if (manual) {
      await say(
        env,
        user.chatId,
        "⚠️ Ocorreu um erro durante a busca. Tente novamente mais tarde.",
      ).catch(() => {});
    }

    return false;
  } finally {
    await saveUser(env, user);
  }
}

export async function runCron(env, scheduledAt = Date.now()) {
  const agora = Number(scheduledAt) || Date.now();
  const cache = new Map();
  const slotExecucao = new Date(agora).toISOString().slice(0, 13);

  let processados = 0;
  let ignorados = 0;
  let falhas = 0;

  console.log(`Cron iniciado: ${new Date(agora).toISOString()}`);

  const chaves = [];
  let cursor;

  do {
    const pagina = await env.KV.list({
      prefix: "u:",
      ...(cursor ? { cursor } : {}),
      limit: 1000,
    });

    chaves.push(...(pagina.keys || []).map((k) => k.name));

    cursor = pagina.list_complete ? undefined : pagina.cursor;

    if (!pagina.list_complete && !cursor) {
      throw new Error("KV informou listagem incompleta sem cursor.");
    }
  } while (cursor);

  const fila = [];

  await pool(chaves, CONCORRENCIA, async (nome) => {
    try {
      const user = await getUser(env, nome.slice(2));
      const hora = new Date(agora + user.tz * 3600000).getUTCHours();

      if (
        user.paused ||
        !user.include.length ||
        hora !== user.hour ||
        user.lastRunSlot === slotExecucao
      ) {
        ignorados++;
        return;
      }

      fila.push(user);
    } catch (error) {
      falhas++;
      console.log(`Erro lendo ${nome}:`, error?.stack || String(error));
    }
  });

  await pool(fila, CONCORRENCIA, async (user) => {
    try {
      const sucesso = await sendJobs(env, user, { cache });

      if (!sucesso) {
        falhas++;
        console.log(`Falha no envio para ${user.chatId}.`);
        return;
      }

      user.lastRunSlot = slotExecucao;
      await saveUser(env, user);

      processados++;
    } catch (error) {
      falhas++;
      console.log(
        `Erro no cron para ${user.chatId}:`,
        error?.stack || String(error),
      );
    }
  });

  console.log(
    `Cron finalizado | Encontrados: ${chaves.length} | ` +
      `Processados: ${processados} | Ignorados: ${ignorados} | Falhas: ${falhas}`,
  );
}
