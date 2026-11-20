import { dormir, normalizar } from "../utils.js";

const URL_API = "https://api.remotar.com.br/timeline";
const SITE = "https://remotar.com.br";
const PAGINAS_MAX = 10;
const DIAS_MAX = 7;
const MAX_VAGAS = 100;
const PAUSA_MS = 200;
const CHAVE_CACHE = "remotar|timeline";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "application/json",
  Origin: SITE,
  Referer: `${SITE}/`,
};

function slug(texto) {
  return normalizar(texto || "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapear(v) {
  const nome = String(v.title || "(sem título)").trim();
  const empresa = v.company?.name || v.companyDisplayName || "";
  const local = v.city ? ` (${v.city}/${v.state || ""})` : "";

  const link =
    v.isExternalLink && v.externalLink
      ? v.externalLink
      : v.id
        ? `${SITE}/job/${v.id}/${slug(empresa)}/${slug(nome)}`
        : null;

  const categorias = (v.jobCategories || [])
    .map((c) => c?.category?.name)
    .filter(Boolean);

  const busca = normalizar(`${nome} ${categorias.join(" ")}`) || "";

  return {
    vaga: {
      nome,
      titulo: `${nome}${empresa ? ` - ${empresa}` : ""}${local} [remoto]`,
      link,
      fonte: "Remotar (apenas vagas remotas)",
      remoto: true,
      cidade: v.city || "",
      estado: v.state || "",
      publicadaEm: v.createdAt ? new Date(v.createdAt) : null,
    },
    busca,
    palavras: new Set(busca.split(/[^a-z0-9.#+]+/).filter(Boolean)),
  };
}

function bateTermo(item, termo) {
  const t = normalizar(termo || "").trim();
  if (!t) return false;
  return /\s/.test(t) ? item.busca.includes(t) : item.palavras.has(t);
}

async function carregarTimeline() {
  const inicio = new Date().toISOString();
  const limite = Date.now() - DIAS_MAX * 86400000;
  const itens = [];

  for (let pagina = 1; pagina <= PAGINAS_MAX; pagina++) {
    const params = new URLSearchParams({
      page: String(pagina),
      firstFetchTs: inicio,
    });

    const response = await fetch(`${URL_API}?${params}`, { headers: HEADERS });

    if (!response.ok) {
      if (pagina === 1) throw new Error(`Remotar HTTP ${response.status}`);
      break;
    }

    const json = await response.json();
    const lista = Array.isArray(json?.data) ? json.data : [];

    for (const v of lista) {
      if (v?.contentType && v.contentType !== "jobs") continue;
      if (v?.active === false || v?.expired === true) continue;

      const item = mapear(v);
      if (item.vaga.link) itens.push(item);
    }

    const ultimaPagina = Number(json?.meta?.last_page) || pagina;
    const ultima = lista[lista.length - 1];
    const maisAntiga = ultima?.createdAt
      ? new Date(ultima.createdAt).getTime()
      : Infinity;

    if (!lista.length || pagina >= ultimaPagina || maisAntiga < limite) break;

    await dormir(PAUSA_MS);
  }

  return itens;
}

export async function buscarRemotar({
  termos = [],
  remoto = true,
  local = null,
  cache = new Map(),
} = {}) {
  let promessa = cache.get(CHAVE_CACHE);

  if (!promessa) {
    promessa = carregarTimeline();
    cache.set(CHAVE_CACHE, promessa);
    promessa.catch(() => cache.delete(CHAVE_CACHE));
  }

  const itens = await promessa;

  const porLink = new Map();

  for (const termo of termos) {
    const achadas = itens.filter((item) => bateTermo(item, termo));
    console.log(`Remotar "${termo}": ${achadas.length} vagas`);
    achadas.forEach((item) => porLink.set(item.vaga.link, item.vaga));
  }

  return [...porLink.values()]
    .sort(
      (a, b) =>
        (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0),
    )
    .slice(0, MAX_VAGAS);
}