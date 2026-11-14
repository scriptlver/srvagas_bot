const axios = require("axios");
const cheerio = require("cheerio");

const TERMOS = [
  "desenvolvedor júnior",
  "desenvolvedor full stack",
  "desenvolvedor back end",
  "desenvolvedor front end",
  "estágio desenvolvedor",
];

const URL_API =
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";

const PAGINAS = 1;
const MAX_VAGAS = 100;
const PAUSA_MS = 4000;
const PERIODO = "r604800";
const NIVEIS = "";

const INCLUIR =
  /\b(desenvolvedor|desenvolvedora|developer|dev|programador|programadora|software|full ?stack|back ?end|front ?end|estagio|estagiario|estagiaria|junior|jr)\b/i;

const EXCLUIR =
  /\b(senior|sr|pleno|pl|ii|iii|n1|n2|n3|hibrido|hibrida|pcd|mid|consultor|php|\.net|angular)\b/i;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizar = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function identificarModalidade(elemento, $) {
  const texto = normalizar($(elemento).text());

  if (/\b(hibrido|hibrida|hybrid)\b/.test(texto)) {
    return "Híbrido";
  }

  if (/\b(presencial|on-site|onsite)\b/.test(texto)) {
    return "Presencial";
  }

  if (/\b(remoto|remota|remote|work from home)\b/.test(texto)) {
    return "Remoto";
  }

  return "Não informado";
}

function parsear(html) {
  const $ = cheerio.load(html);
  const vagas = [];

  $("li").each((_, elemento) => {
    const card = $(elemento);

    const nome = card.find(".base-search-card__title").text().trim();

    const empresa = card.find(".base-search-card__subtitle").text().trim();

    const local = card.find(".job-search-card__location").text().trim();

    const href = card.find("a.base-card__full-link").attr("href");

    const dataStr = card.find("time").attr("datetime");

    if (!nome || !href) return;

    const modalidade = identificarModalidade(elemento, $);

    vagas.push({
      nome,
      titulo: `${nome} - ${empresa}${local ? ` (${local})` : ""}`,
      empresa,
      local,
      modalidade,
      link: href.split("?")[0],
      fonte: "LinkedIn",
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
      location: "Brazil",
      f_WT: 2,
      f_TPR: PERIODO,
      sortBy: "DD",
      start: p * 25,
    };

    if (NIVEIS) {
      params.f_E = NIVEIS;
    }

    const { data } = await axios.get(URL_API, {
      params,
      headers: HEADERS,
      timeout: 15000,
    });

    const pagina = parsear(data);

    if (p === 0 && pagina.length === 0) {
      console.error(`LinkedIn "${termo}": nenhum card encontrado no HTML.`);
    }

    vagas.push(...pagina);

    if (pagina.length === 0) break;

    if (p < PAGINAS - 1) {
      await dormir(PAUSA_MS);
    }
  }

  const finais = vagas.filter((vaga) => {
    const titulo = normalizar(vaga.nome);

    return (
      INCLUIR.test(titulo) &&
      !EXCLUIR.test(titulo) &&
      vaga.modalidade === "Remoto"
    );
  });

  console.log(
    `LinkedIn "${termo}": ${vagas.length} vagas encontradas, ${finais.length} remotas após filtros.`,
  );

  return finais;
}

async function buscarLinkedin() {
  const porLink = new Map();

  for (let i = 0; i < TERMOS.length; i++) {
    const termo = TERMOS[i];

    try {
      const vagas = await buscarTermo(termo);

      vagas.forEach((vaga) => {
        porLink.set(vaga.link, vaga);
      });
    } catch (erro) {
      const status = erro.response?.status;

      console.error(`LinkedIn falhou em "${termo}":`, status || erro.message);

      if (status === 429 || status === 999) {
        console.error(
          "LinkedIn está limitando as requisições; parando por hoje.",
        );
        break;
      }
    }

    if (i < TERMOS.length - 1) {
      await dormir(PAUSA_MS);
    }
  }

  const resultado = [...porLink.values()]
    .sort(
      (a, b) =>
        (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0),
    )
    .slice(0, MAX_VAGAS);

  console.log(
    `LinkedIn: ${porLink.size} vagas únicas, devolvendo ${resultado.length}.`,
  );

  return resultado;
}

module.exports = { buscarLinkedin };
