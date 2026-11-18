// Scraper do Vagas.com.br — vai em src/scrapers/vagas.js
//
// A página de busca (https://www.vagas.com.br/vagas-de-<termo>) vem com a lista
// de vagas no próprio HTML, então não precisa de navegador. Cada vaga tem um link
// no formato /vagas/v<ID>/<slug> com o título no atributo title.

const BASE = 'https://www.vagas.com.br';
const FONTE = 'Vagas.com';

// Cada termo vira 1 requisição. Limita para não gastar o orçamento de
// subrequests do Worker (o cache evita repetir a mesma busca entre usuários).
const MAX_TERMOS_VAGAS = 3;
const TIMEOUT_MS = 8000;

const slugify = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const decodificar = (texto) =>
  String(texto || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

const tituloDoSlug = (slug) => {
  const texto = slug.replace(/-/g, ' ').trim();
  return texto ? texto[0].toUpperCase() + texto.slice(1) : 'Vaga';
};

function parseData(texto) {
  if (/hoje/i.test(texto)) return new Date().toISOString();
  if (/ontem/i.test(texto)) return new Date(Date.now() - 86400000).toISOString();

  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;

  const data = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function parsePagina(html) {
  const porId = new Map();
  const anchor = /<a\b[^>]*href="([^"]*\/vagas\/v(\d+)\/([^"#?]*))[^"]*"[^>]*>/gi;

  let match;

  while ((match = anchor.exec(html)) !== null) {
    const [tag, href, id, slug] = match;
    const titulo = decodificar((tag.match(/title="([^"]*)"/i) || [])[1]);

    const atual = porId.get(id);

    if (atual) {
      // O mesmo id pode aparecer em mais de um link (logo + título)
      if (!atual.titulo && titulo) atual.titulo = titulo;
      continue;
    }

    const link = href.startsWith('http') ? href : `${BASE}${href}`;
    const janela = html.slice(match.index, match.index + 2500);

    porId.set(id, {
      titulo,
      slug,
      link: link.split('?')[0],
      publicadaEm: parseData(janela),
    });
  }

  return [...porId.values()].map((vaga) => {
    const titulo = vaga.titulo || tituloDoSlug(vaga.slug);

    return {
      titulo,
      nome: titulo,
      link: vaga.link,
      fonte: FONTE,
      publicadaEm: vaga.publicadaEm,
    };
  });
}

async function buscarTermo(slug, remoto, cache) {
  const chave = `vagas:${slug}:${remoto ? 1 : 0}`;

  if (cache.has(chave)) return cache.get(chave);

  const promessa = (async () => {
    const params = new URLSearchParams({ ordenar_por: 'mais_recentes' });

    if (remoto) {
      params.append('m[]', 'Home Office');
      params.append('m[]', 'Empresa e Home Office');
    }

    const response = await fetch(`${BASE}/vagas-de-${slug}?${params}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://www.vagas.com.br/',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Vagas.com HTTP ${response.status} (${slug})`);
    }

    return parsePagina(await response.text());
  })();

  cache.set(chave, promessa);

  // Se falhar, não deixa a falha presa no cache
  promessa.catch(() => cache.delete(chave));

  return promessa;
}

export async function buscarVagas({ termos = [], remoto = true, cache = new Map() } = {}) {
  const slugs = [...new Set(termos.map(slugify).filter(Boolean))].slice(0, MAX_TERMOS_VAGAS);

  const resultados = await Promise.allSettled(
    slugs.map((slug) => buscarTermo(slug, remoto, cache)),
  );

  const vistos = new Set();
  const vagas = [];

  resultados.forEach((resultado, index) => {
    if (resultado.status === 'rejected') {
      console.log(`Vagas.com falhou (${slugs[index]}):`, resultado.reason?.message || resultado.reason);
      return;
    }

    for (const vaga of resultado.value) {
      if (vistos.has(vaga.link)) continue;
      vistos.add(vaga.link);
      vagas.push(vaga);
    }
  });

  return vagas;
}