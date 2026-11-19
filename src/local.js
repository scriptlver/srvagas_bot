import { normalizar } from "./utils.js";

export const UFS = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const ehUF = (s) => Boolean(s && UFS[s.toUpperCase()]);

export function parseLocal(texto = "") {
  const partes = String(texto)
    .split(/\s*[,/]\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!partes.length) return null;

  if (partes.length === 1) {
    return ehUF(partes[0])
      ? { cidade: "", estado: partes[0].toUpperCase() }
      : { cidade: partes[0], estado: "" };
  }

  const uf = partes[1].toUpperCase();
  return { cidade: partes[0], estado: ehUF(uf) ? uf : "" };
}

export function formatarLocal(local) {
  if (!local || (!local.cidade && !local.estado)) return "";
  return [local.cidade, local.estado].filter(Boolean).join("/");
}

export function bateLocal(vaga, local) {
  if (!local) return true;

  if (!vaga.cidade && !vaga.estado) return true;

  if (local.cidade && normalizar(vaga.cidade) !== normalizar(local.cidade)) {
    return false;
  }

  if (local.estado) {
    const alvo = normalizar(local.estado);
    const nomeUF = normalizar(UFS[local.estado]);
    const est = normalizar(vaga.estado);
    if (est !== alvo && est !== nomeUF) return false;
  }

  return true;
}
