import { buscarGupy } from './scrapers/gupy.js';
import { buscarSolides } from './scrapers/solides.js';
import { buscarVagas } from './scrapers/vagas.js';

// Máximo de fontes que cada usuário pode ativar ao mesmo tempo
// (controla o orçamento de subrequests do Worker)
export const MAX_FONTES = 2;

// Para adicionar uma fonte nova: importe o scraper acima e inclua uma linha aqui.
// O scraper deve devolver as vagas com `fonte` igual à `chave`.
export const FONTES = [
  { chave: 'Gupy', emoji: '🟣', buscar: buscarGupy },
  { chave: 'Solides', emoji: '🟠', buscar: buscarSolides },
  { chave: 'Vagas.com', emoji: '🟢', buscar: buscarVagas },
];

export const CHAVES_FONTES = FONTES.map((f) => f.chave);
export const FONTES_PADRAO = CHAVES_FONTES.slice(0, MAX_FONTES);

// Valida as fontes salvas: só chaves existentes, sem repetir, no máximo MAX_FONTES.
// Usuários antigos (sem `fontes`) caem no padrão automaticamente.
export function sanitizarFontes(lista) {
  const validas = Array.isArray(lista)
    ? CHAVES_FONTES.filter((chave) => lista.includes(chave))
    : [];

  const final = validas.slice(0, MAX_FONTES);
  return final.length ? final : [...FONTES_PADRAO];
}

export const fontesAtivas = (user) =>
  FONTES.filter((fonte) => sanitizarFontes(user.fontes).includes(fonte.chave));