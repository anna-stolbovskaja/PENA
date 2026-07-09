// PEÑA — Application logic
// Wires together: ledger.js (state), p2p.js (sync), wdk.js (wallet), qvac.js (OCR + NL)

import { EVENT_TYPES, createEvent, initialState, applyEvent, rebuildState, isApproved, getCategorySummary, getMemberContributions, escapeHtml } from './lib/ledger.js';
import { P2PNode } from './lib/p2p.js';
import { generateWallet, signMessage, signTransferAuthorization, createSmartAccount, verifySignature, checkThreshold, simulateTxHash, shortenHash } from './lib/wdk.js';
import { parseReceipt, queryLedger, initOCR } from './lib/qvac.js';

// ═══════════════════════════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════════════════════════

const state = {
  ...initialState(),
  threshold: 2,
  groupName: 'Peña Atlético Sur',
  currentUser: null,
  wallet: null, // { address, privateKey }
  smartAccount: null,
  events: [],
  p2p: null,
  peers: [],
  activeTab: 'feed',
  showContribute: false,
  showProposal: false,
  proposalReceipt: null,
  ocrLoading: false,
  nlInput: '',
  nlResult: '',
  toast: null,
  rtcOffer: '',
  rtcAnswer: '',
  showRTC: false,
};

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

function init() {
  // Load or create wallet
  const savedWallet = localStorage.getItem('pena_wallet');
  if (savedWallet) {
    try {
      state.wallet = JSON.parse(savedWallet);
    } catch {
      state.wallet = generateWallet();
      localStorage.setItem('pena_wallet', JSON.stringify(state.wallet));
    }
  } else {
    state.wallet = generateWallet();
    localStorage.setItem('pena_wallet', JSON.stringify(state.wallet));
  }

  // Create smart account
  state.smartAccount = createSmartAccount(state.threshold, [{ address: state.wallet.address }]);

  // Init P2P
  state.p2p = new P2PNode();
  state.p2p.getStateSnapshot = () => ({
    members: state.members,
    contributions: state.contributions,
    proposals: state.proposals,
    executions: state.executions,
    receipts: state.receipts,
    balance: state.balance,
    threshold: state.threshold,
    groupName: state.groupName,
  });

  state.p2p.onEvent((msg) => {
    if (msg.type === 'event') {
      state.events.push(msg.event);
      applyEvent(state, msg.event);
      render();
      showToast('Sincronizado via P2P', 'p2p');
    } else if (msg.type === 'state:sync') {
      if (state.members.length === 0 && msg.state) {
        state.members = msg.state.members || [];
        state.contributions = msg.state.contributions || [];
        state.proposals = msg.state.proposals || [];
        state.executions = msg.state.executions || [];
        state.receipts = msg.state.receipts || [];
        state.balance = msg.state.balance || 0;
        state.threshold = msg.state.threshold || 2;
        state.groupName = msg.state.groupName || 'Peña Atlético Sur';
        render();
      }
    }
  });

  state.p2p.onPeerChange((peers) => {
    state.peers = peers;
    render();
  });

  // Seed data on first run
  seedData();
  render();
}

