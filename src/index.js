const fs = require('fs');
const path = require('path');
const { bot, chatId } = require('./config/telegram');
const { buscarGupy } = require('./scrapers/gupy');
const { buscarLinkedin } = require('./scrapers/linkedin');
const { buscarQueroVagas } = require('./scrapers/querovagas');

const ARQUIVO_ENVIADAS = path.join(__dirname, '..', 'enviadas.json');
const LIMITE = 4096;
const MAX_POR_FONTE = 25; 
const PAUSA_MS = 1000;   

const FONTES = [
  { chave: 'Gupy', emoji: '🟣' },
  { chave: 'LinkedIn', emoji: '🔵' },
  { chave: 'QueroVagas', emoji: '🟢' },
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const porData = (a, b) => (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0);

function lerEnviadas() {
  try { return new Set(JSON.parse(fs.readFileSync(ARQUIVO_ENVIADAS, 'utf8'))); }
  catch { return new Set(); }
}

function salvarEnviadas(set) {
  fs.writeFileSync(ARQUIVO_ENVIADAS, JSON.stringify([...set], null, 2));
}

function montarMensagens(fonte, emoji, vagas) {
  const cabecalho = (parte, total) =>
    `${emoji} <b>Vagas ${esc(fonte)}</b> (${vagas.length})${total > 1 ? ` - parte ${parte}` : ''}\n\n`;

  const blocos = vagas.map((v) => ({
    vaga: v,
    texto: `👩‍💻 ${esc(v.titulo)}\n🔗 <a href="${esc(v.link)}">Ver vaga</a>\n\n`,
  }));

  const grupos = [];
  let atual = [];
  let tamanho = cabecalho(1, 2).length;
  for (const b of blocos) {
    if (tamanho + b.texto.length > LIMITE && atual.length) {
      grupos.push(atual);
      atual = [];
      tamanho = cabecalho(1, 2).length;
    }
    atual.push(b);
    tamanho += b.texto.length;
  }
  if (atual.length) grupos.push(atual);

  return grupos.map((g, i) => ({
    texto: cabecalho(i + 1, grupos.length) + g.map((b) => b.texto).join(''),
    vagas: g.map((b) => b.vaga),
  }));
}

async function rodarBot() {
  console.log('Iniciando a caçada por vagas...');

  const scrapers = [buscarGupy, buscarLinkedin, buscarQueroVagas];
  const resultados = await Promise.allSettled(scrapers.map((f) => f()));

  const todas = [];
  resultados.forEach((r) => {
    if (r.status === 'fulfilled') todas.push(...r.value);
    else console.error('Scraper falhou:', r.reason.message);
  });

  // tira as repetidas
  const enviadas = lerEnviadas();
  const vistas = new Set();
  const novas = todas.filter((v) => {
    if (!v.link || enviadas.has(v.link) || vistas.has(v.link)) return false;
    vistas.add(v.link);
    return true;
  });

  console.log(
    `Vagas novas: ${novas.length} (de ${todas.length} encontradas; ${todas.length - novas.length} já enviadas ou repetidas)`
  );

  if (novas.length === 0) {
    console.log('Nenhuma vaga nova hoje.');
    return;
  }

  let total = 0;
  try {
    for (const { chave, emoji } of FONTES) {
      const novasDaFonte = novas.filter((v) => v.fonte === chave).sort(porData);
      const daFonte = novasDaFonte.slice(0, MAX_POR_FONTE);
      if (daFonte.length === 0) {
        console.log(`${chave}: nenhuma vaga nova.`);
        continue;
      }

      for (const msg of montarMensagens(chave, emoji, daFonte)) {
        await bot.telegram.sendMessage(chatId, msg.texto, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
        msg.vagas.forEach((v) => enviadas.add(v.link));
        salvarEnviadas(enviadas);
        total += msg.vagas.length;
        await dormir(PAUSA_MS);
      }
      console.log(`${chave}: ${daFonte.length} enviadas (${novasDaFonte.length} novas no total).`);
    }
    console.log(`Concluído: ${total} vagas enviadas.`);
  } catch (erro) {
    console.error('Erro ao enviar pro Telegram:', erro.message);
    process.exitCode = 1;
  }
}

rodarBot();