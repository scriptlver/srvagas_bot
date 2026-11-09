const axios = require('axios');

const TERMOS = ['desenvolvedor react', 'desenvolvedor node', 'front-end júnior', 'estágio desenvolvimento'];

async function buscarTermo(termo) {
  const { data } = await axios.get('https://portal.api.gupy.io/api/job', {
    params: { name: termo, limit: 20, offset: 0 },
    timeout: 15000,
  });

  return (data.data || []).map((v) => ({
    titulo: `${v.name} - ${v.careerPageName}${v.city ? ` (${v.city}/${v.state})` : ''}`,
    link: v.jobUrl,
    fonte: 'Gupy',
  }));
}

async function buscarGupy() {
  const resultados = await Promise.allSettled(TERMOS.map(buscarTermo));
  const vagas = [];
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') vagas.push(...r.value);
    else console.error(`Gupy falhou em "${TERMOS[i]}":`, r.reason.message);
  });
  return vagas;
}

module.exports = { buscarGupy };