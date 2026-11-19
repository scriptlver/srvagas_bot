import { dormir, normalizar } from "../utils.js";
import { UFS, formatarLocal, bateLocal } from "../local.js";

const URL_API = "https://portal.gupy.io/api/job-search/jobs";
const POR_PAGINA = 12;
const PAGINAS = 3;
const MAX_VAGAS = 100;
const PAUSA_MS = 200;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "application/json",
  Referer: "https://portal.gupy.io/job-search",
};

function extrairLista(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.jobs)) return data.jobs;
  if (Array.isArray(data?.data?.jobs)) return data.data.jobs;
  return [];
}

function ehRemoto(v) {
  if (v.isRemoteWork === true || v.remote === true) return true;
  return normalizar(v.workplaceType || v.workModel || v.modality).includes(
    "remot",
  );
}

function mapear(v) {
  const nome = v.name || v.title || "(sem título)";
  const empresa = v.careerPageName || v.company || v.companyName || "";
  const local = v.city ? ` (${v.city}/${v.state || ""})` : "";
  const link =
    v.jobUrl ||
    v.url ||
    v.applyUrl ||
    (v.id ? `https://portal.gupy.io/job/${v.id}` : null);
  const dataStr = v.publishedDate || v.publishedAt || v.createdAt || null;
  const remoto = ehRemoto(v);

  return {
    nome,
    titulo: `${nome}${empresa ? ` - ${empresa}` : ""}${local}${remoto ? " [remoto]" : ""}`,
    link,
    fonte: "Gupy",
    remoto,
    cidade: v.city || "",
    estado: v.state || "",
    publicadaEm: dataStr ? new Date(dataStr) : null,
  };
}

async function buscarPagina(termo, offset, estado, local) {
  const params = new URLSearchParams({
    jobName: termo,
    limit: String(POR_PAGINA),
    offset: String(offset),
    sortBy: "publishedDate",
  });

  if (estado.filtroServidor) params.set("workplaceType", "remote");
  if (local?.cidade) params.set("city", local.cidade);
  if (local?.estado) params.set("state", UFS[local.estado]);

  const response = await fetch(`${URL_API}?${params}`, { headers: HEADERS });

  if (!response.ok) {
    if (estado.filtroServidor && response.status === 400) {
      console.log("Gupy recusou o filtro remoto; usando filtro local.");
      estado.filtroServidor = false;
      return buscarPagina(termo, offset, estado, local);
    }
    throw new Error(`Gupy HTTP ${response.status}`);
  }

  return extrairLista(await response.json());
}

async function buscarTermo(termo, remoto, local) {
  const estado = { filtroServidor: remoto };
  const vagas = [];

  for (let pagina = 0; pagina < PAGINAS; pagina++) {
    const lista = await buscarPagina(termo, pagina * POR_PAGINA, estado, local);

    vagas.push(...lista.map(mapear));

    if (lista.length < POR_PAGINA) break;
    await dormir(PAUSA_MS);
  }

  const comLink = vagas.filter((vaga) => vaga.link);
  return remoto
    ? comLink.filter((vaga) => vaga.remoto)
    : comLink.filter((vaga) => bateLocal(vaga, local));
}

export async function buscarGupy({
  termos = [],
  remoto = true,
  local = null,
  cache = new Map(),
} = {}) {
  const localEfetivo = remoto ? null : local;
  const chaveLocal = formatarLocal(localEfetivo);

  const listas = await Promise.all(
    termos.map(async (termo) => {
      const chave = `gupy|${termo}|${remoto}|${chaveLocal}`;
      if (cache.has(chave)) return cache.get(chave);

      try {
        const vagas = await buscarTermo(termo, remoto, localEfetivo);
        console.log(`Gupy "${termo}": ${vagas.length} vagas`);
        cache.set(chave, vagas);
        return vagas;
      } catch (error) {
        console.log(`Gupy falhou em "${termo}":`, error.message);
        return [];
      }
    }),
  );

  const porLink = new Map();
  listas.flat().forEach((vaga) => porLink.set(vaga.link, vaga));

  return [...porLink.values()]
    .sort(
      (a, b) =>
        (b.publicadaEm?.getTime() || 0) - (a.publicadaEm?.getTime() || 0),
    )
    .slice(0, MAX_VAGAS);
}
