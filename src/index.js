const { bot, chatId } = require('./config/telegram');

async function rodarBot() {
  console.log("Iniciando a caçada por vagas... 🕵️‍♀️");
  
  const vagasEncontradas = [
    { titulo: "Desenvolvedor Front-end Jr (React)", link: "https://exemplo.com/vaga1" },
    { titulo: "Estágio em Node.js", link: "https://exemplo.com/vaga2" }
  ];
  
  if (vagasEncontradas.length > 0) {
    // no markdown do telegram, usamos apenas um * para negrito
    let mensagem = "✨ *Novas Vagas Encontradas!* ✨\n\n";
    
    vagasEncontradas.forEach(vaga => {
      mensagem += `👩‍💻 ${vaga.titulo}\n🔗 ${vaga.link}\n\n`;
    });

    try {
      // a telegraf usa bot.telegram para disparos ativos (sem o usuário mandar mensagem antes)
      await bot.telegram.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
      console.log("Mensagem enviada com sucesso! 🤍");
    } catch (erro) {
      console.error("Ops, erro ao enviar mensagem pro Telegram:", erro.message);
    }
    
  } else {
    console.log("Nenhuma vaga nova hoje.");
  }
}

rodarBot();