import { LIMITE, RESULTADOS_POR_PAGINA } from "./config.js";
import { btn, escaparHTML, fmtTz } from "./utils.js";
import {
  FONTES,
  MAX_FONTES,
  fontesAtivas,
  sanitizarFontes,
} from "./sources.js";

export const RULER = "⠀".repeat(34);

export function mainView(u) {
  const fontes = fontesAtivas(u)
    .map((f) => f.chave)
    .join(" + ");

  const text =
    `Olá${u.nome ? ` ${escaparHTML(u.nome)}` : ""} :)\n\n` +
    `⚙️ <b>PREFERÊNCIAS</b>\n` +
    `⏰ Horário de envio: ${String(u.hour).padStart(2, "0")}:00\n` +
    `📊 Limite por fonte: ${u.count} vagas\n` +
    `🏠 Apenas remotas: ${u.remoto ? "Sim" : "Não"}\n` +
    `🌐 Fontes: ${escaparHTML(fontes)}\n\n` +
    `🔎 <b>FILTROS DE BUSCA</b>\n` +
    `✅ Termos incluídos: ${u.include.length}\n` +
    `❌ Termos excluídos: ${u.exclude.length}\n\n` +
    (u.include.length
      ? ""
      : `⚠️ Você ainda não definiu termos de busca. Vá em Configurações → Incluir.\n\n`) +
    `Escolha uma opção para configurar o bot:\n` +
    RULER;

  const kb = [
    [btn("🔎 Buscar vagas agora", "now")],
    [btn("⚙️ Configurações", "cfg")],
  ];

  return { text, kb };
}

export function configView(u) {
  const text =
    `⚙️ <b>Configurações</b>\n\n` +
    `Toque em uma opção para alterar.\n` +
    RULER;

  const kb = [
    [
      btn(`⏰ Horário: ${String(u.hour).padStart(2, "0")}:00`, "hour"),
      btn(`📊 Limite: ${u.count}`, "count"),
    ],
    [
      btn(`🌐 Fontes: ${fontesAtivas(u).length}/${MAX_FONTES}`, "src"),
      btn(`🏠 Remoto: ${u.remoto ? "Sim" : "Não"}`, "rem"),
    ],
    [
      btn(`✅ Incluir (${u.include.length})`, "inc"),
      btn(`❌ Excluir (${u.exclude.length})`, "exc"),
    ],
    [btn("⬅️ Voltar", "menu")],
  ];

  return { text, kb };
}

export function fontesView(u) {
  const selecionadas = sanitizarFontes(u.fontes);

  const text =
    `🌐 <b>Fontes de vagas</b>\n\n` +
    `Escolha até ${MAX_FONTES} fontes ` +
    `(${selecionadas.length}/${MAX_FONTES} selecionadas).\n` +
    `Toque novamente para desmarcar.\n` +
    RULER;

  const kb = FONTES.map((fonte) => [
    btn(
      `${selecionadas.includes(fonte.chave) ? "✅" : "⬜"} ${fonte.emoji} ${fonte.chave}`,
      `s:${fonte.chave}`,
    ),
  ]);

  kb.push([btn("⬅️ Voltar", "cfg")]);

  return { text, kb };
}

export function hourView(u) {
  const rows = [];

  for (let h = 0; h < 24; h += 4) {
    rows.push(
      Array.from({ length: 4 }, (_, i) => {
        const hour = h + i;
        return btn(
          `${String(hour).padStart(2, "0")}:00${u.hour === hour ? " ✓" : ""}`,
          `h:${hour}`,
        );
      }),
    );
  }

  rows.push([btn("⬅️ Voltar", "cfg")]);

  return {
    text: "⏰ <b>Horário do envio automático</b>\n\nEscolha a hora em que deseja receber as vagas.",
    kb: rows,
  };
}

export function countView(u) {
  const values = [5, 10, 15, 20, 25, 30, 40, 50];

  return {
    text: "📊 <b>Quantidade de vagas</b>\n\nEscolha o limite de vagas por fonte em cada busca.",
    kb: [
      values
        .slice(0, 4)
        .map((n) => btn(`${n}${u.count === n ? " ✓" : ""}`, `c:${n}`)),
      values
        .slice(4)
        .map((n) => btn(`${n}${u.count === n ? " ✓" : ""}`, `c:${n}`)),
      [btn("⬅️ Voltar", "cfg")],
    ],
  };
}

