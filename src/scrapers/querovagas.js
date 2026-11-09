const axios = require('axios');
const cheerio = require('cheerio');

async function buscarQueroVagas() {
  const { data: html } = await axios.get('https://www.querovagas.com.br/vagas?q=desenvolvedor', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });

  const $ = cheerio.load(html);
  const vagas = [];

  // seletor do card de vaga do titulo e do linkzinho peitudo
  $('.job-card').each((_, el) => {
    const titulo = $(el).find('h2').text().trim();
    const link = $(el).find('a').attr('href');
    if (titulo && link) vagas.push({ titulo, link, fonte: 'QueroVagas' });
  });

  return vagas;
}

module.exports = { buscarQueroVagas };