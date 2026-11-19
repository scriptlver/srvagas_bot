import { dormir, normalizar } from "../utils.js";
import { formatarLocal, bateLocal } from "../local.js";

const BASE_URL = "https://empregos.recrutei.com.br";
const URL_CATEGORIA = `${BASE_URL}/vagas/tecnologia`;

const MAX_PAGINAS = 10;
const MAX_DETALHES = 12;
const PAUSA_MS = 250;

const HEADERS = {
  Accept: "text/html",
  "User-Agent": "SRVagasBot/1.0",
};

function decodificar(texto) {
  return String(texto || "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    );
}

function textoHtml(html) {
  return decodificar(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extrairAtributo(html, atributo) {
  const regex = new RegExp(`${atributo}\\s*=\\s*["']([^"']*)["']`, "i");

  return html.match(regex)?.[1] || "";
}

function extrairJsonLd(html) {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  function procurar(dados) {
    if (Array.isArray(dados)) {
      for (const item of dados) {
        const encontrado = procurar(item);
        if (encontrado) return encontrado;
      }
    }

    if (!dados || typeof dados !== "object") return null;

    const tipo = dados["@type"];

    if (
      tipo === "JobPosting" ||
      (Array.isArray(tipo) && tipo.includes("JobPosting"))
    ) {
      return dados;
    }

    if (Array.isArray(dados["@graph"])) {
      return procurar(dados["@graph"]);
    }

    return null;
  }

  for (const script of scripts) {
    try {
      const dados = JSON.parse(script[1]);
      const vaga = procurar(dados);
      if (vaga) return vaga;
    } catch {}
  }

  return null;
}

function extrairCards(html) {
  return [
    ...html.matchAll(
      /<article\b(?=[^>]*class=["'][^"']*\bd2-jobrow\b)[^>]*>([\s\S]*?)<\/article>/gi,
    ),
  ].map((m) => m[1]);
}

function mapearCard(card) {
  const tituloHtml = card.match(
    /<h3[^>]*class=["'][^"']*d2-jobrow__title[^"']*["'][^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>/i,
  );

  if (!tituloHtml) return null;

  const href = extrairAtributo(tituloHtml[1], "href").split("?")[0];
  const titulo = textoHtml(tituloHtml[2]);

  if (!titulo || !href || href.includes("/vaga/anonimo/")) {
    return null;
  }

  const link = href.startsWith("http") ? href : `${BASE_URL}${href}`;

  const id = link.match(/\/vaga\/[^/]+\/(\d+)-/i)?.[1];

  if (!id) return null;

  const metaHtml =
    card.match(
      /<p[^>]*class=["'][^"']*d2-jobrow__meta[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
    )?.[1] || "";

  const meta = textoHtml(metaHtml);
  const [empresaRaw, localRaw = ""] = meta.split(" · ");

  const empresa = empresaRaw.trim();
  let local = localRaw.trim();

  if (local && /, [A-Z]{2}$/.test(local)) {
    local += ", Brasil";
  }

  const badges = [
    ...card.matchAll(
      /<span[^>]*class=["'][^"']*d2-badge[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
    ),
  ].map((m) => normalizar(textoHtml(m[1])));

  let modalidade = "";

  if (badges.includes("remoto")) {
    modalidade = "remoto";
  } else if (badges.includes("presencial ou remoto")) {
    modalidade = "hibrido";
  } else if (badges.includes("hibrido")) {
    modalidade = "hibrido";
  } else if (badges.includes("presencial")) {
    modalidade = "presencial";
  }

  const partesLocal = local.split(",").map((p) => p.trim());

  return {
    id,
    nome: titulo,
    titulo: `${titulo}${empresa ? ` - ${empresa}` : ""}${local ? ` (${local.replace(", Brasil", "")})` : ""}${modalidade === "remoto" ? " [remoto]" : ""}`,
    link,
    fonte: "Recrutei",
    remoto: modalidade === "remoto",
    cidade: partesLocal[0] || "",
    estado: partesLocal[1] || "",
    publicadaEm: null,
  };
}

function combinaTermo(titulo, termos) {
  const nome = normalizar(titulo);

  return termos.some((termo) => {
    const t = normalizar(termo);
    return t.length >= 3 && nome.includes(t);
  });
}

function filtrarLocal(vagas, remoto, local) {
  const comLink = vagas.filter((v) => v.link);

  if (remoto) {
    return comLink.filter((v) => v.remoto);
  }

  if (local) {
    return comLink.filter((v) => bateLocal(v, local));
  }

  return comLink.filter((v) => !v.remoto);
}

async function buscarPagina(pagina) {
  const url = pagina === 1 ? URL_CATEGORIA : `${URL_CATEGORIA}?page=${pagina}`;

  const response = await fetch(url, {
    headers: HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Recrutei HTTP ${response.status}`);
  }

  const html = await response.text();

  return {
    cards: extrairCards(html),
    html,
  };
}

async function buscarDetalhe(vaga) {
  const response = await fetch(vaga.link, {
    headers: HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Recrutei detalhe HTTP ${response.status}`);
  }

  const html = await response.text();
  const dados = extrairJsonLd(html);

  if (!dados) return vaga;

  if (dados.title) {
    vaga.nome = dados.title;
  }

  if (dados.description) {
    vaga.descricao = textoHtml(dados.description);
  }

  if (dados.datePosted) {
    vaga.publicadaEm = new Date(dados.datePosted);
  }

  return vaga;
}

export async function buscarRecrutei({
  termos = [],
  remoto = true,
  local = null,
  cache = new Map(),
} = {}) {
  const localEfetivo = remoto ? null : local;
  const chaveLocal = formatarLocal(localEfetivo);

  const termosBusca = termos.length
    ? termos
    : ["desenvolvedor", "junior", "jr", "estagio", "trainee"];

  const chave = `recrutei|${remoto}|${chaveLocal}|${termosBusca.join(",")}`;

  if (cache.has(chave)) return cache.get(chave);

  try {
    const listadas = [];

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const { cards } = await buscarPagina(pagina);

      if (!cards.length) break;

      for (const card of cards) {
        const vaga = mapearCard(card);

        if (vaga && combinaTermo(vaga.nome, termosBusca)) {
          listadas.push(vaga);
        }
      }

      if (cards.length < 12) break;

      await dormir(PAUSA_MS);
    }

    const compativeis = filtrarLocal(listadas, remoto, localEfetivo);

    const unicas = [
      ...new Map(compativeis.map((v) => [v.link, v])).values(),
    ].slice(0, MAX_DETALHES);

    const detalhadas = [];

    for (const vaga of unicas) {
      try {
        detalhadas.push(await buscarDetalhe(vaga));
      } catch (error) {
        console.log(`Recrutei falhou no detalhe ${vaga.id}:`, error.message);
        detalhadas.push(vaga);
      }

      await dormir(PAUSA_MS);
    }

    const resultado = filtrarLocal(detalhadas, remoto, localEfetivo);

    resultado.sort(
      (a, b) =>
        (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0),
    );

    console.log(`Recrutei: ${resultado.length} vagas`);

    cache.set(chave, resultado);
    return resultado;
  } catch (error) {
    console.log("Recrutei falhou:", error.message);
    return [];
  }
}
