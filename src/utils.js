export const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const normalizar = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const escaparHTML = (texto) =>
  String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const btn = (text, data) => ({
  text,
  callback_data: data,
});

export const fmtTz = (tz) => `UTC${tz >= 0 ? "+" : ""}${tz}`;

export const porData = (a, b) =>
  (new Date(b.publicadaEm || 0).getTime() || 0) -
  (new Date(a.publicadaEm || 0).getTime() || 0);

export const parseTerms = (texto) =>
  texto
    .split(/[,;\n]/)
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean);

export function addTerms(lista, termos) {
  const existentes = new Set(lista.map((t) => normalizar(t)));

  for (const termo of termos) {
    const chave = normalizar(termo);

    if (chave && !existentes.has(chave)) {
      lista.push(termo);
      existentes.add(chave);
    }
  }
}
