import { dormir, normalizar } from "../utils.js";
import { formatarLocal, bateLocal } from "../local.js";

const BASE_URL = "https://www.geekhunter.com";
const URL_SITEMAP = `${BASE_URL}/sitemap.xml`;
const MAX_VAGAS = 20;
const PAUSA_MS = 250;

const HEADERS = {
  Accept: "text/html,application/xml",
  "User-Agent": "SRVagasBot/1.0",
};

function limparTexto(valor) {
  return String(valor || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function encontrarJobPosting(html) {
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

function extrairLocal(v) {
  let locais = v.jobLocation || [];

  if (!Array.isArray(locais)) {
    locais = [locais];
  }

  const endereco = locais[0]?.address || {};

  return {
    cidade: endereco.addressLocality || "",
    estado: endereco.addressRegion || "",
  };
}

function extrairModalidade(v, html) {
  if (v.jobLocationType === "TELECOMMUTE") {
    return "remoto";
  }

  const chips = [
    ...html.matchAll(/>\s*(Remoto|H[íi]brido|Presencial)\s*</gi),
  ].map((m) => normalizar(m[1]));

  const unicos = [...new Set(chips)];

  return unicos.length === 1 ? unicos[0] : "";
}

function mapear(v, html, link) {
  const local = extrairLocal(v);
  const modalidade = extrairModalidade(v, html);
  const remoto = modalidade === "remoto";

  const identificador =
    typeof v.identifier === "object" ? v.identifier?.value : v.identifier;

  const nome = String(v.title || "").trim();
  const empresa = v.hiringOrganization?.name || "";

  return {
    nome,
    titulo: `${nome}${empresa ? ` - ${empresa}` : ""}${local.cidade ? ` (${local.cidade}${local.estado ? `/${local.estado}` : ""})` : ""}${remoto ? " [remoto]" : ""}`,
    link,
    fonte: "GeekHunter",
    remoto,
    cidade: local.cidade,
    estado: local.estado,
    publicadaEm: v.datePosted ? new Date(v.datePosted) : null,
    id: identificador || link,
  };
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

function combinaTermo(slug, termos) {
  const texto = normalizar(slug);

  return termos.some((termo) => {
    const t = normalizar(termo);
    return t.length >= 3 && texto.includes(t);
  });
}

async function buscarUrls(termos) {
  const response = await fetch(URL_SITEMAP, {
    headers: HEADERS,
  });

  if (!response.ok) {
    throw new Error(`GeekHunter sitemap HTTP ${response.status}`);
  }

  const xml = await response.text();

  const urls = [
    ...xml.matchAll(
      /<loc>(https:\/\/www\.geekhunter\.com(?:\.br)?\/pt\/[^<]+\/jobs\/[^<]+)<\/loc>/gi,
    ),
  ].map((m) => m[1]);

  const candidatas = urls.filter((url) => {
    const slug = url.split("/jobs/").pop();
    return combinaTermo(slug, termos);
  });

  return [...new Set(candidatas)].slice(0, MAX_VAGAS);
}

async function buscarVaga(link) {
  const response = await fetch(link, {
    headers: HEADERS,
  });

  if (!response.ok) {
    throw new Error(`GeekHunter HTTP ${response.status}`);
  }

  const html = await response.text();
  const dados = encontrarJobPosting(html);

  if (!dados?.title) return null;

  return mapear(dados, html, link);
}

export async function buscarGeekHunter({
  termos = [],
  remoto = true,
  local = null,
  cache = new Map(),
} = {}) {
  const localEfetivo = remoto ? null : local;
  const chaveLocal = formatarLocal(localEfetivo);
  const chave = `geekhunter|${remoto}|${chaveLocal}|${termos.join(",")}`;

  if (cache.has(chave)) return cache.get(chave);

  const termosBusca = termos.length
    ? termos
    : ["junior", "jr", "estagio", "trainee"];

  try {
    const urls = await buscarUrls(termosBusca);
    const vagas = [];

    for (const link of urls) {
      try {
        const vaga = await buscarVaga(link);
        if (vaga) vagas.push(vaga);
      } catch (error) {
        console.log("GeekHunter falhou em uma vaga:", error.message);
      }

      await dormir(PAUSA_MS);
    }

    const resultado = filtrarLocal(vagas, remoto, localEfetivo);

    const porLink = new Map();
    resultado.forEach((v) => porLink.set(v.link, v));

    const final = [...porLink.values()].sort(
      (a, b) =>
        (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0),
    );

    console.log(`GeekHunter: ${final.length} vagas`);

    cache.set(chave, final);
    return final;
  } catch (error) {
    console.log("GeekHunter falhou:", error.message);
    return [];
  }
}
