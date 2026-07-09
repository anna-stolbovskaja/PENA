// PEÑA — Transparent Self-Custody Treasury Prototype
// P2P sync via BroadcastChannel (simulates Hyperswarm/Autobase)
// Mock WDK wallet, QVAC receipt parser, NL queries

// ═══════════════════════════════════════════════════════════════
// STATE MANAGEMENT (Autobase simulation)
// ═══════════════════════════════════════════════════════════════

const PENA_STATE = {
  members: [],
  contributions: [],
  proposals: [],
  executions: [],
  receipts: [],
  balance: 0,
  threshold: 2, // M-of-N
  currentUser: null,
  groupName: 'Peña Atlético Sur',
  groupInvite: 'pena-atletico-2026',
  txCounter: 0,
};

// Event types matching the repo schema
const EventType = {
  MEMBER_JOIN: 'member:join',
  CONTRIBUTION: 'contribution',
  PROPOSAL_CREATE: 'proposal:create',
  PROPOSAL_APPROVE: 'proposal:approve',
  PROPOSAL_EXECUTE: 'proposal:execute',
  RECEIPT_PARSE: 'receipt:parse',
};

// ═══════════════════════════════════════════════════════════════
// P2P SYNC (BroadcastChannel = simulates Hyperswarm)
// ═══════════════════════════════════════════════════════════════

const p2pChannel = new BroadcastChannel('pena-treasury-sync');
let peerId = Math.random().toString(36).substring(2, 8);
let connectedPeers = new Set([peerId]);

p2pChannel.onmessage = (e) => {
  const { type, data, from } = e.data;
  if (from === peerId) return;

  if (type === 'peer:hello') {
    connectedPeers.add(from);
    p2pChannel.postMessage({ type: 'peer:ack', from: peerId, data: { state: getStateSnapshot() } });
    render();
  } else if (type === 'peer:ack') {
    connectedPeers.add(from);
    if (PENA_STATE.members.length === 0 && data.state) {
      restoreState(data.state);
    }
    render();
  } else if (type === 'peer:bye') {
    connectedPeers.delete(from);
    render();
  } else if (type === 'event:broadcast') {
    applyEvent(data);
    render();
    showToast(`📡 P2P sync: ${data.type} from peer ${from.substring(0,4)}`, 'p2p');
  }
};

window.addEventListener('beforeunload', () => {
  p2pChannel.postMessage({ type: 'peer:bye', from: peerId });
});

function broadcastEvent(event) {
  applyEvent(event);
  p2pChannel.postMessage({ type: 'event:broadcast', from: peerId, data: event });
  render();
}

function getStateSnapshot() {
  return {
    members: PENA_STATE.members,
    contributions: PENA_STATE.contributions,
    proposals: PENA_STATE.proposals,
    executions: PENA_STATE.executions,
    receipts: PENA_STATE.receipts,
    balance: PENA_STATE.balance,
    threshold: PENA_STATE.threshold,
    groupName: PENA_STATE.groupName,
  };
}

function restoreState(snap) {
  PENA_STATE.members = snap.members || [];
  PENA_STATE.contributions = snap.contributions || [];
  PENA_STATE.proposals = snap.proposals || [];
  PENA_STATE.executions = snap.executions || [];
  PENA_STATE.receipts = snap.receipts || [];
  PENA_STATE.balance = snap.balance || 0;
  PENA_STATE.threshold = snap.threshold || 2;
  PENA_STATE.groupName = snap.groupName || 'Peña Atlético Sur';
}

// Announce presence
p2pChannel.postMessage({ type: 'peer:hello', from: peerId });

// ═══════════════════════════════════════════════════════════════
// REDUCER (matches src/ledger/reducer.js)
// ═══════════════════════════════════════════════════════════════

