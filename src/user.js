import { FONTES_PADRAO, sanitizarFontes } from "./sources.js";

function sanitizarLocal(local) {
  if (!local || typeof local !== "object") return null;

  const cidade = typeof local.cidade === "string" ? local.cidade : "";
  const estado = typeof local.estado === "string" ? local.estado : "";

  return cidade || estado ? { cidade, estado } : null;
}

function numeroValido(valor, minimo, maximo, padrao) {
  const numero = Number(valor);

  if (
    !Number.isInteger(numero) ||
    numero < minimo ||
    numero > maximo
  ) {
    return padrao;
  }

  return numero;
}

export const DEFAULTS = {
  nome: "",
  hour: 9,
  count: 25,
  tz: -3,
  remoto: true,
  local: null,
  fontes: [...FONTES_PADRAO],
  include: [],
  exclude: [],
  paused: false,
  awaiting: null,
  sentJobs: 0,
  sentMessages: 0,
  lastRun: "",
  lastRunSlot: "",
};

export function criarUsuario(chatId) {
  return {
    ...DEFAULTS,
    include: [...DEFAULTS.include],
    exclude: [...DEFAULTS.exclude],
    fontes: [...DEFAULTS.fontes],
    chatId: String(chatId),
  };
}

export async function getUser(env, chatId) {
  const id = String(chatId);
  const salvo = await env.KV.get(`u:${id}`, "json");

  if (!salvo) return criarUsuario(id);

  const usuario = {
    ...criarUsuario(id),
    ...salvo,

    chatId: id,

    hour: numeroValido(
      salvo.hour,
      0,
      23,
      DEFAULTS.hour,
    ),

    tz: numeroValido(
      salvo.tz,
      -12,
      14,
      DEFAULTS.tz,
    ),

    count: [5, 10, 15, 20, 25, 30, 40, 50].includes(
      Number(salvo.count),
    )
      ? Number(salvo.count)
      : DEFAULTS.count,

    include: Array.isArray(salvo.include)
      ? salvo.include
      : [...DEFAULTS.include],

    exclude: Array.isArray(salvo.exclude)
      ? salvo.exclude
      : [...DEFAULTS.exclude],

    fontes: sanitizarFontes(salvo.fontes),

    local: sanitizarLocal(salvo.local),

    sentJobs: Number.isFinite(salvo.sentJobs)
      ? salvo.sentJobs
      : 0,

    sentMessages: Number.isFinite(salvo.sentMessages)
      ? salvo.sentMessages
      : 0,

    lastRunSlot:
      typeof salvo.lastRunSlot === "string"
        ? salvo.lastRunSlot
        : "",
  };

  delete usuario.sent;

  return usuario;
}

export async function saveUser(env, user) {
  await env.KV.put(
    `u:${user.chatId}`,
    JSON.stringify(user),
  );
}
