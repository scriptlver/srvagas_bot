import { FONTES_PADRAO, sanitizarFontes } from './sources.js';

const LEGACY_INCLUDE = [
  'desenvolvedor',
  'desenvolvedor full stack',
  'desenvolvedor back end',
  'desenvolvedor front end',
  'júnior',
  'junior',
  'estágio',
  'remoto',
];

const LEGACY_EXCLUDE = [
  'senior', 'sr', 'pleno', 'pl', 'ii', 'iii',
  'n1', 'n2', 'n3', 'hibrido', 'hibrida',
  'pcd', 'mid', 'consultor', 'php', '.net', 'angular',
];

const mesmaLista = (a, b) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

export const DEFAULTS = {
  nome: '',
  hour: 9,
  count: 25,
  tz: -3,
  remoto: true,
  fontes: [...FONTES_PADRAO],
  include: [],
  exclude: [],
  paused: false,
  awaiting: null,
  sentJobs: 0,
  sentMessages: 0,
  lastRun: '',
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
  const salvo = await env.KV.get(`u:${id}`, 'json');

  if (!salvo) return criarUsuario(id);

  const usuario = {
    ...criarUsuario(id),
    ...salvo,
    chatId: id,
    include: Array.isArray(salvo.include) ? salvo.include : [...DEFAULTS.include],
    exclude: Array.isArray(salvo.exclude) ? salvo.exclude : [...DEFAULTS.exclude],
    fontes: sanitizarFontes(salvo.fontes),
    sentJobs: Number.isFinite(salvo.sentJobs) ? salvo.sentJobs : 0,
    sentMessages: Number.isFinite(salvo.sentMessages) ? salvo.sentMessages : 0,
  };

  delete usuario.sent;

  if (mesmaLista(usuario.include, LEGACY_INCLUDE)) usuario.include = [];
  if (mesmaLista(usuario.exclude, LEGACY_EXCLUDE)) usuario.exclude = [];

  return usuario;
}

export async function saveUser(env, user) {
  await env.KV.put(`u:${user.chatId}`, JSON.stringify(user));
}