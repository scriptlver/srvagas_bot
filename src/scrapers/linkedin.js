const axios = require('axios');
const cheerio = require('cheerio');

const TERMOS = [
  'desenvolvedor júnior',
  'desenvolvedor full stack',
  'desenvolvedor back end',
  'desenvolvedor front end',
  'estágio desenvolvedor',
];

const URL_API = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const PAGINAS = 2;          // 2 x 25 = até 50 vagas por termo
const MAX_VAGAS = 25;
const PAUSA_MS = 1500;      // pausa generosa para não ser bloqueado
const PERIODO = 'r604800';  // r86400 = 24h | r604800 = 7 dias | r2592000 = 30 dias
const NIVEIS = '';          // opcional: '1,2' = estágio e júnior (f_E)

const INCLUIR = /\b(desenvolvedor|desenvolvedora|developer|dev|programador|programadora|software|full ?stack|back ?end|front ?end|estagio|estagiario|estagiaria|junior|jr)\b/;
const EXCLUIR = /\b(senior|sr|pleno|pl|ii|iii|n1|n2|n3|hibrido|hibrida)\b/;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const normalizar = (t) =>
  String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function parsear(html) {
  const $ = cheerio.load(html);
  const vagas = [];

  $('li').each((_, el) => {
    const nome = $(el).find('.base-search-card__title').text().trim();
    const empresa = $(el).find('.base-search-card__subtitle').text().trim();
    const local = $(el).find('.job-search-card__location').text().trim();
    const href = $(el).find('a.base-card__full-link').attr('href');
    const dataStr = $(el).find('time').attr('datetime');
    if (!nome || !href) return;

    vagas.push({
      nome,
      titulo: `${nome} - ${empresa}${local ? ` (${local})` : ''} [remoto]`,
      link: href.split('?')[0], // tira os parâmetros de rastreamento
      fonte: 'LinkedIn',
      publicadaEm: dataStr ? new Date(dataStr) : null,
    });
  });

  return vagas;
}

async function buscarTermo(termo) {
  const vagas = [];

  for (let p = 0; p < PAGINAS; p++) {
    const params = {
      keywords: termo,
      location: 'Brazil',
      f_WT: 2,            // remoto
      f_TPR: PERIODO,
      sortBy: 'DD',       // mais recentes primeiro
      start: p * 25,
    };
    if (NIVEIS) params.f_E = NIVEIS;

    const { data } = await axios.get(URL_API, { params, headers: HEADERS, timeout: 15000 });
    const pagina = parsear(data);
    if (p === 0 && pagina.length === 0) console.error(`  LinkedIn "${termo}": nenhum card encontrado no HTML.`);

    vagas.push(...pagina);
    if (pagina.length === 0) break;
    await dormir(PAUSA_MS);
  }

  const finais = vagas.filter((v) => {
    const t = normalizar(v.nome);
    return INCLUIR.test(t) && !EXCLUIR.test(t);
  });
  console.log(`LinkedIn "${termo}": ${vagas.length} vagas, ${finais.length} após filtros`);
  return finais;
}

async function buscarLinkedin() {
  const porLink = new Map();

  for (const termo of TERMOS) {
    try {
      const vagas = await buscarTermo(termo);
      vagas.forEach((v) => porLink.set(v.link, v));
    } catch (erro) {
      const status = erro.response?.status;
      console.error(`LinkedIn falhou em "${termo}":`, status || erro.message);
      if (status === 429 || status === 999) {
        console.error('  LinkedIn está limitando as requisições; parando por hoje.');
        break;
      }
    }
    await dormir(PAUSA_MS);
  }

  return [...porLink.values()]
    .sort((a, b) => (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0))
    .slice(0, MAX_VAGAS);
}

module.exports = { buscarLinkedin };