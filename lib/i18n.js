// PEÑA — Internationalization (EN/ES)
// Auto-detects browser language, toggle via UI

const LANG = {
  en: {
    balance: 'Balance', members: 'Members', contribute: 'Contribute', proposal: 'Proposal',
    audit: 'Audit', proposals: 'Proposals', pending: 'Pending', executed: 'Executed',
    feed: 'Audit', tabBalance: 'Balance', tabReports: 'Reports', tabMatches: 'Matches', tabCalc: 'Calc', tabQuery: 'Query', tabP2P: 'P2P', tabHelp: 'Help',
    contribute_btn: 'Contribute', propose_btn: 'Proposal', contributeTitle: 'Contribute to Treasury', newProposal: 'New Spending Proposal',
    transactions: 'Transactions', expensesByCategory: 'Expenses by Category', spendingTrend: 'Spending Trend (7 days)', contributionsByMember: 'Contributions by Member',
    treasuryReport: 'Treasury Report', detailedBreakdown: 'Detailed Breakdown', proposalHistory: 'Proposal History',
    upcomingMatches: 'Upcoming Matches', resultsHistory: 'Results History', venues: 'Venues',
    auditFeedTitle: 'AUDIT FEED', transparent: 'Transparent and Immutable',
    filterAll: 'All', filterContributions: 'Contributions', filterProposals: 'Proposals', filterExecutions: 'Executions',
    approve: 'Approve', execute: 'Execute', approved: 'Approved', settings: 'Settings',
    income: 'Income', expenses: 'Expenses', notes: 'Notes', addNote: 'Add',
    query: 'Query', queryPlaceholder: 'e.g. how much on buses?', search: 'Search',
    payee: 'Payee', amount: 'Amount', purpose: 'Purpose', create: 'Create', cancel: 'Cancel',
    demo: 'Demo', live: 'Live', help: 'Help', reports: 'Reports', matches: 'Matches',
    exportReport: 'Export', copyReport: 'Copy', download: 'Download', budgetTracker: 'Budget Tracker',
    onboarding_welcome: 'Welcome to PEÑA!', onboarding_step1: 'Your self-custody wallet has been generated.',
    onboarding_step2: 'Start by exploring Demo mode, or switch to Live to create your real treasury.',
    onboarding_step3: 'Invite members via P2P tab — share QR code or peer ID.',
    noActivity: 'No activity yet', gasless: 'gasless', onChain: 'on-chain',
    disputeTitle: 'Flag Transaction', disputeReason: 'Reason for dispute',
    disputeSubmit: 'Submit Dispute', disputeList: 'Disputed Items',
    recurringTitle: 'Recurring Contribution', recurringInterval: 'Interval',
    recurringWeekly: 'Weekly', recurringMonthly: 'Monthly',
    transparencyTitle: 'Public Transparency', transparencyDesc: 'Shareable read-only treasury summary',
    insufficientBalance: 'Insufficient treasury balance', invalidAmount: 'Invalid amount (1–1,000,000)',
    sigVerified: 'Signature verified', sigInvalid: 'Signature unverified',
    roleFounder: 'Founder', roleApprover: 'Approver', roleMember: 'Member', roleViewer: 'Viewer',
    budgetLimitExceeded: 'Budget limit exceeded for this role',
  },
  es: {
    balance: 'Saldo', members: 'Miembros', contribute: 'Contribuir', proposal: 'Propuesta',
    audit: 'Auditoría', proposals: 'Propuestas', pending: 'Pendiente', executed: 'Ejecutado',
    feed: 'Auditoría', tabBalance: 'Saldo', tabReports: 'Informes', tabMatches: 'Partidos', tabCalc: 'Calc', tabQuery: 'Consulta', tabP2P: 'P2P', tabHelp: 'Ayuda',
    contribute_btn: 'Contribuir', propose_btn: 'Propuesta', contributeTitle: 'Contribuir a la Tesorería', newProposal: 'Nueva Propuesta de Gasto',
    transactions: 'Transacciones', expensesByCategory: 'Gastos por Categoría', spendingTrend: 'Tendencia de Gastos (7 días)', contributionsByMember: 'Contribuciones por Miembro',
    treasuryReport: 'Informe de Tesorería', detailedBreakdown: 'Desglose Detallado', proposalHistory: 'Historial de Propuestas',
    upcomingMatches: 'Próximos Partidos', resultsHistory: 'Historial de Resultados', venues: 'Recintos',
    auditFeedTitle: 'REGISTRO DE AUDITORÍA', transparent: 'Transparente e Inmutable',
    filterAll: 'Todos', filterContributions: 'Contribuciones', filterProposals: 'Propuestas', filterExecutions: 'Ejecuciones',
    approve: 'Aprobar', execute: 'Ejecutar', approved: 'Aprobado', settings: 'Ajustes',
    income: 'Ingresos', expenses: 'Gastos', notes: 'Notas', addNote: 'Agregar',
    query: 'Consulta', queryPlaceholder: 'ej. cuánto en buses?', search: 'Buscar',
    payee: 'Beneficiario', amount: 'Monto', purpose: 'Propósito', create: 'Crear', cancel: 'Cancelar',
    demo: 'Demo', live: 'Real', help: 'Ayuda', reports: 'Informes', matches: 'Partidos',
    exportReport: 'Exportar', copyReport: 'Copiar', download: 'Descargar', budgetTracker: 'Presupuesto',
    onboarding_welcome: '¡Bienvenido a PEÑA!', onboarding_step1: 'Tu billetera de autocustodia fue generada.',
    onboarding_step2: 'Explora el modo Demo o cambia a Real para crear tu tesorería.',
    onboarding_step3: 'Invita miembros desde P2P — comparte código QR o peer ID.',
    noActivity: 'Sin actividad', gasless: 'sin gas', onChain: 'on-chain',
    disputeTitle: 'Disputar Transacción', disputeReason: 'Razón de la disputa',
    disputeSubmit: 'Enviar Disputa', disputeList: 'Elementos Disputados',
    recurringTitle: 'Contribución Recurrente', recurringInterval: 'Intervalo',
    recurringWeekly: 'Semanal', recurringMonthly: 'Mensual',
    transparencyTitle: 'Transparencia Pública', transparencyDesc: 'Resumen de tesorería compartible',
    insufficientBalance: 'Saldo insuficiente en la tesorería', invalidAmount: 'Monto inválido (1–1.000.000)',
    sigVerified: 'Firma verificada', sigInvalid: 'Firma no verificada',
    roleFounder: 'Fundador', roleApprover: 'Aprobador', roleMember: 'Miembro', roleViewer: 'Observador',
    budgetLimitExceeded: 'Límite de presupuesto excedido para este rol',
  },
};

let currentLang = 'en';

function setLang(lang) {
  currentLang = lang;
}

function getLang() {
  return currentLang;
}

function t(key) {
  return (LANG[currentLang] || LANG.en)[key] || LANG.en[key] || key;
}

export { LANG, t, setLang, getLang };
