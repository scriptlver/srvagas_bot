import { dormir, normalizar } from '../util.js';

const URL_API = 'https://portal.gupy.io/api/job-search/jobs';
const POR_PAGINA = 12;
const PAGINAS = 3;
const MAX_VAGAS = 100;
const PAUSA_MS = 200;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://portal.gupy.io/job-search',
};

function extrairLista(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.jobs)) return data.jobs;
  if (Array.isArray(data?.data?.jobs)) return data.data.jobs;
  return [];
}

function ehRemoto(v) {
  if (v.isRemoteWork === true || v.remote === true) return true;
  return normalizar(v.workplaceType || v.workModel || v.modality).includes('remot');
}

function mapear(v, remoto) {
  const nome = v.name || v.title || '(sem título)';
  const empresa = v.careerPageName || v.company || v.companyName || '';
  const local = v.city ? ` (${v.city}/${v.state})` : '';
  const link = v.jobUrl || v.url || v.applyUrl || (v.id ? `https://portal.gupy.io/job/${v.id}` : null);
  const dataStr = v.publishedDate || v.publishedAt || v.createdAt || null;
  const ehRem = ehRemoto(v);
  return {
    nome,
    titulo: `${nome}${empresa ? ' - ' + empresa : ''}${local}${ehRem ? ' [remoto]' : ''}`,
    link,
    fonte: 'Gupy',
    remoto: ehRem,
    publicadaEm: dataStr ? new Date(dataStr) : null,
  };
}

async function buscarPagina(termo, offset, est) {
  const p = new URLSearchParams({ jobName: termo, limit: POR_PAGINA, offset, sortBy: 'publishedDate' });
  if (est.filtroServidor) p.set('workplaceTypes[]', 'remote');

  const r = await fetch(`${URL_API}?${p}`, { headers: HEADERS });
  if (!r.ok) {
    if (est.filtroServidor && r.status === 400) {
      console.log('  Gupy recusou o filtro de remoto; usando só o filtro local.');
      est.filtroServidor = false;
      return buscarPagina(termo, offset, est);
    }
    throw new Error(`HTTP ${r.status}`);
  }
  return extrairLista(await r.json());
}

async function buscarTermo(termo, remoto, est) {
  const vagas = [];
  for (let p = 0; p < PAGINAS; p++) {
    let lista = await buscarPagina(termo, p * POR_PAGINA, est);
    if (p === 0 && lista.length === 0 && est.filtroServidor) {
      console.log('  Filtro de remoto retornou vazio; tentando sem ele.');
      est.filtroServidor = false;
      lista = await buscarPagina(termo, 0, est);
    }
    vagas.push(...lista.map((v) => mapear(v, remoto)));
    if (lista.length < POR_PAGINA) break;
    await dormir(PAUSA_MS);
  }
  const comLink = vagas.filter((v) => v.link);
  return remoto ? comLink.filter((v) => v.remoto) : comLink;
}

export async function buscarGupy({ termos, remoto, cache = new Map() }) {
  const est = { filtroServidor: remoto };

  const listas = await Promise.all(
    termos.map(async (termo) => {
      const chave = `gupy|${termo}|${remoto}`;
      if (cache.has(chave)) return cache.get(chave);
      try {
        const v = await buscarTermo(termo, remoto, est);
        console.log(`Gupy "${termo}": ${v.length} vagas`);
        cache.set(chave, v);
        return v;
      } catch (e) {
        console.log(`Gupy falhou em "${termo}":`, e.message);
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