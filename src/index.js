import { addTerms, parseTerms } from "./utils.js";
import { CHAVES_FONTES, MAX_FONTES, sanitizarFontes } from "./sources.js";
import { getUser, saveUser } from "./user.js";
import { tg, say, editarMensagem } from "./telegram.js";
import { parseLocal } from "./local.js";
import {
  mainView,
  configView,
  fontesView,
  hourView,
  countView,
  tzView,
  termsView,
  localView,
} from "./views.js";
import { sendJobs, runCron, mostrarPaginaRestantes } from "./jobs.js";

async function onMessage(env, mensagem) {
  if (!mensagem?.chat?.id) return;

  const chatId = mensagem.chat.id;
  const texto = (mensagem.text || "").trim();
  if (!texto) return;

  const user = await getUser(env, chatId);
  if (mensagem.from?.first_name) user.nome = mensagem.from.first_name;
  const [comandoOriginal, ...resto] = texto.split(/\s+/);
  const comando = comandoOriginal.startsWith("/")
    ? comandoOriginal.split("@")[0].toLowerCase()
    : null;
  const argumento = resto.join(" ");

  const mostrarMenu = async (prefixo = "") => {
    const view = mainView(user);
    return say(env, chatId, prefixo + view.text, {
      reply_markup: { inline_keyboard: view.kb },
    });
  };

  if (comando) {
    if (comando === "/start" || comando === "/menu") {
      user.awaiting = null;
      await saveUser(env, user);
      return mostrarMenu(
        comando === "/start" ? "👋 Oi! Eu busco vagas pra você.\n\n" : "",
      );
    }

    if (comando === "/buscar") {
      user.awaiting = null;
      return sendJobs(env, user, { manual: true });
    }

    if (comando === "/incluir" || comando === "/excluir") {
      const tipo = comando === "/incluir" ? "include" : "exclude";

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

    if (comando === "/local") {
      if (!argumento) {
        user.awaiting = "local";
        await saveUser(env, user);
        const view = localView(user);
        return say(env, chatId, view.text, {
          reply_markup: { inline_keyboard: view.kb },
        });
      }

      const local = parseLocal(argumento);
      if (!local) {
        return say(env, chatId, "Não entendi. Ex: Belo Horizonte, MG");
      }

      user.local = local;
      user.awaiting = null;
      await saveUser(env, user);
      return mostrarMenu("📍 Localização salva!\n\n");
    }

    if (comando === "/cancelar") {
      user.awaiting = null;
      await saveUser(env, user);
      return say(env, chatId, "Ok, cancelado.");
    }

    return;
  }

  if (user.awaiting === "local") {
    const local = parseLocal(texto);
    if (!local) {
      return say(env, chatId, "Não entendi. Ex: Belo Horizonte, MG");
    }

    user.local = local;
    user.awaiting = null;
    await saveUser(env, user);
    return mostrarMenu("📍 Localização salva!\n\n");
  }

  if (user.awaiting === "include" || user.awaiting === "exclude") {
    addTerms(user[user.awaiting], parseTerms(texto));
    user.awaiting = null;
    await saveUser(env, user);
    return mostrarMenu("✔️ Salvo!\n\n");
  }
}

async function onCallback(env, callback) {
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  if (!chatId || !messageId) return;

  const data = callback.data || "";

  if (!data.startsWith("s:")) {
    await tg(env, "answerCallbackQuery", { callback_query_id: callback.id });
  }

  if (data.startsWith("all:")) {
    const [, id, pagina] = data.split(":");
    if (!/^[a-f0-9]{12}$/i.test(id || "")) return;

    return mostrarPaginaRestantes(
      env,
      chatId,
      messageId,
      id,
      pagina === "back" ? "back" : pagina,
    );
  }

  const user = await getUser(env, chatId);
  if (callback.from?.first_name) user.nome = callback.from.first_name;
  let view;

  if (data === "menu") {
    user.awaiting = null;
    view = mainView(user);
  } else if (data === "cfg") {
    user.awaiting = null;
    view = configView(user);
  } else if (data === "hour") {
    view = hourView(user);
  } else if (data === "count") {
    view = countView(user);
  } else if (data === "tz") {
    view = tzView(user);
  } else if (data === "src") {
    view = fontesView(user);
  } else if (data.startsWith("s:")) {
    const chave = data.slice(2);

    if (!CHAVES_FONTES.includes(chave)) {
      return tg(env, "answerCallbackQuery", { callback_query_id: callback.id });
    }

    const atuais = sanitizarFontes(user.fontes);
    let novas;

    if (atuais.includes(chave)) {
      if (atuais.length === 1) {
        return tg(env, "answerCallbackQuery", {
          callback_query_id: callback.id,
          text: "Mantenha pelo menos 1 fonte ativa.",
          show_alert: true,
        });
      }

      novas = atuais.filter((c) => c !== chave);
    } else {
      if (atuais.length >= MAX_FONTES) {
        return tg(env, "answerCallbackQuery", {
          callback_query_id: callback.id,
          text: `Limite de ${MAX_FONTES} fontes. Desmarque uma antes de escolher outra.`,
          show_alert: true,
        });
      }

      novas = [...atuais, chave];
    }

    user.fontes = CHAVES_FONTES.filter((c) => novas.includes(c));

    await tg(env, "answerCallbackQuery", { callback_query_id: callback.id });
    view = fontesView(user);
  } else if (data === "rem") {
    user.remoto = !user.remoto;
    view = configView(user);
  } else if (data === "pause") {
    user.paused = !user.paused;
    view = mainView(user);
  } else if (data.startsWith("h:")) {
    const hour = Number(data.slice(2));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
    user.hour = hour;
    view = configView(user);
  } else if (data.startsWith("c:")) {
    const count = Number(data.slice(2));
    if (![5, 10, 15, 20, 25, 30, 40, 50].includes(count)) return;
    user.count = count;
    view = configView(user);
  } else if (data.startsWith("z:")) {
    const timezone = Number(data.slice(2));
    if (!Number.isInteger(timezone) || timezone < -12 || timezone > 14) return;
    user.tz = timezone;
    view = configView(user);
  } else if (data === "loc") {
    user.awaiting = "local";
    view = localView(user);
  } else if (data === "loc:clr") {
    user.local = null;
    user.awaiting = "local";
    view = localView(user);
  } else if (data === "inc" || data === "exc") {
    const tipo = data === "inc" ? "include" : "exclude";
    user.awaiting = tipo;
    view = termsView(user, tipo);
  } else if (data.startsWith("clr:")) {
    const tipo = data.slice(4);
    if (!["include", "exclude"].includes(tipo)) return;
    user[tipo] = [];
    user.awaiting = tipo;
    view = termsView(user, tipo);
  } else if (data === "now") {
    await tg(env, "sendChatAction", { chat_id: chatId, action: "typing" });
    return sendJobs(env, user, { manual: true });
  } else {
    return;
  }

  await saveUser(env, user);

  await editarMensagem(env, {
    chat_id: chatId,
    message_id: messageId,
    text: view.text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: view.kb },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/setup") {
      if (
        !env.WEBHOOK_SECRET ||
        url.searchParams.get("key") !== env.WEBHOOK_SECRET
      ) {
        return new Response("forbidden", { status: 403 });
      }

      const webhook = await tg(env, "setWebhook", {
        url: `${url.origin}/webhook`,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
      });

      const comandos = await tg(env, "setMyCommands", {
        commands: [
          { command: "menu", description: "Abrir configurações" },
          { command: "buscar", description: "Buscar vagas agora" },
          { command: "local", description: "Definir localização das vagas" },
          { command: "incluir", description: "Adicionar termos de busca" },
          { command: "excluir", description: "Adicionar termos a excluir" },
          { command: "cancelar", description: "Cancelar operação atual" },
        ],
      });

      return Response.json({ success: true, webhook, comandos });
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      if (
        !env.WEBHOOK_SECRET ||
        request.headers.get("X-Telegram-Bot-Api-Secret-Token") !==
          env.WEBHOOK_SECRET
      ) {
        return new Response("forbidden", { status: 403 });
      }

      const update = await request.json();

      if (update.callback_query) {
        ctx.waitUntil(
          onCallback(env, update.callback_query).catch((error) => {
            console.log("Erro no callback:", String(error));
          }),
        );
      } else if (update.message) {
        ctx.waitUntil(
          onMessage(env, update.message).catch((error) => {
            console.log("Erro na mensagem:", String(error));
          }),
        );
      }

      return new Response("ok");
    }

    return new Response("vagas-bot ok");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runCron(env, event.scheduledTime).catch((error) => {
        console.log(
          "Falha na execução do Cron:",
          error?.stack || String(error),
        );
      }),
    );
  },
};
