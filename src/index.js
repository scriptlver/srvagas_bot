const { bot, chatId } = require('./config/telegram');

const LIMITE_TELEGRAM = 4096;

// escapa caracteres especiais do HTML do Telegram
const esc = (txt) =>
  String(txt).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// divide a lista de vagas em blocos que cabem em uma mensagem
function montarMensagens(vagas) {
  const cabecalho = '✨ <b>Novas Vagas Encontradas!</b> ✨\n\n';
  const mensagens = [];
  let atual = cabecalho;

  for (const vaga of vagas) {
    const bloco = `👩‍💻 ${esc(vaga.titulo)}\n🔗 <a href="${esc(vaga.link)}">Ver vaga</a>\n\n`;
    if ((atual + bloco).length > LIMITE_TELEGRAM) {
      mensagens.push(atual);
      atual = '';
    }
    atual += bloco;
  }
  if (atual.trim()) mensagens.push(atual);
  return mensagens;
}

async function rodarBot() {
  console.log('Iniciando a caçada por vagas... 🕵️‍♀️');

  const vagasEncontradas = [
    { titulo: 'Desenvolvedor Front-end Jr (React)', link: 'https://exemplo.com/vaga1' },
    { titulo: 'Estágio em Node.js', link: 'https://exemplo.com/vaga2' },
  ];

  if (vagasEncontradas.length === 0) {
    console.log('Nenhuma vaga nova hoje.');
    return;
  }

  try {
    for (const msg of montarMensagens(vagasEncontradas)) {
      await bot.telegram.sendMessage(chatId, msg, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    }
    console.log('Mensagem enviada com sucesso! 🤍');
  } catch (erro) {
    console.error('Erro ao enviar mensagem pro Telegram:', erro.message);
    process.exitCode = 1; 
  }
}

rodarBot();