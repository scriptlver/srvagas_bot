import { dormir, normalizar } from '../util.js';

const URL_API = 'https://querovagastech.com.br/api/jobs';
const SITE = 'https://querovagastech.com.br/vagas';
const POR_PAGINA = 30;
const MAX_PAGINAS = 6;
const DIAS = 7;
const MAX_VAGAS = 100;
const PAUSA_MS = 500;
const IGNORAR_FONTES = /gupy/i;
const SENIORIDADES_FORA = ['mid', 'senior', 'staff', 'lead', 'principal'];

const EXCLUIR = /\b(senior|sr|pleno|pl|ii|iii|n1|n2|n3|hibrido|hibrida|pcd|mid|consultor|php|\.net|angular)\b/;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  Accept: 'application/json',
};

function parseData(valor) {
  if (!valor) return null;
  const texto = String(valor).replace(/(\.\d{3})\d+/, '$1');
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
}

function ehRemoto(valor) {
  const modo = normalizar(valor);
  return modo === 'remote' || modo.includes('remot');
}

function mapear(vaga) {
  const nome = String(vaga.title || '').replace(/^vaga:\s*/i, '').trim();
  const local = vaga.location && normalizar(vaga.location) !== 'br'
    ? ` (${vaga.location})`
    : '';
  const link = /^https?:\/\//i.test(vaga.applyUrl || '')
    ? vaga.applyUrl
    : vaga.id
      ? `${SITE}/${vaga.id}`
      : null;

  return {
    nome,
    titulo: `${nome}${vaga.company ? ` - ${vaga.company}` : ''}${local}${ehRemoto(vaga.workMode) ? ' [remoto]' : ''}`,
    link,
    fonte: 'QueroVagas',
    remoto: ehRemoto(vaga.workMode),
    publicadaEm: parseData(vaga.postedAt),
    workMode: vaga.workMode || '',
    seniority: vaga.seniority || '',
    origem: vaga.sourceName || '',
  };
}

function correspondeTermos(vaga, termos) {
  if (!termos.length) return true;
  const titulo = normalizar(vaga.nome || vaga.titulo);
  return termos.some((termo) => {
    const busca = normalizar(termo);
    return busca && titulo.includes(busca);
  });
}

async function buscarPagina(page) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(POR_PAGINA),
    sort: 'postedAt:desc',
  });

  const response = await fetch(`${URL_API}?${params}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function buscarTodas() {
  const limite = Date.now() - DIAS * 24 * 60 * 60 * 1000;
  const todas = [];

  for (let page = 1; page <= MAX_PAGINAS; page++) {
    let data;

    try {
      data = await buscarPagina(page);
    } catch (error) {
      console.log(`QueroVagas falhou na página ${page}:`, error.message);
      break;
    }

    const itens = Array.isArray(data?.items) ? data.items : [];
    if (!itens.length) break;

    todas.push(...itens.map(mapear));

    if (data.isLimited) {
      console.log('QueroVagas: API limitou o acesso anônimo; usando os resultados recebidos.');
      break;
    }

    const ultima = parseData(itens[itens.length - 1]?.postedAt);
    if (ultima && ultima.getTime() < limite) break;
    if (todas.length >= (Number(data.total) || Infinity)) break;

    await dormir(PAUSA_MS);
  }

  return todas.filter((vaga) =>
    vaga.link && (!vaga.publicadaEm || vaga.publicadaEm.getTime() >= limite),
  );
}

export async function buscarQueroVagas({ termos = [], remoto = true, cache = new Map() } = {}) {
  const chave = `querovagas|${normalizar(termos.join('|'))}|${remoto}`;

  if (cache.has(chave)) return cache.get(chave);

  try {
    const todas = await buscarTodas();

    const finais = todas.filter((vaga) => {
      const titulo = normalizar(vaga.nome);
      const senioridade = normalizar(vaga.seniority);

      if (remoto && !vaga.remoto) return false;
      if (!correspondeTermos(vaga, termos)) return false;
      if (EXCLUIR.test(titulo)) return false;
      if (SENIORIDADES_FORA.includes(senioridade)) return false;
      if (IGNORAR_FONTES.test(vaga.origem)) return false;

      return true;
    });

    console.log(
      `QueroVagas: ${todas.length} recentes, ${finais.length} após filtros`,
    );

    const porLink = new Map();
    finais.forEach((vaga) => porLink.set(vaga.link, vaga));

    const resultado = [...porLink.values()]
      .sort((a, b) => (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0))
      .slice(0, MAX_VAGAS);

    cache.set(chave, resultado);
    return resultado;
  } catch (error) {
    console.log('QueroVagas falhou:', error.message);
    return [];
  }
}
