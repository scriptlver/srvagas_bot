const fs = require("fs");
const path = require("path");

const { bot, chatId } = require("./config/telegram");

const { buscarGupy } = require("./scrapers/gupy");
const { buscarLinkedin } = require("./scrapers/linkedin");
const { buscarQueroVagas } = require("./scrapers/querovagas");

const ARQUIVO_ENVIADAS = path.join(__dirname, "..", "enviadas.json");

const LIMITE = 4096;
const MAX_POR_FONTE = 25;
const PAUSA_MS = 1000;

const FONTES = [
  { chave: "Gupy", emoji: "🟣" },
  { chave: "LinkedIn", emoji: "🔵" },
  { chave: "QueroVagas", emoji: "🟢" },
];

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const esc = (texto) =>
  String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const porData = (a, b) =>
  (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0);

function lerEnviadas() {
  try {
    return new Set(JSON.parse(fs.readFileSync(ARQUIVO_ENVIADAS, "utf8")));
  } catch {
    return new Set();
  }
}

function salvarEnviadas(set) {
  fs.writeFileSync(ARQUIVO_ENVIADAS, JSON.stringify([...set], null, 2));
}

async function enviarCabecalho(total) {
  const data = new Date().toLocaleDateString("pt-BR");

  const mensagem = `
💼 <b>RELATÓRIO DE VAGAS — ${data}</b>

📌 Encontramos <b>${total} novas vagas</b> para você.

Confira as oportunidades abaixo!
  `;

  await bot.telegram.sendMessage(chatId, mensagem, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });

  await dormir(PAUSA_MS);
}

function montarMensagens(fonte, emoji, vagas) {
  const cabecalho = (parte, total) =>
    `${emoji} <b>Vagas ${esc(fonte)}</b> (${vagas.length})${
      total > 1 ? ` - parte ${parte}` : ""
    }\n\n`;

  const blocos = vagas.map((vaga) => ({
    vaga,
    texto: `👩‍💻 ${esc(vaga.titulo)}\n🔗 <a href="${esc(vaga.link)}">Ver vaga</a>\n\n`,
  }));

  const grupos = [];
  let atual = [];
  let tamanho = cabecalho(1, 2).length;

  for (const bloco of blocos) {
    if (tamanho + bloco.texto.length > LIMITE && atual.length) {
      grupos.push(atual);
      atual = [];
      tamanho = cabecalho(1, 2).length;
    }

    atual.push(bloco);
    tamanho += bloco.texto.length;
  }

  if (atual.length) {
    grupos.push(atual);
  }

  return grupos.map((grupo, i) => ({
    texto:
      cabecalho(i + 1, grupos.length) +
      grupo.map((bloco) => bloco.texto).join(""),

    vagas: grupo.map((bloco) => bloco.vaga),
  }));
}

async function rodarBot() {
  console.log("Iniciando a caçada por vagas...");

  const scrapers = [buscarGupy, buscarLinkedin, buscarQueroVagas];

  const resultados = await Promise.allSettled(
    scrapers.map((funcao) => funcao()),
  );

  const todas = [];

  resultados.forEach((resultado) => {
    if (resultado.status === "fulfilled") {
      todas.push(...resultado.value);
    } else {
      console.error("Scraper falhou:", resultado.reason.message);
    }
  });

  const enviadas = lerEnviadas();
  const vistas = new Set();

  const novas = todas.filter((vaga) => {
    if (!vaga.link || enviadas.has(vaga.link) || vistas.has(vaga.link)) {
      return false;
    }

    vistas.add(vaga.link);
    return true;
  });

  console.log(
    `Vagas novas: ${novas.length} (de ${todas.length} encontradas; ${
      todas.length - novas.length
    } já enviadas ou repetidas)`,
  );

  if (novas.length === 0) {
    console.log("Nenhuma vaga nova hoje.");
    return;
  }

  let total = 0;

  try {
    await enviarCabecalho(novas.length);

    for (const { chave, emoji } of FONTES) {
      const novasDaFonte = novas
        .filter((vaga) => vaga.fonte === chave)
        .sort(porData);

      const daFonte = novasDaFonte.slice(0, MAX_POR_FONTE);

      if (daFonte.length === 0) {
        console.log(`${chave}: nenhuma vaga nova.`);
        continue;
      }

      for (const msg of montarMensagens(chave, emoji, daFonte)) {
        await bot.telegram.sendMessage(chatId, msg.texto, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });

        msg.vagas.forEach((vaga) => {
          enviadas.add(vaga.link);
        });

        salvarEnviadas(enviadas);

        total += msg.vagas.length;

        await dormir(PAUSA_MS);
      }

      console.log(
        `${chave}: ${daFonte.length} enviadas (${novasDaFonte.length} novas no total).`,
      );
    }

    console.log(`Concluído: ${total} vagas enviadas.`);
  } catch (erro) {
    console.error("Erro ao enviar pro Telegram:", erro.message);
    process.exitCode = 1;
  }
}

rodarBot();