function seedData() {
  if (state.members.length > 0) return;

  const members = [
    { id: 'm1', name: 'Carlos Mendoza', role: 'founder', walletAddr: generateWallet().address },
    { id: 'm2', name: 'Ana Stolbovskaja', role: 'approver', walletAddr: state.wallet.address },
    { id: 'm3', name: 'Diego Ramírez', role: 'approver', walletAddr: generateWallet().address },
    { id: 'm4', name: 'Lucía Fernández', role: 'member', walletAddr: generateWallet().address },
  ];

  for (const m of members) {
    const ev = createEvent(EVENT_TYPES.MEMBER_JOIN, m, state.wallet);
    state.events.push(ev);
    applyEvent(state, ev);
  }

  state.currentUser = 'm2';

  // Seed contributions
  const contribs = [
    { memberId: 'm1', amount: 500, ts: Date.now() - 86400000 * 7 },
    { memberId: 'm2', amount: 300, ts: Date.now() - 86400000 * 6 },
    { memberId: 'm3', amount: 200, ts: Date.now() - 86400000 * 5 },
    { memberId: 'm4', amount: 150, ts: Date.now() - 86400000 * 4 },
  ];
  for (const c of contribs) {
    const ev = createEvent(EVENT_TYPES.CONTRIBUTION, { ...c, txHash: simulateTxHash() }, state.wallet);
    state.events.push(ev);
    applyEvent(state, ev);
  }

  // Seed executed proposals
  const p1 = { id: 'p1', payee: 'Autobuses Ruta Sur', amount: 450, currency: 'USDt', purpose: 'Alquiler de 2 autobuses para viaje a Capital', category: 'Transporte', createdBy: 'm1', ts: Date.now() - 86400000 * 3 };
  const evP1 = createEvent(EVENT_TYPES.PROPOSAL_CREATE, p1, state.wallet);
  state.events.push(evP1);
  applyEvent(state, evP1);
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm1', sig: '0xsig1', ts: Date.now() - 86400000 * 3 + 3600000 }, state.wallet));
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm2', sig: '0xsig2', ts: Date.now() - 86400000 * 3 + 7200000 }, state.wallet));
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: simulateTxHash(), ts: Date.now() - 86400000 * 3 + 10800000 }, state.wallet));

  const p2 = { id: 'p2', payee: 'Imprenta La Prensa', amount: 320, currency: 'USDt', purpose: 'Tifo: banderas y pancartas para el clásico', category: 'Tifo', createdBy: 'm2', ts: Date.now() - 86400000 * 2 };
  const evP2 = createEvent(EVENT_TYPES.PROPOSAL_CREATE, p2, state.wallet);
  state.events.push(evP2);
  applyEvent(state, evP2);
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p2', memberId: 'm2', sig: '0xsig3', ts: Date.now() - 86400000 * 2 + 3600000 }, state.wallet));
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p2', memberId: 'm3', sig: '0xsig4', ts: Date.now() - 86400000 * 2 + 7200000 }, state.wallet));
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p2', txHash: simulateTxHash(), ts: Date.now() - 86400000 * 2 + 10800000 }, state.wallet));

  // Pending proposal
  const p3 = { id: 'p3', payee: 'Ferretería El Tornillo', amount: 180, currency: 'USDt', purpose: 'Materiales para gradería temporal', category: 'Equipos', createdBy: 'm3', ts: Date.now() - 3600000 };
  const evP3 = createEvent(EVENT_TYPES.PROPOSAL_CREATE, p3, state.wallet);
  state.events.push(evP3);
  applyEvent(state, evP3);
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p3', memberId: 'm3', sig: '0xsig5', ts: Date.now() - 3000000 }, state.wallet));
}

// ═══════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════

function emitEvent(event) {
  state.events.push(event);
  applyEvent(state, event);
  state.p2p.broadcast({ type: 'event:broadcast', from: state.p2p.peerId, event });
  render();
}

