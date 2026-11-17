import { normalizar } from '../util.js';

const MAX_VAGAS = 100;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const slug = (t) => normalizar(t).trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Procura recursivamente um array de objetos que pareçam vagas.
function acharVagas(no, profundidade = 0) {
  if (!no || typeof no !== 'object' || profundidade > 12) return [];

  if (Array.isArray(no)) {
    const pareceVaga = no.length && no.every(
      (i) => i && typeof i === 'object' && (i.title || i.titulo || i.vagaTitulo) && (i.id || i.url || i.slug),
    );
    if (pareceVaga) return no;
  }

  for (const valor of Object.values(no)) {
    const achou = acharVagas(valor, profundidade + 1);
    if (achou.length) return achou;
  }
  return [];
}

function viaNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) return [];
  try {
    return acharVagas(JSON.parse(m[1]));
  } catch {
    return [];
  }
}

function viaLinks(html) {
  const vagas = [];
  const re = /href="((?:https:\/\/www\.catho\.com\.br)?\/vagas\/[^"]+\/\d+\/?)"[^>]*>([^<]{5,})</g;
  let m;
  while ((m = re.exec(html))) vagas.push({ url: m[1], title: m[2].trim(), id: m[1] });
  return vagas;
}

function mapear(v) {
  const nome = v.title || v.titulo || v.vagaTitulo || '(sem título)';
  const empresa = v.companyName || v.company?.name || v.empresa || '';
  const local = v.location || v.city || v.cidade || '';
  const dataStr = v.publishedAt || v.createdAt || v.data || null;

  let link = v.url || null;
  if (!link && v.slug && v.id) link = `/vagas/${v.slug}/${v.id}/`;
  if (link && link.startsWith('/')) link = `https://www.catho.com.br${link}`;

  const texto = normalizar(`${nome} ${local} ${v.workModel || ''}`);
  const remoto = texto.includes('remot') || texto.includes('home office');

  return {
    nome,
    titulo: `${nome}${empresa ? ` - ${empresa}` : ''}${local ? ` (${local})` : ''}${remoto ? ' [remoto]' : ''}`,
    link,
    fonte: 'Catho',
    remoto,
    publicadaEm: dataStr ? new Date(dataStr) : null,
  };
}

async function buscarTermo(termo, remoto) {
  const busca = remoto ? `${termo} home office` : termo;
  const url = `https://www.catho.com.br/vagas/${slug(busca)}/?q=${encodeURIComponent(busca)}`;

  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`Catho HTTP ${response.status}`);

  const html = await response.text();
  let brutas = viaNextData(html);
  if (!brutas.length) brutas = viaLinks(html);

  // Catho nem sempre marca modelo de trabalho: não filtramos por remoto aqui,
  // a busca já inclui "home office" no termo.
  return brutas.map(mapear).filter((v) => v.link);
}

export async function buscarCatho({ termos = [], remoto = true, cache = new Map() } = {}) {
  const listas = await Promise.all(
    termos.map(async (termo) => {
      const chave = `catho|${termo}|${remoto}`;
      if (cache.has(chave)) return cache.get(chave);
      try {
        const vagas = await buscarTermo(termo, remoto);
        console.log(`Catho "${termo}": ${vagas.length} vagas`);
        cache.set(chave, vagas);
        return vagas;
      } catch (error) {
        console.log(`Catho falhou em "${termo}":`, error.message);
        return [];
      }
    }),
  );

  const porLink = new Map();
  listas.flat().forEach((v) => porLink.set(v.link, v));

  return [...porLink.values()]
    .sort((a, b) => (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0))
    .slice(0, MAX_VAGAS);
}