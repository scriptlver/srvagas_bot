const axios = require('axios');

const URL_API = 'https://querovagastech.com.br/api/jobs';
const SITE = 'https://querovagastech.com.br/vagas';
const POR_PAGINA = 30;
const MAX_PAGINAS = 6;      // até 180 vagas
const DIAS = 7;            
const MAX_VAGAS = 100;
const PAUSA_MS = 500;
const IGNORAR_FONTES = /gupy/i; 

const INCLUIR = /\b(desenvolvedor|desenvolvedora|developer|dev|programador|programadora|software|full ?stack|back ?end|front ?end|estagio|estagiario|estagiaria|junior|jr)\b/;
const EXCLUIR = /\b(senior|sr|pleno|pl|ii|iii|n1|n2|n3|hibrido|hibrida)\b/;
const SENIORIDADES_FORA = ['mid', 'senior', 'staff', 'lead', 'principal'];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  Accept: 'application/json',
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const normalizar = (t) =>
  String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const parseData = (s) => (s ? new Date(String(s).replace(/(\.\d{3})\d+/, '$1')) : null);

function mapear(v) {
  const nome = String(v.title || '').replace(/^vaga:\s*/i, '').trim();
  const local = v.location && normalizar(v.location) !== 'br' ? ` (${v.location})` : '';
  const link = /^https?:\/\//i.test(v.applyUrl || '') ? v.applyUrl : `${SITE}/${v.id}`;

  return {
    nome,
    titulo: `${nome} - ${v.company || ''}${local} [remoto]`,
    link,
    fonte: 'QueroVagas',
    publicadaEm: parseData(v.postedAt),
    workMode: v.workMode,
    seniority: v.seniority,
    origem: v.sourceName || '',
  };
}

async function buscarQueroVagas() {
  const limite = Date.now() - DIAS * 24 * 60 * 60 * 1000;
  const todas = [];

  for (let page = 1; page <= MAX_PAGINAS; page++) {
    let data;
    try {
      const resp = await axios.get(URL_API, {
        params: { page, pageSize: POR_PAGINA, sort: 'postedAt:desc' },
        headers: HEADERS,
        timeout: 15000,
      });
      data = resp.data;
    } catch (erro) {
      console.error(`QueroVagas falhou na página ${page}:`, erro.response?.status || erro.message);
      break;
    }

    const itens = Array.isArray(data?.items) ? data.items : [];
    if (itens.length === 0) break;
    todas.push(...itens.map(mapear));

    if (data.isLimited) {
      console.error('  QueroVagas: a API limitou o acesso anônimo; usando só o que veio.');
      break;
    }

    const ultima = parseData(itens[itens.length - 1].postedAt);
    if (ultima && ultima.getTime() < limite) break;  
    if (todas.length >= (data.total || Infinity)) break;
    await dormir(PAUSA_MS);
  }

  const recentes = todas.filter((v) => !v.publicadaEm || v.publicadaEm.getTime() >= limite);
  const remotas = recentes.filter((v) => normalizar(v.workMode) === 'remote');
  const finais = remotas.filter((v) => {
    const t = normalizar(v.nome);
    return (
      INCLUIR.test(t) &&
      !EXCLUIR.test(t) &&
      !SENIORIDADES_FORA.includes(normalizar(v.seniority)) &&
      !IGNORAR_FONTES.test(v.origem)
    );
  });

  console.log(
    `QueroVagas: ${todas.length} lidas, ${recentes.length} nos últimos ${DIAS} dias, ${remotas.length} remotas, ${finais.length} após filtros`
  );

  return finais
    .sort((a, b) => (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0))
    .slice(0, MAX_VAGAS);
}

module.exports = { buscarQueroVagas };