async function doContribute(amount) {
  if (!amount || amount <= 0) {
    showToast('Cantidad inválida', 'error');
    return;
  }
  try {
    // Sign EIP-3009 transfer authorization
    const auth = await signTransferAuthorization(state.wallet.privateKey, {
      to: state.smartAccount.address,
      amount: amount,
    });
    if (!auth) {
      showToast('Error firmando transferencia', 'error');
      return;
    }
    const event = createEvent(EVENT_TYPES.CONTRIBUTION, {
      memberId: state.currentUser,
      amount: amount,
      txHash: simulateTxHash(),
      authSignature: auth.signature,
      authNonce: auth.nonce,
      ts: Date.now(),
    }, state.wallet);
    emitEvent(event);
    state.showContribute = false;
    showToast(`${amount} USD₮ contribuidos (gasless)`, 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function doCreateProposal(payee, amount, purpose, category) {
  if (!payee || !amount || amount <= 0 || !purpose) {
    showToast('Completa todos los campos', 'error');
    return;
  }
  const id = 'p' + Date.now();
  const event = createEvent(EVENT_TYPES.PROPOSAL_CREATE, {
    id, payee, amount: Number(amount), currency: 'USDt',
    purpose, category: category || 'Otros',
    createdBy: state.currentUser, ts: Date.now(),
  }, state.wallet);
  emitEvent(event);

  if (state.proposalReceipt) {
    const receiptEvent = createEvent(EVENT_TYPES.RECEIPT_PARSE, {
      proposalId: id, parsed: state.proposalReceipt,
    }, state.wallet);
    emitEvent(receiptEvent);
  }

  state.showProposal = false;
  state.proposalReceipt = null;
  showToast('Propuesta creada y replicada', 'success');
}

async function doApprove(proposalId) {
  try {
    const proposal = state.proposals.find(p => p.id === proposalId);
    if (!proposal) return;
    const msg = `approve:${proposalId}:${state.currentUser}`;
    const sig = await signMessage(state.wallet.privateKey, msg);
    if (!sig) {
      showToast('Error firmando aprobación', 'error');
      return;
    }
    const event = createEvent(EVENT_TYPES.PROPOSAL_APPROVE, {
      proposalId, memberId: state.currentUser, sig, ts: Date.now(),
    }, state.wallet);
    emitEvent(event);
    showToast('Aprobación firmada', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function doExecute(proposalId) {
  try {
    const proposal = state.proposals.find(p => p.id === proposalId);
    if (!proposal || !checkThreshold(proposal, state.threshold)) {
      showToast('Faltan aprobaciones', 'error');
      return;
    }
    // Sign the execution transfer
    const auth = await signTransferAuthorization(state.wallet.privateKey, {
      to: proposal.payee,
      amount: proposal.amount,
    });
    const event = createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, {
      proposalId, txHash: simulateTxHash(),
      authSignature: auth ? auth.signature : null,
      ts: Date.now(),
    }, state.wallet);
    emitEvent(event);
    showToast('Transferencia gasless ejecutada', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function doParseReceipt(file) {
  state.ocrLoading = true;
  render();
  try {
    const url = URL.createObjectURL(file);
    const result = await parseReceipt(url);
    URL.revokeObjectURL(url);
    state.proposalReceipt = result;
    state.ocrLoading = false;
    if (result.error) {
      showToast('OCR: ' + result.error, 'error');
    } else {
      showToast(`Recibo: ${result.payee} · ${result.amount} USD₮ · ${result.category}`, 'success');
    }
    render();
    return result;
  } catch (err) {
    state.ocrLoading = false;
    showToast('OCR error: ' + err.message, 'error');
    render();
    return null;
  }
}

function doNLQuery(query) {
  try {
    state.nlInput = query;
    state.nlResult = queryLedger(state, query);
    render();
  } catch (err) {
    state.nlResult = 'Error: ' + err.message;
    render();
  }
}

function showToast(msg, type = 'info') {
  state.toast = { msg, type, ts: Date.now() };
  render();
  setTimeout(() => {
    if (state.toast && Date.now() - state.toast.ts >= 2500) {
      state.toast = null;
      render();
    }
  }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════

function render() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = layout();
  bindEvents();
}

function layout() {
  return `
    <div class="max-w-5xl mx-auto px-4 py-6">
      ${renderHeader()}
      ${renderTabs()}
      <div class="mt-6">${renderTab()}</div>
      ${renderFooter()}
      ${renderToast()}
    </div>
  `;
}

function renderHeader() {
  const totalIn = state.contributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalOut = state.proposals.filter(p => p.status === 'executed').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return `
    <div class="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center text-white font-bold text-lg">P</div>
          <div>
            <h1 class="text-xl font-bold">PEÑA</h1>
            <p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(state.groupName)}</p>
          </div>
        </div>
        <div class="flex items-center gap-6">
          <div class="text-right">
            <p class="text-xs text-gray-500 dark:text-gray-400">Saldo</p>
            <p class="text-2xl font-bold text-green-600 dark:text-green-400">${state.balance} <span class="text-sm">USD₮</span></p>
          </div>
          <div class="text-right">
            <p class="text-xs text-gray-500 dark:text-gray-400">Miembros</p>
            <p class="text-2xl font-bold">${state.members.length}</p>
          </div>
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950">
            <div class="w-2 h-2 rounded-full bg-green-500 p2p-pulse"></div>
            <span class="text-xs font-medium text-green-700 dark:text-green-300">${state.peers.length} peer${state.peers.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
      <div class="mt-4 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>↑ ${totalIn} USD₮</span>
        <span>↓ ${totalOut} USD₮</span>
        <span>M-of-N: ${state.threshold}-of-${state.members.filter(m => m.role !== 'member').length}</span>
        <span class="font-mono">${shortenHash(state.wallet?.address || '', 8, 6)}</span>
      </div>
    </div>
  `;
}

function renderTabs() {
  const tabs = [
    { id: 'feed', label: 'Audit', icon: '📋' },
    { id: 'proposals', label: 'Propuestas', icon: '✋' },
    { id: 'balance', label: 'Balance', icon: '💰' },
    { id: 'query', label: 'Consulta NL', icon: '🤖' },
    { id: 'p2p', label: 'P2P', icon: '📡' },
  ];
  return `
    <div class="flex gap-1 mt-4 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
      ${tabs.map(t => `
        <button data-tab="${t.id}" class="tab-btn px-4 py-2.5 font-medium text-sm whitespace-nowrap transition-smooth ${state.activeTab === t.id ? 'tab-active' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}">
          ${t.icon} ${t.label}
        </button>
      `).join('')}
    </div>
  `;
}

function renderTab() {
  switch (state.activeTab) {
    case 'feed': return renderFeed();
    case 'proposals': return renderProposals();
    case 'balance': return renderBalance();
    case 'query': return renderQuery();
    case 'p2p': return renderP2P();
    default: return renderFeed();
  }
}

// ─── FEED ──────────────────────────────────────────────────────

function renderFeed() {
  const events = [];
  state.members.forEach(m => events.push({ ts: m.ts || Date.now(), type: 'member', data: m }));
  state.contributions.forEach(c => events.push({ ts: c.ts, type: 'contribution', data: c }));
  state.proposals.forEach(p => {
    events.push({ ts: p.ts, type: 'proposal', data: p });
    p.approvals.forEach(a => events.push({ ts: a.ts, type: 'approval', data: a, proposal: p }));
  });
  state.executions.forEach(e => {
    const p = state.proposals.find(p => p.id === e.proposalId);
    events.push({ ts: e.ts, type: 'execution', data: e, proposal: p });
  });
  events.sort((a, b) => b.ts - a.ts);

  return `
    <div class="space-y-3">
      <div class="flex gap-2">
        <button id="btn-contribute" class="flex-1 py-2.5 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-smooth">+ Contribuir</button>
        <button id="btn-propose" class="flex-1 py-2.5 px-4 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium text-sm transition-smooth">+ Propuesta</button>
      </div>
      ${state.showContribute ? contributeForm() : ''}
      ${state.showProposal ? proposalForm() : ''}
      <div class="mt-4">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">LÁMINA DE AUDITORÍA</h3>
        <div class="space-y-2">
          ${events.length === 0 ? '<p class="text-center text-gray-400 py-8">Sin actividad</p>' : events.slice(0, 50).map(feedItem).join('')}
        </div>
      </div>
    </div>
  `;
}

function feedItem(e) {
  const time = new Date(e.ts).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const member = (id) => state.members.find(m => m.id === id);
  if (e.type === 'member') return `<div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800"><div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-sm">👤</div><div class="flex-1"><p class="text-sm font-medium">${escapeHtml(e.data.name)} se unió</p><p class="text-xs text-gray-400">${escapeHtml(e.data.role)} · ${time}</p></div></div>`;
  if (e.type === 'contribution') { const m = member(e.data.memberId); return `<div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900"><div class="w-8 h-8 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center text-sm">↑</div><div class="flex-1"><p class="text-sm font-medium">${escapeHtml(m ? m.name : '?')} contribuyó <span class="text-green-600 dark:text-green-400 font-bold">${e.data.amount} USD₮</span></p><p class="text-xs text-gray-400 font-mono">${shortenHash(e.data.txHash)} · ${time}</p></div><span class="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">on-chain ✓</span></div>`; }
  if (e.type === 'proposal') { const m = member(e.data.createdBy); return `<div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-100 dark:border-yellow-900"><div class="w-8 h-8 rounded-full bg-yellow-200 dark:bg-yellow-800 flex items-center justify-center text-sm">📋</div><div class="flex-1"><p class="text-sm font-medium">${escapeHtml(m ? m.name : '?')} propuso <span class="font-bold">${e.data.amount} USD₮</span> → ${escapeHtml(e.data.payee)}</p><p class="text-xs text-gray-400">${escapeHtml(e.data.purpose)} · ${time}</p></div><span class="text-xs px-2 py-1 rounded-full ${e.data.status === 'executed' ? 'badge-executed' : 'badge-pending'}">${e.data.status === 'executed' ? 'ejecutada' : 'pendiente'}</span></div>`; }
  if (e.type === 'approval') { const m = member(e.data.memberId); return `<div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800"><div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm">✋</div><div class="flex-1"><p class="text-sm">${escapeHtml(m ? m.name : '?')} aprobó: ${escapeHtml(e.proposal ? e.proposal.payee : '')}</p><p class="text-xs text-gray-400 font-mono">${shortenHash(e.data.sig || '', 8, 6)} · ${time}</p></div></div>`; }
  if (e.type === 'execution') { return `<div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900"><div class="w-8 h-8 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center text-sm">↓</div><div class="flex-1"><p class="text-sm font-medium">Ejecutado: <span class="font-bold">${e.proposal ? e.proposal.amount : 0} USD₮</span> → ${escapeHtml(e.proposal ? e.proposal.payee : '')}</p><p class="text-xs text-gray-400 font-mono">${shortenHash(e.data.txHash)} · gasless ✓ · ${time}</p></div><span class="text-xs px-2 py-1 rounded-full badge-executed">on-chain ✓</span></div>`; }
  return '';
}

function contributeForm() {
  return `<div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 mt-2"><h4 class="font-semibold mb-3">Contribuir al tesoro</h4><div class="flex gap-2"><input id="contrib-amount" type="number" placeholder="USD₮" class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500"><button id="btn-contrib-ok" class="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm">Enviar</button><button id="btn-contrib-cancel" class="px-4 py-2 rounded-lg text-gray-500 text-sm">Cancelar</button></div><p class="text-xs text-gray-400 mt-2">WDK ERC-4337 · EIP-3009 transferWithAuthorization · gasless</p></div>`;
}

function proposalForm() {
  return `<div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 mt-2"><h4 class="font-semibold mb-3">Nueva propuesta de gasto</h4><div class="space-y-3"><input id="prop-payee" type="text" placeholder="Beneficiario" value="${escapeHtml(state.proposalReceipt?.payee || '')}" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500"><input id="prop-amount" type="number" placeholder="USD₮" value="${state.proposalReceipt?.amount || ''}" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500"><input id="prop-purpose" type="text" placeholder="Concepto" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500"><div class="receipt-drop rounded-lg p-4 text-center cursor-pointer" id="receipt-upload">${state.ocrLoading ? '<p class="text-sm text-blue-500">Procesando con OCR...</p>' : state.proposalReceipt ? `<div class="text-left"><p class="text-xs text-green-600 dark:text-green-400 font-medium mb-1">✓ QVAC OCR:</p><p class="text-sm">${escapeHtml(state.proposalReceipt.payee)} · ${state.proposalReceipt.amount} USD₮ · ${escapeHtml(state.proposalReceipt.category)}</p></div>` : '<p class="text-sm text-gray-400">📷 Adjuntar recibo → OCR local</p>'}</div><div class="flex gap-2"><button id="btn-prop-ok" class="flex-1 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium text-sm">Crear</button><button id="btn-prop-cancel" class="px-4 py-2 rounded-lg text-gray-500 text-sm">Cancelar</button></div></div></div>`;
}

// ─── PROPOSALS ─────────────────────────────────────────────────

function renderProposals() {
  const pending = state.proposals.filter(p => p.status === 'pending');
  const executed = state.proposals.filter(p => p.status === 'executed');
  return `<div class="space-y-4"><div><h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">PENDIENTES — ${state.threshold} APROBACIONES</h3><div class="space-y-3">${pending.length === 0 ? '<p class="text-center text-gray-400 py-8">Sin propuestas pendientes</p>' : pending.map(proposalCard).join('')}</div></div>${executed.length > 0 ? `<div><h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 mt-6">EJECUTADAS</h3><div class="space-y-3">${executed.map(proposalCard).join('')}</div></div>` : ''}</div>`;
}

function proposalCard(p) {
  const hasApproved = p.approvals.some(a => a.memberId === state.currentUser);
  const canApprove = state.currentUser && !hasApproved && p.status === 'pending';
  const canExecute = p.status === 'pending' && checkThreshold(p, state.threshold);
  const progress = Math.min(100, (p.approvals.length / state.threshold) * 100);
  const receipt = state.receipts.find(r => r.proposalId === p.id);
  return `<div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 card-hover transition-smooth"><div class="flex items-start justify-between gap-4"><div class="flex-1"><div class="flex items-center gap-2 mb-1"><span class="text-xs px-2 py-0.5 rounded-full ${p.status === 'executed' ? 'badge-executed' : 'badge-pending'}">${p.status === 'executed' ? 'ejecutada' : 'pendiente'}</span>${p.category ? `<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">${escapeHtml(p.category)}</span>` : ''}</div><p class="font-semibold text-base">${escapeHtml(p.payee)}</p><p class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(p.purpose)}</p><p class="text-2xl font-bold mt-2">${p.amount} <span class="text-sm font-normal text-gray-400">USD₮</span></p>${receipt ? `<div class="mt-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-xs"><span class="text-green-600 dark:text-green-400">📎 OCR:</span> ${escapeHtml(receipt.parsed.payee)} · ${escapeHtml(receipt.parsed.category)}</div>` : ''}</div><div class="text-right">${p.status === 'pending' ? `<p class="text-xs text-gray-400 mb-2">Aprobaciones</p><p class="text-lg font-bold">${p.approvals.length}/${state.threshold}</p><div class="progress-bar mt-2 w-24"><div class="progress-bar-fill" style="width:${progress}%"></div></div>${canApprove ? `<button data-approve="${p.id}" class="mt-3 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium">Aprobar</button>` : ''}${hasApproved ? '<p class="text-xs text-green-600 dark:text-green-400 mt-2">✓ Aprobaste</p>' : ''}${canExecute ? `<button data-execute="${p.id}" class="mt-3 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium block w-full">Ejecutar gasless</button>` : ''}` : `<p class="text-xs text-green-600 dark:text-green-400">✓ Ejecutada</p>${state.executions.find(e => e.proposalId === p.id) ? `<p class="text-xs font-mono text-gray-400 mt-1">${shortenHash(state.executions.find(e => e.proposalId === p.id).txHash)}</p>` : ''}`}</div></div>${p.approvals.length > 0 ? `<div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">${p.approvals.map(a => { const m = state.members.find(m => m.id === a.memberId); return `<span class="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800">✋ ${escapeHtml(m ? m.name : '?')}</span>`; }).join('')}</div>` : ''}</div>`;
}

// ─── BALANCE ───────────────────────────────────────────────────

function renderBalance() {
  const totalIn = state.contributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalOut = state.proposals.filter(p => p.status === 'executed').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const cats = getCategorySummary(state);
  const byM = getMemberContributions(state);
  return `<div class="space-y-4"><div class="grid grid-cols-1 sm:grid-cols-3 gap-4"><div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800"><p class="text-xs text-gray-400">Saldo</p><p class="text-3xl font-bold text-green-600 dark:text-green-400">${state.balance}</p><p class="text-xs text-gray-400">USD₮</p></div><div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800"><p class="text-xs text-gray-400">Entradas</p><p class="text-3xl font-bold text-blue-600 dark:text-blue-400">${totalIn}</p><p class="text-xs text-gray-400">${state.contributions.length} contribuciones</p></div><div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800"><p class="text-xs text-gray-400">Salidas</p><p class="text-3xl font-bold text-orange-600 dark:text-orange-400">${totalOut}</p><p class="text-xs text-gray-400">${state.proposals.filter(p => p.status === 'executed').length} ejecutadas</p></div></div><div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800"><h4 class="font-semibold mb-3">Gastos por categoría</h4>${Object.keys(cats).length === 0 ? '<p class="text-sm text-gray-400">Sin gastos</p>' : Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => { const pct = totalOut > 0 ? (amt / totalOut * 100).toFixed(0) : 0; return `<div class="mb-3"><div class="flex justify-between text-sm mb-1"><span>${cat}</span><span class="font-medium">${amt} USD₮ (${pct}%)</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div></div>`; }).join('')}</div><div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800"><h4 class="font-semibold mb-3">Contribuciones</h4>${Object.keys(byM).length === 0 ? '<p class="text-sm text-gray-400">Sin contribuciones</p>' : Object.entries(byM).sort((a, b) => b[1] - a[1]).map(([name, amt], i) => `<div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"><div class="flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs">${i + 1}</span><span class="text-sm">${escapeHtml(name)}</span></div><span class="font-medium text-sm">${amt} USD₮</span></div>`).join('')}</div></div><div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800"><h4 class="font-semibold mb-3">Transacciones on-chain</h4><div class="space-y-2">${state.contributions.slice().reverse().map(c => { const m = state.members.find(m => m.id === c.memberId); return `<div class="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-gray-50 dark:bg-gray-800"><span class="text-green-600 dark:text-green-400">↑ ${c.amount} USD₮</span><span class="text-gray-400">${escapeHtml(m ? m.name : '')}</span><span class="text-gray-400">${shortenHash(c.txHash)}</span></div>`; }).join('')}${state.executions.slice().reverse().map(e => { const p = state.proposals.find(p => p.id === e.proposalId); return `<div class="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-gray-50 dark:bg-gray-800"><span class="text-blue-600 dark:text-blue-400">↓ ${p ? p.amount : 0} USD₮</span><span class="text-gray-400">${escapeHtml(p ? p.payee : '')}</span><span class="text-gray-400">${shortenHash(e.txHash)}</span></div>`; }).join('')}</div></div></div>`;
}

// ─── NL QUERY ──────────────────────────────────────────────────

function renderQuery() {
  const suggestions = ['saldo', 'transporte', 'tifo', 'quien contribuyó más', 'categorías', 'pendientes', 'último'];
  return `<div class="space-y-4"><div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800"><div class="flex items-center gap-2 mb-3"><span class="text-lg">🤖</span><h4 class="font-semibold">Consulta en lenguaje natural</h4></div><p class="text-xs text-gray-400 mb-4">Procesado localmente — sin servidor, sin API</p><div class="flex gap-2"><input id="nl-input" type="text" placeholder="Ej: ¿cuánto en autobuses?" value="${escapeHtml(state.nlInput)}" class="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500"><button id="btn-nl" class="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-sm">Consultar</button></div><div class="flex gap-2 mt-3 flex-wrap">${suggestions.map(s => `<button data-suggest="${s}" class="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700">${s}</button>`).join('')}</div></div>${state.nlResult ? `<div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800"><div class="flex items-center gap-2 mb-2"><span class="text-lg">📊</span><h4 class="font-semibold">Respuesta</h4><span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">local ✓</span></div><div class="text-sm whitespace-pre-line">${escapeHtml(state.nlResult)}</div></div>` : ''}</div>`;
}

// ─── P2P ───────────────────────────────────────────────────────

function renderP2P() {
  return `<div class="space-y-4"><div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800"><div class="flex items-center gap-2 mb-3"><span class="text-lg">📡</span><h4 class="font-semibold">Sincronización P2P</h4></div><p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Sincronización entre pestañas via BroadcastChannel. Para conectar otro dispositivo, usa WebRTC con signaling manual (copiar/pegar offer/answer).</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-4"><div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400 mb-2">Tu peer ID</p><p class="font-mono text-sm">${escapeHtml(state.p2p?.peerId || '—')}</p></div><div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400 mb-2">Peers conectados</p><div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-green-500 p2p-pulse"></div><p class="font-mono text-sm">${state.peers.length} activos</p></div></div></div><div class="mt-4 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900"><p class="text-sm font-medium text-green-700 dark:text-green-300 mb-2">Probar sincronización:</p><ol class="text-sm text-green-600 dark:text-green-400 space-y-1 list-decimal list-inside"><li>Abre esta página en otra pestaña</li><li>El contador de peers sube a 2</li><li>Crea una contribución en una pestaña</li><li>Aparece instantáneamente en la otra — sin servidor</li></ol></div><div class="mt-4"><p class="text-xs text-gray-400 mb-2">Peers:</p><div class="space-y-1">${state.peers.map(pid => `<div class="flex items-center gap-2 text-xs font-mono p-2 rounded-lg bg-gray-50 dark:bg-gray-800"><div class="w-2 h-2 rounded-full ${pid === state.p2p?.peerId ? 'bg-blue-500' : 'bg-green-500'} p2p-pulse"></div><span>${escapeHtml(pid)}</span>${pid === state.p2p?.peerId ? '<span class="text-gray-400">(tú)</span>' : '<span class="text-green-600 dark:text-green-400">conectado</span>'}</div>`).join('')}</div></div></div><div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800"><h4 class="font-semibold mb-3">WebRTC — Conexión entre dispositivos</h4><div class="space-y-3"><button id="btn-rtc-offer" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">Generar Offer</button>${state.rtcOffer ? `<div><p class="text-xs text-gray-400 mb-1">Copia este Offer y pégalo en el otro dispositivo:</p><textarea readonly class="w-full h-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-mono">${escapeHtml(state.rtcOffer)}</textarea></div>` : ''}<div><p class="text-xs text-gray-400 mb-1">Pega el Answer del otro dispositivo:</p><textarea id="rtc-answer-input" class="w-full h-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-mono" placeholder="SDP answer..."></textarea><button id="btn-rtc-connect" class="mt-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium">Conectar</button></div></div></div></div>`;
}

// ─── FOOTER + TOAST ────────────────────────────────────────────

function renderFooter() {
  return `<div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-center"><p class="text-xs text-gray-400">PEÑA — Transparent Self-Custody Treasury · WDK + Pears + QVAC</p><p class="text-xs text-gray-400 mt-1"><a href="https://github.com/anna-stolbovskaja/PENA" target="_blank" class="hover:text-green-500">github.com/anna-stolbovskaja/PENA</a></p></div>`;
}

function renderToast() {
  if (!state.toast) return '';
  const colors = { info: 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900', success: 'bg-green-600 text-white', p2p: 'bg-blue-600 text-white', error: 'bg-red-600 text-white' };
  return `<div class="slide-in fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${colors[state.toast.type] || colors.info}">${escapeHtml(state.toast.msg)}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// EVENT BINDING
// ═══════════════════════════════════════════════════════════════

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => { state.activeTab = btn.dataset.tab; state.showContribute = false; state.showProposal = false; render(); });
  });

  const bc = document.getElementById('btn-contribute');
  if (bc) bc.addEventListener('click', () => { state.showContribute = !state.showContribute; state.showProposal = false; render(); });
  const bcOk = document.getElementById('btn-contrib-ok');
  if (bcOk) bcOk.addEventListener('click', () => { const v = parseInt(document.getElementById('contrib-amount').value, 10); doContribute(v); });
  const bcCancel = document.getElementById('btn-contrib-cancel');
  if (bcCancel) bcCancel.addEventListener('click', () => { state.showContribute = false; render(); });

  const bp = document.getElementById('btn-propose');
  if (bp) bp.addEventListener('click', () => { state.showProposal = !state.showProposal; state.showContribute = false; render(); });
  const bpOk = document.getElementById('btn-prop-ok');
  if (bpOk) bpOk.addEventListener('click', () => { const payee = document.getElementById('prop-payee').value.trim(); const amount = parseInt(document.getElementById('prop-amount').value, 10); const purpose = document.getElementById('prop-purpose').value.trim(); doCreateProposal(payee, amount, purpose, state.proposalReceipt?.category); });
  const bpCancel = document.getElementById('btn-prop-cancel');
  if (bpCancel) bpCancel.addEventListener('click', () => { state.showProposal = false; state.proposalReceipt = null; render(); });

  const ru = document.getElementById('receipt-upload');
  if (ru) ru.addEventListener('click', () => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = (e) => { if (e.target.files[0]) doParseReceipt(e.target.files[0]); }; input.click(); });

  document.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', () => doApprove(btn.dataset.approve)));
  document.querySelectorAll('[data-execute]').forEach(btn => btn.addEventListener('click', () => doExecute(btn.dataset.execute)));

  const nl = document.getElementById('btn-nl');
  if (nl) nl.addEventListener('click', () => { const v = document.getElementById('nl-input').value.trim(); if (v) doNLQuery(v); });
  const nlIn = document.getElementById('nl-input');
  if (nlIn) nlIn.addEventListener('keypress', (e) => { if (e.key === 'Enter') { const v = nlIn.value.trim(); if (v) doNLQuery(v); } });
  document.querySelectorAll('[data-suggest]').forEach(btn => btn.addEventListener('click', () => doNLQuery(btn.dataset.suggest)));

  const rtcOffer = document.getElementById('btn-rtc-offer');
  if (rtcOffer) rtcOffer.addEventListener('click', async () => { const sdp = await state.p2p.createOffer(); state.rtcOffer = sdp; render(); });
  const rtcConnect = document.getElementById('btn-rtc-connect');
  if (rtcConnect) rtcConnect.addEventListener('click', async () => { const sdp = document.getElementById('rtc-answer-input').value.trim(); if (sdp) { const ok = await state.p2p.connectWithAnswer(sdp); showToast(ok ? 'WebRTC conectado' : 'Error WebRTC', ok ? 'success' : 'error'); } });
}

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

try {
  init();
} catch (err) {
  console.error('PEÑA init error:', err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = '<div style="padding:2rem;text-align:center;font-family:sans-serif"><h2>PEÑA</h2><p style="color:#666">Error al iniciar: ' + (err.message || 'desconocido') + '</p><p style="color:#999;font-size:0.8rem">Recarga la página o abre la consola para más detalles.</p></div>';
  }
}

window.addEventListener('error', (e) => {
  console.error('PEÑA runtime error:', e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('PEÑA unhandled promise:', e.reason);
});