function applyEvent(event) {
  switch (event.type) {
    case EventType.MEMBER_JOIN:
      if (!PENA_STATE.members.find(m => m.id === event.data.id)) {
        PENA_STATE.members.push(event.data);
      }
      break;
    case EventType.CONTRIBUTION:
      PENA_STATE.contributions.push(event.data);
      PENA_STATE.balance += event.data.amount;
      break;
    case EventType.PROPOSAL_CREATE:
      PENA_STATE.proposals.push({ ...event.data, approvals: [], status: 'pending' });
      break;
    case EventType.PROPOSAL_APPROVE:
      const prop = PENA_STATE.proposals.find(p => p.id === event.data.proposalId);
      if (prop && !prop.approvals.find(a => a.memberId === event.data.memberId)) {
        prop.approvals.push(event.data);
      }
      break;
    case EventType.PROPOSAL_EXECUTE:
      const exProp = PENA_STATE.proposals.find(p => p.id === event.data.proposalId);
      if (exProp && exProp.status !== 'executed') {
        exProp.status = 'executed';
        PENA_STATE.executions.push(event.data);
        PENA_STATE.balance -= exProp.amount;
      }
      break;
    case EventType.RECEIPT_PARSE:
      PENA_STATE.receipts.push(event.data);
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// MOCK WDK WALLET (simulates ERC-4337 smart account)
// ═══════════════════════════════════════════════════════════════

function mockTxHash() {
  PENA_STATE.txCounter++;
  return '0x' + Array.from({length: 64}, () => 
    '0123456789abcdef'[Math.floor(Math.random() * 16)]
  ).join('');
}

function mockWalletAddress() {
  return '0x' + Array.from({length: 40}, () => 
    '0123456789abcdef'[Math.floor(Math.random() * 16)]
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// MOCK QVAC — Receipt parsing (simulates VLM)
// ═══════════════════════════════════════════════════════════════

const MOCK_RECEIPTS = [
  { payee: 'Autobuses Ruta Sur', amount: 450, category: 'Transporte', date: '2026-07-08' },
  { payee: 'Ferretería El Tornillo', amount: 180, category: 'Equipos', date: '2026-07-07' },
  { payee: 'Imprenta La Prensa', amount: 320, category: 'Tifo', date: '2026-07-06' },
  { payee: 'Carnicería Don Pepe', amount: 95, category: 'Comida', date: '2026-07-05' },
  { payee: 'Estadio Municipal', amount: 200, category: 'Entradas', date: '2026-07-04' },
  { payee: 'Bar La Esquina', amount: 75, category: 'Comida', date: '2026-07-03' },
  { payee: 'Taller Mecánico López', amount: 140, category: 'Transporte', date: '2026-07-02' },
  { payee: 'Telas y Costuras SA', amount: 280, category: 'Tifo', date: '2026-07-01' },
];

function parseReceiptMock() {
  // Simulates QVAC VLM processing a receipt photo
  return MOCK_RECEIPTS[Math.floor(Math.random() * MOCK_RECEIPTS.length)];
}

// ═══════════════════════════════════════════════════════════════
// MOCK QVAC — NL Query (simulates LLM + RAG)
// ═══════════════════════════════════════════════════════════════

function nlQueryMock(query) {
  const q = query.toLowerCase();
  const executed = PENA_STATE.proposals.filter(p => p.status === 'executed');
  const pending = PENA_STATE.proposals.filter(p => p.status === 'pending');
  
  if (q.includes('balance') || q.includes('saldo')) {
    return `💰 Saldo actual de la tesorería: **${PENA_STATE.balance} USD₮**\n\nTotal recaudado: ${PENA_STATE.contributions.reduce((s,c) => s+c.amount, 0)} USD₮\nTotal gastado: ${executed.reduce((s,p) => s+p.amount, 0)} USD₮`;
  }
  
  if (q.includes('bus') || q.includes('autobús') || q.includes('transporte')) {
    const transport = executed.filter(p => p.purpose.toLowerCase().includes('bus') || p.purpose.toLowerCase().includes('transport'));
    const total = transport.reduce((s,p) => s+p.amount, 0);
    return `🚌 Gastos en transporte: **${total} USD₮** en ${transport.length} propuestas.\n\n${transport.map(p => `• ${p.payee}: ${p.amount} USD₮ — ${p.purpose}`).join('\n')}`;
  }
  
  if (q.includes('tifo')) {
    const tifo = executed.filter(p => p.purpose.toLowerCase().includes('tifo') || p.purpose.toLowerCase().includes('tela'));
    const total = tifo.reduce((s,p) => s+p.amount, 0);
    return `🎨 Gastos en tifo: **${total} USD₮** en ${tifo.length} propuestas.\n\n${tifo.map(p => `• ${p.payee}: ${p.amount} USD₮`).join('\n')}`;
  }
  
  if (q.includes('contribuy') || q.includes('aport') || q.includes('quien')) {
    const byMember = {};
    PENA_STATE.contributions.forEach(c => {
      const m = PENA_STATE.members.find(m => m.id === c.memberId);
      const name = m ? m.name : 'Unknown';
      byMember[name] = (byMember[name] || 0) + c.amount;
    });
    const sorted = Object.entries(byMember).sort((a,b) => b[1] - a[1]);
    return `👥 Contribuciones por miembro:\n\n${sorted.map(([name, amt], i) => `${i+1}. ${name}: ${amt} USD₮`).join('\n')}`;
  }
  
  if (q.includes('pending') || q.includes('pendiente')) {
    return `⏳ Propuestas pendientes: **${pending.length}**\n\n${pending.map(p => `• ${p.payee}: ${p.amount} USD₮ — ${p.approvals.length}/${PENA_STATE.threshold} aprobaciones`).join('\n')}`;
  }
  
  if (q.includes('miembro') || q.includes('member') || q.includes('integrante')) {
    return `👥 Miembros del grupo: **${PENA_STATE.members.length}**\n\n${PENA_STATE.members.map(m => `• ${m.name} (${m.role})`).join('\n')}`;
  }
  
  if (q.includes('categoria') || q.includes('categor') || q.includes('breakdown')) {
    const byCat = {};
    executed.forEach(p => {
      const cat = p.category || 'Otros';
      byCat[cat] = (byCat[cat] || 0) + p.amount;
    });
    return `📊 Gastos por categoría:\n\n${Object.entries(byCat).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => `• ${cat}: ${amt} USD₮`).join('\n')}`;
  }
  
  // Default: summary
  return `📊 Resumen de la tesorería **${PENA_STATE.groupName}**:\n\n• Saldo: ${PENA_STATE.balance} USD₮\n• Miembros: ${PENA_STATE.members.length}\n• Contribuciones: ${PENA_STATE.contributions.length}\n• Propuestas ejecutadas: ${executed.length}\n• Propuestas pendientes: ${pending.length}\n\nPrueba: "saldo", "transporte", "tifo", "quien contribuyó más", "categorías"`;
}

// ═══════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════

function seedData() {
  if (PENA_STATE.members.length > 0) return;
  
  const members = [
    { id: 'm1', name: 'Carlos Mendoza', pubkey: 'pk_carlos', walletAddr: mockWalletAddress(), role: 'founder' },
    { id: 'm2', name: 'Ana Stolbovskaja', pubkey: 'pk_anna', walletAddr: mockWalletAddress(), role: 'approver' },
    { id: 'm3', name: 'Diego Ramírez', pubkey: 'pk_diego', walletAddr: mockWalletAddress(), role: 'approver' },
    { id: 'm4', name: 'Lucía Fernández', pubkey: 'pk_lucia', walletAddr: mockWalletAddress(), role: 'member' },
  ];
  
  members.forEach(m => applyEvent({ type: EventType.MEMBER_JOIN, data: m }));
  
  // Seed contributions
  applyEvent({ type: EventType.CONTRIBUTION, data: { memberId: 'm1', amount: 500, txHash: mockTxHash(), ts: Date.now() - 86400000 * 7 } });
  applyEvent({ type: EventType.CONTRIBUTION, data: { memberId: 'm2', amount: 300, txHash: mockTxHash(), ts: Date.now() - 86400000 * 6 } });
  applyEvent({ type: EventType.CONTRIBUTION, data: { memberId: 'm3', amount: 200, txHash: mockTxHash(), ts: Date.now() - 86400000 * 5 } });
  applyEvent({ type: EventType.CONTRIBUTION, data: { memberId: 'm4', amount: 150, txHash: mockTxHash(), ts: Date.now() - 86400000 * 4 } });
  
  // Seed executed proposals
  const p1 = { id: 'p1', payee: 'Autobuses Ruta Sur', amount: 450, currency: 'USDt', purpose: 'Alquiler de 2 autobuses para viaje a Capital', category: 'Transporte', createdBy: 'm1', ts: Date.now() - 86400000 * 3 };
  applyEvent({ type: EventType.PROPOSAL_CREATE, data: p1 });
  applyEvent({ type: EventType.PROPOSAL_APPROVE, data: { proposalId: 'p1', memberId: 'm1', sig: 'sig1', ts: Date.now() - 86400000 * 3 + 3600000 } });
  applyEvent({ type: EventType.PROPOSAL_APPROVE, data: { proposalId: 'p1', memberId: 'm2', sig: 'sig2', ts: Date.now() - 86400000 * 3 + 7200000 } });
  applyEvent({ type: EventType.PROPOSAL_EXECUTE, data: { proposalId: 'p1', txHash: mockTxHash(), ts: Date.now() - 86400000 * 3 + 10800000 } });
  
  const p2 = { id: 'p2', payee: 'Imprenta La Prensa', amount: 320, currency: 'USDt', purpose: 'Tifo: banderas y pancartas para el clásico', category: 'Tifo', createdBy: 'm2', ts: Date.now() - 86400000 * 2 };
  applyEvent({ type: EventType.PROPOSAL_CREATE, data: p2 });
  applyEvent({ type: EventType.PROPOSAL_APPROVE, data: { proposalId: 'p2', memberId: 'm2', sig: 'sig3', ts: Date.now() - 86400000 * 2 + 3600000 } });
  applyEvent({ type: EventType.PROPOSAL_APPROVE, data: { proposalId: 'p2', memberId: 'm3', sig: 'sig4', ts: Date.now() - 86400000 * 2 + 7200000 } });
  applyEvent({ type: EventType.PROPOSAL_EXECUTE, data: { proposalId: 'p2', txHash: mockTxHash(), ts: Date.now() - 86400000 * 2 + 10800000 } });
  
  // Seed pending proposal
  const p3 = { id: 'p3', payee: 'Ferretería El Tornillo', amount: 180, currency: 'USDt', purpose: 'Materiales para gradería temporal', category: 'Equipos', createdBy: 'm3', ts: Date.now() - 3600000 };
  applyEvent({ type: EventType.PROPOSAL_CREATE, data: p3 });
  applyEvent({ type: EventType.PROPOSAL_APPROVE, data: { proposalId: 'p3', memberId: 'm3', sig: 'sig5', ts: Date.now() - 3000000 } });
  
  PENA_STATE.currentUser = 'm2';
}

seedData();

// ═══════════════════════════════════════════════════════════════
// UI RENDERING
// ═══════════════════════════════════════════════════════════════

let currentTab = 'feed';
let showNLQuery = false;
let nlQueryInput = '';
let nlQueryResult = '';
let showContribute = false;
let showProposal = false;
let proposalReceiptParsed = null;

function render() {
  const app = document.getElementById('app');
  app.innerHTML = renderLayout();
  attachEventListeners();
}

function renderLayout() {
  return `
    <div class="max-w-5xl mx-auto px-4 py-6">
      ${renderHeader()}
      ${renderTabs()}
      <div class="mt-6">
        ${currentTab === 'feed' ? renderFeedTab() : ''}
        ${currentTab === 'proposals' ? renderProposalsTab() : ''}
        ${currentTab === 'balance' ? renderBalanceTab() : ''}
        ${currentTab === 'query' ? renderQueryTab() : ''}
        ${currentTab === 'p2p' ? renderP2PTab() : ''}
      </div>
      ${renderFooter()}
    </div>
  `;
}

function renderHeader() {
  const totalIn = PENA_STATE.contributions.reduce((s,c) => s+c.amount, 0);
  const totalOut = PENA_STATE.proposals.filter(p => p.status === 'executed').reduce((s,p) => s+p.amount, 0);
  return `
    <div class="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center text-white font-bold text-lg">P</div>
            <div>
              <h1 class="text-xl font-bold">PEÑA</h1>
              <p class="text-xs text-gray-500 dark:text-gray-400">${PENA_STATE.groupName}</p>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-6">
          <div class="text-right">
            <p class="text-xs text-gray-500 dark:text-gray-400">Saldo</p>
            <p class="text-2xl font-bold text-green-600 dark:text-green-400">${PENA_STATE.balance} <span class="text-sm">USD₮</span></p>
          </div>
          <div class="text-right">
            <p class="text-xs text-gray-500 dark:text-gray-400">Miembros</p>
            <p class="text-2xl font-bold">${PENA_STATE.members.length}</p>
          </div>
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950">
            <div class="w-2 h-2 rounded-full bg-green-500 p2p-pulse"></div>
            <span class="text-xs font-medium text-green-700 dark:text-green-300">${connectedPeers.size} peer${connectedPeers.size !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
      <div class="mt-4 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>↑ Entradas: ${totalIn} USD₮</span>
        <span>↓ Salidas: ${totalOut} USD₮</span>
        <span>Threshold: ${PENA_STATE.threshold}-of-${PENA_STATE.members.filter(m => m.role !== 'member').length}</span>
      </div>
    </div>
  `;
}

function renderTabs() {
  const tabs = [
    { id: 'feed', label: 'Audit Feed', icon: '📋' },
    { id: 'proposals', label: 'Proposals', icon: '✋' },
    { id: 'balance', label: 'Balance', icon: '💰' },
    { id: 'query', label: 'NL Query', icon: '🤖' },
    { id: 'p2p', label: 'P2P Sync', icon: '📡' },
  ];
  return `
    <div class="flex gap-1 mt-4 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
      ${tabs.map(t => `
        <button data-tab="${t.id}" class="tab-btn px-4 py-2.5 font-medium text-sm whitespace-nowrap transition-smooth ${currentTab === t.id ? 'tab-active' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}">
          ${t.icon} ${t.label}
        </button>
      `).join('')}
    </div>
  `;
}

// ─── FEED TAB ───────────────────────────────────────────────────

function renderFeedTab() {
  // Build chronological feed from all events
  const events = [];
  PENA_STATE.members.forEach(m => events.push({ ts: m.ts || Date.now(), type: 'member', data: m }));
  PENA_STATE.contributions.forEach(c => events.push({ ts: c.ts, type: 'contribution', data: c }));
  PENA_STATE.proposals.forEach(p => {
    events.push({ ts: p.ts, type: 'proposal', data: p });
    p.approvals.forEach(a => events.push({ ts: a.ts, type: 'approval', data: a, proposal: p }));
  });
  PENA_STATE.executions.forEach(e => {
    const p = PENA_STATE.proposals.find(p => p.id === e.proposalId);
    events.push({ ts: e.ts, type: 'execution', data: e, proposal: p });
  });
  events.sort((a, b) => b.ts - a.ts);

  return `
    <div class="space-y-3">
      <div class="flex gap-2">
        <button id="btn-contribute" class="flex-1 py-2.5 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-smooth">
          + Contribuir
        </button>
        <button id="btn-propose" class="flex-1 py-2.5 px-4 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium text-sm transition-smooth">
          + Propuesta de gasto
        </button>
      </div>
      ${showContribute ? renderContributeForm() : ''}
      ${showProposal ? renderProposalForm() : ''}
      <div class="mt-4">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">LÁMINA DE AUDITORÍA — TRANSPARENTE E INMUTABLE</h3>
        <div class="space-y-2">
          ${events.length === 0 ? '<p class="text-center text-gray-400 py-8">Sin actividad aún</p>' : 
            events.slice(0, 50).map(e => renderFeedItem(e)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderFeedItem(e) {
  const time = new Date(e.ts).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const member = (id) => PENA_STATE.members.find(m => m.id === id);
  
  if (e.type === 'member') {
    return `
      <div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
        <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-sm">👤</div>
        <div class="flex-1">
          <p class="text-sm font-medium">${e.data.name} se unió al grupo</p>
          <p class="text-xs text-gray-400">${e.data.role} · ${time}</p>
        </div>
      </div>
    `;
  }
  
  if (e.type === 'contribution') {
    const m = member(e.data.memberId);
    return `
      <div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900">
        <div class="w-8 h-8 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center text-sm">↑</div>
        <div class="flex-1">
          <p class="text-sm font-medium">${m ? m.name : 'Unknown'} contribuyó <span class="text-green-600 dark:text-green-400 font-bold">${e.data.amount} USD₮</span></p>
          <p class="text-xs text-gray-400 font-mono">${e.data.txHash.substring(0,20)}... · ${time}</p>
        </div>
        <span class="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">on-chain ✓</span>
      </div>
    `;
  }
  
  if (e.type === 'proposal') {
    const m = member(e.data.createdBy);
    return `
      <div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-100 dark:border-yellow-900">
        <div class="w-8 h-8 rounded-full bg-yellow-200 dark:bg-yellow-800 flex items-center justify-center text-sm">📋</div>
        <div class="flex-1">
          <p class="text-sm font-medium">${m ? m.name : 'Unknown'} propuso pagar <span class="font-bold">${e.data.amount} USD₮</span> a ${e.data.payee}</p>
          <p class="text-xs text-gray-400">${e.data.purpose} · ${time}</p>
        </div>
        <span class="text-xs px-2 py-1 rounded-full badge-pending">${e.data.status === 'executed' ? 'ejecutada' : 'pendiente'}</span>
      </div>
    `;
  }
  
  if (e.type === 'approval') {
    const m = member(e.data.memberId);
    return `
      <div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
        <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm">✋</div>
        <div class="flex-1">
          <p class="text-sm">${m ? m.name : 'Unknown'} aprobó: ${e.proposal ? e.proposal.payee : ''} (${e.proposal ? e.proposal.amount : 0} USD₮)</p>
          <p class="text-xs text-gray-400">firma verificada · ${time}</p>
        </div>
      </div>
    `;
  }
  
  if (e.type === 'execution') {
    const m = e.proposal ? member(e.proposal.createdBy) : null;
    return `
      <div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
        <div class="w-8 h-8 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center text-sm">↓</div>
        <div class="flex-1">
          <p class="text-sm font-medium">Transferencia ejecutada: <span class="font-bold">${e.proposal ? e.proposal.amount : 0} USD₮</span> → ${e.proposal ? e.proposal.payee : ''}</p>
          <p class="text-xs text-gray-400 font-mono">${e.data.txHash.substring(0,20)}... · gasless ✓ · ${time}</p>
        </div>
        <span class="text-xs px-2 py-1 rounded-full badge-executed">on-chain ✓</span>
      </div>
    `;
  }
  
  return '';
}

function renderContributeForm() {
  return `
    <div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 mt-2">
      <h4 class="font-semibold mb-3">Contribuir al tesoro</h4>
      <div class="flex gap-2">
        <input id="contrib-amount" type="number" placeholder="Cantidad USD₮" class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
        <button id="btn-contrib-submit" class="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-smooth">Enviar gasless ✓</button>
        <button id="btn-contrib-cancel" class="px-4 py-2 rounded-lg text-gray-500 text-sm">Cancelar</button>
      </div>
      <p class="text-xs text-gray-400 mt-2">Simula WDK ERC-4337: paymaster paga gas en USD₮ · EIP-3009 transferWithAuthorization</p>
    </div>
  `;
}

function renderProposalForm() {
  return `
    <div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 mt-2">
      <h4 class="font-semibold mb-3">Nueva propuesta de gasto</h4>
      <div class="space-y-3">
        <input id="prop-payee" type="text" placeholder="Beneficiario (ej: Autobuses Ruta Sur)" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
        <input id="prop-amount" type="number" placeholder="Cantidad USD₮" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
        <input id="prop-purpose" type="text" placeholder="Concepto (ej: Alquiler de autobús)" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
        
        <div class="receipt-drop rounded-lg p-4 text-center cursor-pointer" id="receipt-upload">
          ${proposalReceiptParsed ? `
            <div class="text-left">
              <p class="text-xs text-green-600 dark:text-green-400 font-medium mb-1">✓ QVAC VLM parseó el recibo:</p>
              <p class="text-sm">Beneficiario: <strong>${proposalReceiptParsed.payee}</strong></p>
              <p class="text-sm">Monto: <strong>${proposalReceiptParsed.amount} USD₮</strong></p>
              <p class="text-sm">Categoría: ${proposalReceiptParsed.category}</p>
              <p class="text-xs text-gray-400">Fecha: ${proposalReceiptParsed.date}</p>
            </div>
          ` : `
            <p class="text-sm text-gray-400">📷 Adjuntar foto del recibo → QVAC VLM extrae datos</p>
            <p class="text-xs text-gray-400 mt-1">Click para simular captura</p>
          `}
        </div>
        
        <div class="flex gap-2">
          <button id="btn-prop-submit" class="flex-1 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium text-sm transition-smooth">Crear propuesta</button>
          <button id="btn-prop-cancel" class="px-4 py-2 rounded-lg text-gray-500 text-sm">Cancelar</button>
        </div>
      </div>
    </div>
  `;
}

// ─── PROPOSALS TAB ──────────────────────────────────────────────

function renderProposalsTab() {
  const pending = PENA_STATE.proposals.filter(p => p.status === 'pending');
  const executed = PENA_STATE.proposals.filter(p => p.status === 'executed');
  
  return `
    <div class="space-y-4">
      <div>
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">PENDIENTES — REQUIEREN ${PENA_STATE.threshold} APROBACIONES</h3>
        <div class="space-y-3">
          ${pending.length === 0 ? '<p class="text-center text-gray-400 py-8">Sin propuestas pendientes</p>' :
            pending.map(p => renderProposalCard(p)).join('')}
        </div>
      </div>
      ${executed.length > 0 ? `
        <div>
          <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 mt-6">EJECUTADAS</h3>
          <div class="space-y-3">
            ${executed.map(p => renderProposalCard(p)).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderProposalCard(p) {
  const approvers = PENA_STATE.members.filter(m => m.role !== 'member');
  const hasApproved = p.approvals.some(a => a.memberId === PENA_STATE.currentUser);
  const canApprove = PENA_STATE.currentUser && 
    approvers.some(m => m.id === PENA_STATE.currentUser) && 
    !hasApproved && p.status === 'pending';
  const progress = Math.min(100, (p.approvals.length / PENA_STATE.threshold) * 100);
  const receipt = PENA_STATE.receipts.find(r => r.proposalId === p.id);
  
  return `
    <div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 card-hover transition-smooth">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs px-2 py-0.5 rounded-full ${p.status === 'executed' ? 'badge-executed' : 'badge-pending'}">${p.status === 'executed' ? 'ejecutada' : 'pendiente'}</span>
            ${p.category ? `<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">${p.category}</span>` : ''}
          </div>
          <p class="font-semibold text-base">${p.payee}</p>
          <p class="text-sm text-gray-500 dark:text-gray-400">${p.purpose}</p>
          <p class="text-2xl font-bold mt-2">${p.amount} <span class="text-sm font-normal text-gray-400">USD₮</span></p>
          ${receipt ? `<div class="mt-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-xs"><span class="text-green-600 dark:text-green-400">📎 Recibo parseado por QVAC VLM:</span> ${receipt.parsed.payee} · ${receipt.parsed.category}</div>` : ''}
        </div>
        ${p.status === 'pending' ? `
          <div class="text-right">
            <p class="text-xs text-gray-400 mb-2">Aprobaciones</p>
            <p class="text-lg font-bold">${p.approvals.length}/${PENA_STATE.threshold}</p>
            <div class="progress-bar mt-2 w-24">
              <div class="progress-bar-fill" style="width: ${progress}%"></div>
            </div>
            ${canApprove ? `<button data-approve="${p.id}" class="mt-3 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-smooth">Aprobar</button>` : ''}
            ${hasApproved && p.status === 'pending' ? `<p class="text-xs text-green-600 dark:text-green-400 mt-2">✓ Ya aprobaste</p>` : ''}
            ${p.approvals.length >= PENA_STATE.threshold && p.status === 'pending' ? `<button data-execute="${p.id}" class="mt-3 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-smooth block w-full">Ejecutar transferencia gasless</button>` : ''}
          </div>
        ` : `
          <div class="text-right">
            <p class="text-xs text-green-600 dark:text-green-400">✓ Ejecutada</p>
            ${PENA_STATE.executions.find(e => e.proposalId === p.id) ? `<p class="text-xs font-mono text-gray-400 mt-1">${PENA_STATE.executions.find(e => e.proposalId === p.id).txHash.substring(0,16)}...</p>` : ''}
          </div>
        `}
      </div>
      ${p.approvals.length > 0 ? `
        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
          ${p.approvals.map(a => {
            const m = PENA_STATE.members.find(m => m.id === a.memberId);
            return `<span class="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800">✋ ${m ? m.name : '?'}</span>`;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ─── BALANCE TAB ────────────────────────────────────────────────

function renderBalanceTab() {
  const totalIn = PENA_STATE.contributions.reduce((s,c) => s+c.amount, 0);
  const totalOut = PENA_STATE.proposals.filter(p => p.status === 'executed').reduce((s,p) => s+p.amount, 0);
  const byCategory = {};
  PENA_STATE.proposals.filter(p => p.status === 'executed').forEach(p => {
    const cat = p.category || 'Otros';
    byCategory[cat] = (byCategory[cat] || 0) + p.amount;
  });
  const byMember = {};
  PENA_STATE.contributions.forEach(c => {
    const m = PENA_STATE.members.find(m => m.id === c.memberId);
    const name = m ? m.name : 'Unknown';
    byMember[name] = (byMember[name] || 0) + c.amount;
  });
  
  return `
    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
          <p class="text-xs text-gray-400">Saldo actual</p>
          <p class="text-3xl font-bold text-green-600 dark:text-green-400">${PENA_STATE.balance}</p>
          <p class="text-xs text-gray-400">USD₮</p>
        </div>
        <div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
          <p class="text-xs text-gray-400">Total entradas</p>
          <p class="text-3xl font-bold text-blue-600 dark:text-blue-400">${totalIn}</p>
          <p class="text-xs text-gray-400">USD₮ · ${PENA_STATE.contributions.length} contribuciones</p>
        </div>
        <div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
          <p class="text-xs text-gray-400">Total salidas</p>
          <p class="text-3xl font-bold text-orange-600 dark:text-orange-400">${totalOut}</p>
          <p class="text-xs text-gray-400">USD₮ · ${PENA_STATE.proposals.filter(p => p.status === 'executed').length} ejecutadas</p>
        </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
          <h4 class="font-semibold mb-3">Gastos por categoría</h4>
          ${Object.keys(byCategory).length === 0 ? '<p class="text-sm text-gray-400">Sin gastos aún</p>' :
            Object.entries(byCategory).sort((a,b) => b[1] - a[1]).map(([cat, amt]) => {
              const pct = (amt / totalOut * 100).toFixed(0);
              return `
                <div class="mb-3">
                  <div class="flex justify-between text-sm mb-1">
                    <span>${cat}</span>
                    <span class="font-medium">${amt} USD₮ (${pct}%)</span>
                  </div>
                  <div class="progress-bar"><div class="progress-bar-fill" style="width: ${pct}%"></div></div>
                </div>
              `;
            }).join('')
          }
        </div>
        
        <div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
          <h4 class="font-semibold mb-3">Contribuciones por miembro</h4>
          ${Object.keys(byMember).length === 0 ? '<p class="text-sm text-gray-400">Sin contribuciones</p>' :
            Object.entries(byMember).sort((a,b) => b[1] - a[1]).map(([name, amt], i) => `
              <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div class="flex items-center gap-2">
                  <span class="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs">${i+1}</span>
                  <span class="text-sm">${name}</span>
                </div>
                <span class="font-medium text-sm">${amt} USD₮</span>
              </div>
            `).join('')
          }
        </div>
      </div>
      
      <div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3">Transacciones on-chain (simuladas)</h4>
        <div class="space-y-2">
          ${PENA_STATE.contributions.slice().reverse().map(c => {
            const m = PENA_STATE.members.find(m => m.id === c.memberId);
            return `
              <div class="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <span class="text-green-600 dark:text-green-400">↑ ${c.amount} USD₮</span>
                <span class="text-gray-400">${m ? m.name : ''}</span>
                <span class="text-gray-400">${c.txHash.substring(0,20)}...</span>
              </div>
            `;
          }).join('')}
          ${PENA_STATE.executions.slice().reverse().map(e => {
            const p = PENA_STATE.proposals.find(p => p.id === e.proposalId);
            return `
              <div class="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <span class="text-blue-600 dark:text-blue-400">↓ ${p ? p.amount : 0} USD₮</span>
                <span class="text-gray-400">${p ? p.payee : ''}</span>
                <span class="text-gray-400">${e.txHash.substring(0,20)}...</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ─── NL QUERY TAB (QVAC) ────────────────────────────────────────

function renderQueryTab() {
  const suggestions = ['saldo', 'transporte', 'tifo', 'quien contribuyó más', 'categorías', 'pendientes'];
  return `
    <div class="space-y-4">
      <div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-lg">🤖</span>
          <h4 class="font-semibold">QVAC — Consulta en lenguaje natural</h4>
        </div>
        <p class="text-xs text-gray-400 mb-4">Procesado on-device por QVAC LLM + RAG sobre el ledger local. Sin servidor, sin API.</p>
        <div class="flex gap-2">
          <input id="nl-input" type="text" placeholder="Ej: ¿cuánto gastamos en autobuses?" value="${nlQueryInput}" class="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
          <button id="btn-nl-query" class="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-smooth">Consultar</button>
        </div>
        <div class="flex gap-2 mt-3 flex-wrap">
          ${suggestions.map(s => `<button data-suggest="${s}" class="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-smooth">${s}</button>`).join('')}
        </div>
      </div>
      ${nlQueryResult ? `
        <div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-lg">📊</span>
            <h4 class="font-semibold">Respuesta de QVAC</h4>
            <span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">on-device ✓</span>
          </div>
          <div class="text-sm whitespace-pre-line">${nlQueryResult}</div>
        </div>
      ` : ''}
    </div>
  `;
}

// ─── P2P SYNC TAB ───────────────────────────────────────────────

function renderP2PTab() {
  return `
    <div class="space-y-4">
      <div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-lg">📡</span>
          <h4 class="font-semibold">P2P Sync — Sin servidor</h4>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          PEÑA usa Autobase + Hyperswarm para sincronizar el ledger entre dispositivos sin servidor.
          En este prototipo, se simula con BroadcastChannel — abre otra pestaña para ver la sincronización en tiempo real.
        </p>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
            <p class="text-xs text-gray-400 mb-2">Tu peer ID</p>
            <p class="font-mono text-sm">${peerId}</p>
          </div>
          <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
            <p class="text-xs text-gray-400 mb-2">Peers conectados</p>
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-green-500 p2p-pulse"></div>
              <p class="font-mono text-sm">${connectedPeers.size} active</p>
            </div>
          </div>
        </div>
        
        <div class="mt-4 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
          <p class="text-sm font-medium text-green-700 dark:text-green-300 mb-2">📋 Cómo probar la sincronización P2P:</p>
          <ol class="text-sm text-green-600 dark:text-green-400 space-y-1 list-decimal list-inside">
            <li>Abre esta página en otra pestaña del navegador</li>
            <li>Verás que el contador de peers sube a 2</li>
            <li>Crea una contribución o propuesta en una pestaña</li>
            <li>Aparecerá instantáneamente en la otra pestaña — sin servidor</li>
          </ol>
        </div>
        
        <div class="mt-4">
          <p class="text-xs text-gray-400 mb-2">Peers conectados:</p>
          <div class="space-y-1">
            ${Array.from(connectedPeers).map(pid => `
              <div class="flex items-center gap-2 text-xs font-mono p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div class="w-2 h-2 rounded-full ${pid === peerId ? 'bg-blue-500' : 'bg-green-500'} p2p-pulse"></div>
                <span>${pid}</span>
                ${pid === peerId ? '<span class="text-gray-400">(tú)</span>' : '<span class="text-green-600 dark:text-green-400">conectado</span>'}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3">Stack técnico real (producción)</h4>
        <div class="space-y-2 text-sm">
          <div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <span class="text-lg">🔗</span>
            <div><strong>Autobase</strong> — multi-writer append-only event log</div>
          </div>
          <div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <span class="text-lg">🐝</span>
            <div><strong>Hyperswarm</strong> — P2P discovery by invite-code</div>
          </div>
          <div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <span class="text-lg">📦</span>
            <div><strong>Hypercore</strong> — tamper-evident history</div>
          </div>
          <div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <span class="text-lg">👛</span>
            <div><strong>WDK</strong> — ERC-4337 smart account, gasless USD₮</div>
          </div>
          <div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <span class="text-lg">🤖</span>
            <div><strong>QVAC</strong> — on-device VLM + LLM, sin API</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── FOOTER ─────────────────────────────────────────────────────

function renderFooter() {
  return `
    <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-center">
      <p class="text-xs text-gray-400">
        PEÑA — Transparent Self-Custody Treasury · WDK + Pears + QVAC · Tether Developers Cup 2026
      </p>
      <p class="text-xs text-gray-400 mt-1">
        <a href="https://github.com/anna-stolbovskaja/PENA" target="_blank" class="hover:text-green-500 transition-smooth">github.com/anna-stolbovskaja/PENA</a>
      </p>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  const colors = {
    info: 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900',
    success: 'bg-green-600 text-white',
    p2p: 'bg-blue-600 text-white',
    error: 'bg-red-600 text-white',
  };
  toast.className = `slide-in fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${colors[type] || colors.info}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

function attachEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      showContribute = false;
      showProposal = false;
      render();
    });
  });

  // Contribute
  const btnContrib = document.getElementById('btn-contribute');
  if (btnContrib) btnContrib.addEventListener('click', () => { showContribute = !showContribute; showProposal = false; render(); });
  
  const btnContribSubmit = document.getElementById('btn-contrib-submit');
  if (btnContribSubmit) btnContribSubmit.addEventListener('click', () => {
    const amount = parseInt(document.getElementById('contrib-amount').value);
    if (!amount || amount <= 0) { showToast('Cantidad inválida', 'error'); return; }
    const event = { type: EventType.CONTRIBUTION, data: { memberId: PENA_STATE.currentUser, amount, txHash: mockTxHash(), ts: Date.now() } };
    broadcastEvent(event);
    showContribute = false;
    showToast(`✓ ${amount} USD₮ contribuidos (gasless)`, 'success');
  });
  
  const btnContribCancel = document.getElementById('btn-contrib-cancel');
  if (btnContribCancel) btnContribCancel.addEventListener('click', () => { showContribute = false; render(); });

  // Propose
  const btnPropose = document.getElementById('btn-propose');
  if (btnPropose) btnPropose.addEventListener('click', () => { showProposal = !showProposal; showContribute = false; render(); });
  
  const btnPropSubmit = document.getElementById('btn-prop-submit');
  if (btnPropSubmit) btnPropSubmit.addEventListener('click', () => {
    const payee = document.getElementById('prop-payee').value.trim();
    const amount = parseInt(document.getElementById('prop-amount').value);
    const purpose = document.getElementById('prop-purpose').value.trim();
    if (!payee || !amount || !purpose) { showToast('Completa todos los campos', 'error'); return; }
    const id = 'p' + Date.now();
    const data = { id, payee, amount, currency: 'USDt', purpose, createdBy: PENA_STATE.currentUser, ts: Date.now() };
    if (proposalReceiptParsed) data.category = proposalReceiptParsed.category;
    const event = { type: EventType.PROPOSAL_CREATE, data };
    broadcastEvent(event);
    if (proposalReceiptParsed) {
      broadcastEvent({ type: EventType.RECEIPT_PARSE, data: { proposalId: id, parsed: proposalReceiptParsed } });
    }
    showProposal = false;
    proposalReceiptParsed = null;
    showToast('✓ Propuesta creada y replicada via P2P', 'success');
  });
  
  const btnPropCancel = document.getElementById('btn-prop-cancel');
  if (btnPropCancel) btnPropCancel.addEventListener('click', () => { showProposal = false; proposalReceiptParsed = null; render(); });

  // Receipt upload (QVAC VLM simulation)
  const receiptUpload = document.getElementById('receipt-upload');
  if (receiptUpload) receiptUpload.addEventListener('click', () => {
    proposalReceiptParsed = parseReceiptMock();
    // Auto-fill form fields
    document.getElementById('prop-payee').value = proposalReceiptParsed.payee;
    document.getElementById('prop-amount').value = proposalReceiptParsed.amount;
    document.getElementById('prop-purpose').value = `Compra en ${proposalReceiptParsed.payee}`;
    render();
    showToast(`📎 QVAC VLM: recibo parseado → ${proposalReceiptParsed.payee} · ${proposalReceiptParsed.amount} USD₮`, 'success');
  });

  // Approve proposal
  document.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', () => {
      const proposalId = btn.dataset.approve;
      const event = { type: EventType.PROPOSAL_APPROVE, data: { proposalId, memberId: PENA_STATE.currentUser, sig: 'sig_' + Date.now(), ts: Date.now() } };
      broadcastEvent(event);
      showToast('✓ Aprobación firmada y propagada', 'success');
    });
  });

  // Execute proposal
  document.querySelectorAll('[data-execute]').forEach(btn => {
    btn.addEventListener('click', () => {
      const proposalId = btn.dataset.execute;
      const event = { type: EventType.PROPOSAL_EXECUTE, data: { proposalId, txHash: mockTxHash(), ts: Date.now() } };
      broadcastEvent(event);
      showToast('✓ Transferencia gasless ejecutada on-chain', 'success');
    });
  });

  // NL Query
  const btnNLQuery = document.getElementById('btn-nl-query');
  if (btnNLQuery) btnNLQuery.addEventListener('click', () => {
    const input = document.getElementById('nl-input');
    nlQueryInput = input.value.trim();
    if (!nlQueryInput) return;
    nlQueryResult = nlQueryMock(nlQueryInput);
    render();
  });
  
  const nlInput = document.getElementById('nl-input');
  if (nlInput) nlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      nlQueryInput = nlInput.value.trim();
      if (!nlQueryInput) return;
      nlQueryResult = nlQueryMock(nlQueryInput);
      render();
    }
  });

  // Suggestion chips
  document.querySelectorAll('[data-suggest]').forEach(btn => {
    btn.addEventListener('click', () => {
      nlQueryInput = btn.dataset.suggest;
      nlQueryResult = nlQueryMock(nlQueryInput);
      render();
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

render();
