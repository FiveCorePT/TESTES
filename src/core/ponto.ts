import { prisma } from "../database/client.js";
import { registarAuditoria } from "./auditoria.js";
import { obterConfig } from "./config.js";

// Helper para formatar minutos em horas legíveis (ex.: "4h 25min" ou "45min")
export function formatarMinutos(totalMinutos: number): string {
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  if (horas > 0) return `${horas}h ${minutos}min`;
  return `${minutos}min`;
}

// Obter o turno atual de um utilizador se estiver aberto ou em pausa
export async function obterTurnoAtivo(servidorId: string, utilizadorId: string) {
  return prisma.registoPonto.findFirst({
    where: {
      servidorId,
      utilizadorId,
      estado: { in: ["EM_SERVICO", "EM_PAUSA"] },
    },
  });
}

// Lista os agentes atualmente de serviço ou em pausa no servidor
export async function listarAtivos(servidorId: string) {
  return prisma.registoPonto.findMany({
    where: {
      servidorId,
      estado: { in: ["EM_SERVICO", "EM_PAUSA"] },
    },
    orderBy: { entradaEm: "asc" },
  });
}

// 🟢 ENTRAR EM SERVIÇO
export async function entrarServico(servidorId: string, utilizadorId: string) {
  const ativo = await obterTurnoAtivo(servidorId, utilizadorId);
  if (ativo) {
    return { sucesso: false as const, erro: "JA_EM_SERVICO" as const, turno: ativo };
  }

  const turno = await prisma.registoPonto.create({
    data: {
      servidorId,
      utilizadorId,
      estado: "EM_SERVICO",
    },
  });

  return { sucesso: true as const, turno };
}

// 🟡 ALTERNAR PAUSA / RETOMAR
export async function alternarPausa(servidorId: string, utilizadorId: string) {
  const turno = await obterTurnoAtivo(servidorId, utilizadorId);
  if (!turno) {
    return { sucesso: false as const, erro: "NAO_EM_SERVICO" as const };
  }

  const agora = new Date();

  if (turno.estado === "EM_SERVICO") {
    // Inicia a pausa
    const atualizado = await prisma.registoPonto.update({
      where: { id: turno.id },
      data: {
        estado: "EM_PAUSA",
        pausaIniciadaEm: agora,
      },
    });
    return { sucesso: true as const, estado: "EM_PAUSA" as const, turno: atualizado };
  } else {
    // Retoma da pausa e calcula os minutos pausados
    let minutosDestaPausa = 0;
    if (turno.pausaIniciadaEm) {
      minutosDestaPausa = Math.floor((agora.getTime() - turno.pausaIniciadaEm.getTime()) / 60000);
    }

    const atualizado = await prisma.registoPonto.update({
      where: { id: turno.id },
      data: {
        estado: "EM_SERVICO",
        pausaIniciadaEm: null,
        totalMinutosPausa: turno.totalMinutosPausa + minutosDestaPausa,
      },
    });
    return { sucesso: true as const, estado: "EM_SERVICO" as const, turno: atualizado };
  }
}

// 🔴 SAIR DE SERVIÇO
export async function sairServico(servidorId: string, utilizadorId: string) {
  const turno = await obterTurnoAtivo(servidorId, utilizadorId);
  if (!turno) {
    return { sucesso: false as const, erro: "NAO_EM_SERVICO" as const };
  }

  const agora = new Date();

  // Se estava em pausa ao sair, soma a pausa pendente
  let minutosPausaFinal = turno.totalMinutosPausa;
  if (turno.estado === "EM_PAUSA" && turno.pausaIniciadaEm) {
    minutosPausaFinal += Math.floor((agora.getTime() - turno.pausaIniciadaEm.getTime()) / 60000);
  }

  // Minutos brutos desde a entrada
  const minutosTotais = Math.floor((agora.getTime() - turno.entradaEm.getTime()) / 60000);
  // Minutos líquidos trabalhados
  const minutosTrabalhados = Math.max(0, minutosTotais - minutosPausaFinal);

  const atualizado = await prisma.registoPonto.update({
    where: { id: turno.id },
    data: {
      saidaEm: agora,
      estado: "FECHADO",
      pausaIniciadaEm: null,
      totalMinutosPausa: minutosPausaFinal,
      totalMinutos: minutosTrabalhados,
      validacao: "PENDENTE",
    },
  });

  return { sucesso: true as const, turno: atualizado };
}

