import { buscarGupy } from './scrapers/gupy.js';
import { buscarSolides } from './scrapers/solides.js';

export const MAX_FONTES = 2;

export const FONTES = [
  { chave: 'Gupy', emoji: '🟣', buscar: buscarGupy },
  { chave: 'Solides', emoji: '🟠', buscar: buscarSolides },
];

export const CHAVES_FONTES = FONTES.map((f) => f.chave);
export const FONTES_PADRAO = CHAVES_FONTES.slice(0, MAX_FONTES);

export function sanitizarFontes(lista) {
  const validas = Array.isArray(lista)
    ? CHAVES_FONTES.filter((chave) => lista.includes(chave))
    : [];

  const final = validas.slice(0, MAX_FONTES);
  return final.length ? final : [...FONTES_PADRAO];
}

export const fontesAtivas = (user) =>
  FONTES.filter((fonte) => sanitizarFontes(user.fontes).includes(fonte.chave));