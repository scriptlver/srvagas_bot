import { dormir, normalizar } from "../utils.js";
import { formatarLocal, bateLocal } from "../local.js";

const URL_API = "https://trampos.co/api/v2/opportunities";
const MAX_TERMOS = 4;
const MAX_PAGINAS = 4;
const PAUSA_MS = 250;

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "SRVagasBot/1.0",
};

function mapear(v) {
  const nome = String(v.name || "").trim();
  const empresa = String(v.custom_company_name || v.company?.name || "").trim();

  let link = v.email_share_url || v.whatsapp_share_url || "";

  if (link.includes("/share/")) {
    link = link.split("/share/")[0];
  }

  if (!link && v.id) {
    link = `https://trampos.co/oportunidades/${v.id}`;
  }

  const remoto = v.home_office === true;

  return {
    nome,
    titulo: `${nome}${empresa ? ` - ${empresa}` : ""}${remoto ? " [remoto]" : ""}`,
    link,
    fonte: "Trampos.co",
    remoto,
    cidade: "",
    estado: "",
    publicadaEm: v.published_at ? new Date(v.published_at) : null,
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

async function buscarTermo(termo) {
  const vagas = [];

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const params = new URLSearchParams({
      tr: termo,
      page: String(pagina),
    });

    const response = await fetch(`${URL_API}?${params}`, {
      headers: HEADERS,
    });

    if (!response.ok) {
      throw new Error(`Trampos HTTP ${response.status}`);
    }

    const json = await response.json();

    const lista = Array.isArray(json?.opportunities) ? json.opportunities : [];

    if (!lista.length) break;

    vagas.push(...lista.map(mapear));

    const totalPaginas = Number(json?.pagination?.total_pages) || 1;

    if (pagina >= totalPaginas) break;

    if (pagina < MAX_PAGINAS) {
      await dormir(PAUSA_MS);
    }
  }

  return vagas;
}

export async function buscarTrampos({
  termos = [],
  remoto = true,
  local = null,
  cache = new Map(),
} = {}) {
  const localEfetivo = remoto ? null : local;
  const chaveLocal = formatarLocal(localEfetivo);

  const termosUnicos = [
    ...new Set(termos.map((t) => String(t).trim()).filter(Boolean)),
  ].slice(0, MAX_TERMOS);

  const todas = [];

  for (const termo of termosUnicos) {
    const chave = `trampos|${normalizar(termo)}|${remoto}|${chaveLocal}`;

    if (cache.has(chave)) {
      todas.push(...cache.get(chave));
      continue;
    }

    try {
      const vagas = await buscarTermo(termo);
      const filtradas = filtrarLocal(vagas, remoto, localEfetivo);

      console.log(`Trampos "${termo}": ${filtradas.length} vagas`);

      cache.set(chave, filtradas);
      todas.push(...filtradas);
    } catch (error) {
      console.log(`Trampos falhou em "${termo}":`, error.message);
    }

    await dormir(PAUSA_MS);
  }

  const porLink = new Map();

  todas.forEach((v) => {
    if (v.link) porLink.set(v.link, v);
  });

  return [...porLink.values()].sort(
    (a, b) => (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0),
  );
}
