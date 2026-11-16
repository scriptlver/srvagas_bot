export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export const normalizar = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();