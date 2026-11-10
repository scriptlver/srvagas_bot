const axios = require('axios');

const TERMOS = [
  'desenvolvedor',
  'desenvolvedor full stack',
  'desenvolvedor back end',
  'desenvolvedor front end',
  'júnior',
  'junior',
  'estágio',
  'remoto',
];

const URL_API = 'https://portal.gupy.io/api/job-search/jobs';
const POR_PAGINA = 12;
const PAGINAS = 5;        // até 60 vagas por termo antes dos filtros
const MAX_VAGAS = 25;     // quantas vagas (as mais recentes) vão para o Telegram
const PAUSA_MS = 300;     // pausa entre requisições para não sobrecarregar a API

// vagas com estas palavras no título são descartadas (comparação sem acento)
const EXCLUIR = /\b(senior|sr|pleno)\b/;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://portal.gupy.io/job-search',
};

// tenta filtrar remoto já na API; se ela recusar o parâmetro, desliga e filtra só no código
let filtroServidor = true;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// minúsculas e sem acento: "Sênior" -> "senior"
const normalizar = (t) =>
  String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function extrairLista(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.jobs)) return data.jobs;
  if (Array.isArray(data?.data?.jobs)) return data.data.jobs;
  return [];
}

function ehRemoto(v) {
  return v.workplaceType === 'remote' || v.isRemoteWork === true;
}

function mapear(v) {
  const nome = v.name || v.title || '(sem título)';
  const empresa = v.careerPageName || v.company || v.companyName || '';
  const local = v.city ? ` (${v.city}/${v.state})` : '';
  const link = v.jobUrl || v.url || v.applyUrl || (v.id ? `https://portal.gupy.io/job/${v.id}` : null);
  const dataStr = v.publishedDate || v.publishedAt || v.createdAt || null;

  return {
    nome, // título puro, usado nos filtros
    titulo: `${nome}${empresa ? ' - ' + empresa : ''}${local} [remoto]`,
    link,
    fonte: 'Gupy',
    remoto: ehRemoto(v),
    publicadaEm: dataStr ? new Date(dataStr) : null,
  };
}

async function buscarPagina(termo, offset) {
  const params = { jobName: termo, limit: POR_PAGINA, offset, sortBy: 'publishedDate' };
  if (filtroServidor) params['workplaceTypes[]'] = 'remote';

  try {
    const { data } = await axios.get(URL_API, { params, headers: HEADERS, timeout: 15000 });
    return extrairLista(data);
  } catch (erro) {
    if (filtroServidor && erro.response?.status === 400) {
      console.error('  API recusou o filtro de remoto; usando só o filtro local.');
      filtroServidor = false;
      return buscarPagina(termo, offset);
    }
    throw erro;
  }
}

async function buscarTermo(termo) {
  const vagas = [];

  for (let p = 0; p < PAGINAS; p++) {
    const lista = await buscarPagina(termo, p * POR_PAGINA);
    vagas.push(...lista.map(mapear));
    if (lista.length < POR_PAGINA) break;
    await dormir(PAUSA_MS);
  }

  const semData = vagas.filter((v) => !v.publicadaEm).length;
  if (semData > 0) console.error(`  ${semData} vagas sem data em "${termo}"`);

  const remotas = vagas.filter((v) => v.link && v.remoto);
  const semSenior = remotas.filter((v) => !EXCLUIR.test(normalizar(v.nome)));
  console.log(
    `Gupy "${termo}": ${remotas.length} remotas, ${remotas.length - semSenior.length} descartadas (sênior/pleno)`
  );
  return semSenior;
}

async function buscarGupy() {
  const porLink = new Map();

  for (const termo of TERMOS) {
    try {
      const vagas = await buscarTermo(termo);
      vagas.forEach((v) => porLink.set(v.link, v)); // remove duplicadas entre termos
    } catch (erro) {
      console.error(`Gupy falhou em "${termo}":`, erro.response?.status || erro.message);
    }
    await dormir(PAUSA_MS);
  }

  const maisRecentes = [...porLink.values()]
    .sort((a, b) => (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0))
    .slice(0, MAX_VAGAS);

  console.log(`Total: ${porLink.size} vagas únicas, enviando as ${maisRecentes.length} mais recentes.`);
  return maisRecentes;
}

module.exports = { buscarGupy };