// 📊 OBTER ESTATÍSTICAS DE HORAS DE UM MEMBRO (SEMANA E MÊS)
export async function obterEstatisticasMembro(servidorId: string, utilizadorId: string) {
  const agora = new Date();

  // Início da semana (Segunda-feira às 00:00)
  const inicioSemana = new Date(agora);
  const diaSemana = inicioSemana.getDay(); // 0 é domingo
  const distanciaSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
  inicioSemana.setDate(inicioSemana.getDate() - distanciaSegunda);
  inicioSemana.setHours(0, 0, 0, 0);

  // Início do mês (Dia 1 às 00:00)
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);

  // Turnos da semana
  const turnosSemana = await prisma.registoPonto.findMany({
    where: {
      servidorId,
      utilizadorId,
      entradaEm: { gte: inicioSemana },
      estado: "FECHADO",
    },
  });

  // Turnos do mês
  const turnosMes = await prisma.registoPonto.findMany({
    where: {
      servidorId,
      utilizadorId,
      entradaEm: { gte: inicioMes },
      estado: "FECHADO",
    },
  });

  // Somar apenas o que estiver VALIDADO para as horas oficiais
  const minutosSemanaValidados = turnosSemana
    .filter((t) => t.validacao === "VALIDADO")
    .reduce((soma, t) => soma + t.totalMinutos, 0);

  const minutosSemanaPendentes = turnosSemana
    .filter((t) => t.validacao === "PENDENTE")
    .reduce((soma, t) => soma + t.totalMinutos, 0);

  const minutosMesValidados = turnosMes
    .filter((t) => t.validacao === "VALIDADO")
    .reduce((soma, t) => soma + t.totalMinutos, 0);

  return {
    semanaValidadas: minutosSemanaValidados,
    semanaPendentes: minutosSemanaPendentes,
    mesValidadas: minutosMesValidados,
    totalTurnosSemana: turnosSemana.length,
  };
}

// ⚖️ AUDITORIA: LISTAR TURNOS PENDENTES DE VALIDAÇÃO
export async function listarTurnosPendentes(servidorId: string, pagina: number = 0) {
  const ITENS_POR_PAGINA = 5;

  const where = { servidorId, estado: "FECHADO" as const, validacao: "PENDENTE" as const };
  const total = await prisma.registoPonto.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA));
  const paginaValida = Math.max(0, Math.min(pagina, totalPaginas - 1));

  const turnos = await prisma.registoPonto.findMany({
    where,
    orderBy: { entradaEm: "desc" },
    skip: paginaValida * ITENS_POR_PAGINA,
    take: ITENS_POR_PAGINA,
  });

  return { turnos, total, totalPaginas, pagina: paginaValida };
}

// ⚖️ AUDITORIA: VALIDAR OU INVALIDAR UM TURNO
export async function validarTurno(
  servidorId: string,
  turnoId: number,
  superiorId: string,
  aprovar: boolean,
  motivo?: string,
) {
  const turno = await prisma.registoPonto.findUnique({ where: { id: turnoId } });
  if (!turno || turno.servidorId !== servidorId) {
    return { sucesso: false as const, erro: "NAO_ENCONTRADO" as const };
  }

  const novaValidacao = aprovar ? "VALIDADO" : "INVALIDADO";

  const atualizado = await prisma.registoPonto.update({
    where: { id: turnoId },
    data: {
      validacao: novaValidacao,
      validadoPor: superiorId,
      validadoEm: new Date(),
      motivoInvalido: aprovar ? null : (motivo ?? "Sem motivo especificado"),
    },
  });

  // Regista na Auditoria central (e dá para desfazer!)
  await registarAuditoria({
    servidorId,
    autorId: superiorId,
    modulo: "ponto",
    acao: aprovar ? "ponto.validado" : "ponto.invalidado",
    alvoId: String(turno.id),
    antes: { validacao: turno.validacao },
    depois: { validacao: novaValidacao, motivo: motivo ?? null },
    reversivel: true,
  });

  return { sucesso: true as const, turno: atualizado };
}

// 🛑 SUPERIOR FORÇA O FECHO DE UM TURNO (ESQUECIMENTOS)
export async function forcarFechoTurno(
  servidorId: string,
  utilizadorId: string,
  superiorId: string,
) {
  const turno = await obterTurnoAtivo(servidorId, utilizadorId);
  if (!turno) {
    return { sucesso: false as const, erro: "NAO_EM_SERVICO" as const };
  }

  const agora = new Date();
  let minutosPausaFinal = turno.totalMinutosPausa;
  if (turno.estado === "EM_PAUSA" && turno.pausaIniciadaEm) {
    minutosPausaFinal += Math.floor((agora.getTime() - turno.pausaIniciadaEm.getTime()) / 60000);
  }

  const minutosTotais = Math.floor((agora.getTime() - turno.entradaEm.getTime()) / 60000);
  const minutosTrabalhados = Math.max(0, minutosTotais - minutosPausaFinal);

  const atualizado = await prisma.registoPonto.update({
    where: { id: turno.id },
    data: {
      saidaEm: agora,
      estado: "FECHADO",
      pausaIniciadaEm: null,
      totalMinutosPausa: minutosPausaFinal,
      totalMinutos: minutosTrabalhados,
      validacao: "PENDENTE",
    },
  });

  // Regista na Auditoria central para dar para desfazer se for engano!
  await registarAuditoria({
    servidorId,
    autorId: superiorId,
    modulo: "ponto",
    acao: "ponto.fecho_forcado",
    alvoId: String(turno.id),
    antes: { estado: turno.estado, entradaEm: turno.entradaEm },
    depois: { estado: "FECHADO", saidaEm: agora, totalMinutos: minutosTrabalhados },
    reversivel: true,
  });

  return { sucesso: true as const, turno: atualizado };
}