export function tzView(u) {
  const rows = [];

  for (let tz = -12; tz <= 14; tz += 3) {
    const row = [];

    for (let offset = 0; offset < 3 && tz + offset <= 14; offset++) {
      const value = tz + offset;
      row.push(
        btn(`${fmtTz(value)}${u.tz === value ? " ✓" : ""}`, `z:${value}`),
      );
    }

    rows.push(row);
  }

  rows.push([btn("⬅️ Voltar", "cfg")]);

  return {
    text: "🌎 <b>Fuso horário</b>\n\nEscolha o fuso horário usado para calcular o horário dos envios.",
    kb: rows,
  };
}

export function termsView(u, kind) {
  const incluir = kind === "include";
  const termos = u[kind];

  const lista = termos.length
    ? termos.map((t) => `• ${escaparHTML(t)}`).join("\n")
    : "Nenhum termo cadastrado.";

  return {
    text:
      `${incluir ? "✅" : "❌"} <b>${incluir ? "Termos incluídos" : "Termos excluídos"}</b>\n\n` +
      `${lista}\n\n` +
      `Envie os termos separados por vírgula ou em linhas diferentes.\n` +
      `Para cancelar, use /cancelar.`,
    kb: [[btn("🗑️ Limpar termos", `clr:${kind}`)], [btn("⬅️ Voltar", "cfg")]],
  };
}

export function montarMensagens(fonte, emoji, vagas) {
  if (!vagas.length) return [];

  const cabecalho = (parte, total) =>
    `${emoji} <b>Vagas ${escaparHTML(fonte)}</b> (${vagas.length})` +
    `${total > 1 ? ` - parte ${parte}` : ""}\n\n`;

  const grupos = [];
  let atual = [];
  let tamanho = cabecalho(1, 2).length;

  for (const vaga of vagas) {
    const bloco =
      `👩‍💻 ${escaparHTML(vaga.titulo || vaga.nome || "Vaga")}\n` +
      `🔗 <a href="${escaparHTML(vaga.link)}">Ver vaga</a>\n\n`;

    if (tamanho + bloco.length > LIMITE && atual.length) {
      grupos.push(atual);
      atual = [];
      tamanho = cabecalho(1, 2).length;
    }

    atual.push({ vaga, bloco });
    tamanho += bloco.length;
  }

  if (atual.length) grupos.push(atual);

  return grupos.map((grupo, index) => ({
    texto:
      cabecalho(index + 1, grupos.length) +
      grupo.map((item) => item.bloco).join(""),
    vagas: grupo.map((item) => item.vaga),
  }));
}

export function criarTextoPagina(vagas, pagina, total) {
  const inicio = pagina * RESULTADOS_POR_PAGINA;
  const itens = vagas.slice(inicio, inicio + RESULTADOS_POR_PAGINA);
  const totalPaginas = Math.max(1, Math.ceil(total / RESULTADOS_POR_PAGINA));

  const linhas = itens.map((vaga, index) => {
    const numero = inicio + index + 1;
    const fonte = vaga.fonte ? ` <i>(${escaparHTML(vaga.fonte)})</i>` : "";
    return (
      `<b>${numero}. ${escaparHTML(vaga.titulo || vaga.nome || "Vaga")}</b>${fonte}\n` +
      `🔗 <a href="${escaparHTML(vaga.link)}">Ver vaga</a>`
    );
  });

  return {
    texto:
      `💡 <b>Vagas adicionais encontradas</b>\n` +
      `Mostrando ${inicio + 1}–${Math.min(inicio + itens.length, total)} de ${total}\n\n` +
      linhas.join("\n\n"),
    totalPaginas,
  };
}

export function tecladoPagina(id, pagina, totalPaginas) {
  const botoes = [];

  if (pagina > 0) botoes.push(btn("⬅️ Anterior", `all:${id}:${pagina - 1}`));
  if (pagina + 1 < totalPaginas)
    botoes.push(btn("Próxima ➡️", `all:${id}:${pagina + 1}`));

  return [
    ...(botoes.length ? [botoes] : []),
    [btn("↩️ Voltar ao relatório", `all:${id}:back`)],
  ];
}
