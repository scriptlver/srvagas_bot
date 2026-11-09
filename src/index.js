const fs = require('fs');
const path = require('path');
const { bot, chatId } = require('./config/telegram');
const { buscarGupy } = require('./scrapers/gupy');
// const { buscarQueroVagas } = require('./scrapers/querovagas'); pra testar o querovagas dps

const ARQUIVO_ENVIADAS = path.join(__dirname, '..', 'enviadas.json');
const LIMITE = 4096;

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lerEnviadas() {
  try { return new Set(JSON.parse(fs.readFileSync(ARQUIVO_ENVIADAS, 'utf8'))); }
  catch { return new Set(); }
}

function salvarEnviadas(set) {
  fs.writeFileSync(ARQUIVO_ENVIADAS, JSON.stringify([...set], null, 2));
}

function montarMensagens(vagas) {
  const mensagens = [];
  let atual = '✨ <b>Novas Vagas Encontradas!</b> ✨\n\n';
  for (const v of vagas) {
    const bloco = `👩‍💻 ${esc(v.titulo)}\n🔗 <a href="${esc(v.link)}">Ver vaga (${esc(v.fonte)})</a>\n\n`;
    if ((atual + bloco).length > LIMITE) { mensagens.push(atual); atual = ''; }
    atual += bloco;
  }
  if (atual.trim()) mensagens.push(atual);
  return mensagens;
}

async function rodarBot() {
  console.log('Iniciando a caçada por vagas...');

  const fontes = [buscarGupy /*, buscarQueroVagas */];
  const resultados = await Promise.allSettled(fontes.map((f) => f()));

  const todas = [];
  resultados.forEach((r) => {
    if (r.status === 'fulfilled') todas.push(...r.value);
    else console.error('Scraper falhou:', r.reason.message);
  });

  const enviadas = lerEnviadas();
  const vistas = new Set();
  const novas = todas.filter((v) => {
    if (!v.link || enviadas.has(v.link) || vistas.has(v.link)) return false;
    vistas.add(v.link);
    return true;
  });

  if (novas.length === 0) {
    console.log('Nenhuma vaga nova hoje.');
    return;
  }

  try {
    for (const msg of montarMensagens(novas)) {
      await bot.telegram.sendMessage(chatId, msg, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    }
    novas.forEach((v) => enviadas.add(v.link));
    salvarEnviadas(enviadas);
    console.log(`${novas.length} vagas enviadas.`);
  } catch (erro) {
    console.error('Erro ao enviar pro Telegram:', erro.message);
    process.exitCode = 1;
  }
}

rodarBot();