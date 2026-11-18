import { dormir, normalizar } from '../utils.js';

const URL_API = 'https://vagas.solides.com.br/api/vacancies';
const POR_PAGINA = 14;
const PAGINAS = 2;
const MAX_VAGAS = 100;
const PAUSA_MS = 200;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Referer: 'https://vagas.solides.com.br/vagas/area/tecnologia/todas',
};

function ehRemoto(v) {
  return v.homeOffice === true || normalizar(v.jobType) === 'remoto';
}

function mapear(v) {
  const nome = String(v.title || '(sem título)').trim();
  const empresa = v.companyName || '';
  const cidade = v.city?.name || '';
  const uf = v.state?.code || '';
  const local = cidade ? ` (${cidade}${uf ? `/${uf}` : ''})` : '';
  const remoto = ehRemoto(v);

  return {
    nome,
    titulo: `${nome}${empresa ? ` - ${empresa}` : ''}${local}${remoto ? ' [remoto]' : ''}`,
    link: v.id ? `https://vagas.solides.com.br/vaga/${v.id}` : null,
    fonte: 'Solides',
    remoto,
    publicadaEm: v.createdAt ? new Date(v.createdAt) : null,
  };
}

async function buscarPagina(termo, pagina) {
  const params = new URLSearchParams({
    page: String(pagina),
    take: String(POR_PAGINA),
    occupationAreas: 'tecnologia',
    locations: '',
    title: termo,
  });

  const response = await fetch(`${URL_API}?${params}`, { headers: HEADERS });

  if (!response.ok) {
    const corpo = (await response.text()).slice(0, 200);
    console.log(`Solides HTTP ${response.status}: ${corpo}`);
    throw new Error(`Solides HTTP ${response.status}`);
  }

  const json = await response.json();
  return {
    lista: Array.isArray(json?.data) ? json.data : [],
    totalPaginas: Number(json?.totalPages) || 1,
  };
}

async function buscarTermo(termo, remoto) {
  const vagas = [];

  for (let pagina = 1; pagina <= PAGINAS; pagina++) {
    const { lista, totalPaginas } = await buscarPagina(termo, pagina);
    vagas.push(...lista.filter((v) => !v.isDisabled).map(mapear));

    if (!lista.length || pagina >= totalPaginas) break;
    if (pagina < PAGINAS) await dormir(PAUSA_MS);
  }

  const comLink = vagas.filter((v) => v.link);
  return remoto ? comLink.filter((v) => v.remoto) : comLink;
}

export async function buscarSolides({ termos = [], remoto = true, cache = new Map() } = {}) {
  const listas = await Promise.all(
    termos.map(async (termo) => {
      const chave = `solides|${termo}|${remoto}`;
      if (cache.has(chave)) return cache.get(chave);

      try {
        const vagas = await buscarTermo(termo, remoto);
        console.log(`Solides "${termo}": ${vagas.length} vagas`);
        cache.set(chave, vagas);
        return vagas;
      } catch (error) {
        console.log(`Solides falhou em "${termo}":`, error.message);
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