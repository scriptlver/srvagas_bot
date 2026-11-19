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
    return say(
      env,
      user.chatId,
      "Você ainda não definiu termos para buscar. Use /menu → ✅ Incluir termos.",
    );
  }

  try {
    const termos = user.include.slice(0, MAX_TERMOS);
    const fontes = fontesAtivas(user);

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
      return;
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
  } catch (error) {
    console.log("Erro ao buscar vagas:", error);

    if (manual) {
      await say(
        env,
        user.chatId,
        "⚠️ Ocorreu um erro durante a busca. Tente novamente mais tarde.",
      ).catch(() => {});
    }
  } finally {
    await saveUser(env, user);
  }
}

export async function runCron(env) {
  const agora = Date.now();
  const cache = new Map();
  let cursor;

  do {
    const pagina = await env.KV.list({ prefix: "u:", cursor, limit: 1000 });

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
        console.log("Erro no cron:", item.name, String(error));
      }
    }

    cursor = pagina.list_complete ? undefined : pagina.cursor;
  } while (cursor);
}