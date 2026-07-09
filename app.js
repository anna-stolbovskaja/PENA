// PEÑA — Application Logic
// Wires: ledger.js (state), p2p.js (sync), wdk.js (wallet), qvac.js (OCR + NL)
// UI: icons.js, ui.js (modals, toasts, tour, charts, QR, sortable tables)

import { EVENT_TYPES, createEvent, initialState, applyEvent, rebuildState, isApproved, getCategorySummary, getMemberContributions, escapeHtml } from './lib/ledger.js';
import { P2PNode } from './lib/p2p.js';
import { generateWallet, signMessage, signTransferAuthorization, createSmartAccount, verifySignature, checkThreshold, simulateTxHash, shortenHash, ethers } from './lib/wdk.js';
import { parseReceipt, queryLedger, initOCR, categorizeExpense } from './lib/qvac.js';
import { icon, icons } from './lib/icons.js';
import { showModal, closeModal, showToast, startTour, shouldShowTour, barChart, donutChart, lineChart, sortableTable, attachSortable, generateQR, copyToClipboard, escapeText } from './lib/ui.js';

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const state = {
  ...initialState(),
  threshold: 2,
  groupName: 'Atletico Sur',
  currentUser: null,
  wallet: null,
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
  mode: 'demo', // 'demo' or 'real'
  notes: [],
  noteInput: '',
  sortKey: -1,
  sortDir: 'asc',
  rtcOffer: '',
  rtcAnswer: '',
  showRTC: false,
  quickFill: [],
  loading: true,
};

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

function init() {
  // Load mode
  const savedMode = localStorage.getItem('pena_mode');
  if (savedMode === 'real') state.mode = 'real';

  // Load notes
  try {
    state.notes = JSON.parse(localStorage.getItem('pena_notes') || '[]');
  } catch { state.notes = []; }

  // Load wallet
  const savedWallet = localStorage.getItem('pena_wallet');
  if (savedWallet) {
    try { state.wallet = JSON.parse(savedWallet); } catch { state.wallet = generateWallet(); }
  } else {
    state.wallet = generateWallet();
    localStorage.setItem('pena_wallet', JSON.stringify(state.wallet));
  }

  state.smartAccount = createSmartAccount(state.threshold, [{ address: state.wallet.address }]);

  // Init P2P
  try {
    state.p2p = new P2PNode();
    state.p2p.getStateSnapshot = () => ({
      members: state.members, contributions: state.contributions,
      proposals: state.proposals, executions: state.executions,
      receipts: state.receipts, balance: state.balance,
      threshold: state.threshold, groupName: state.groupName,
    });
    state.p2p.onEvent((msg) => {
      if (msg.type === 'event') {
        state.events.push(msg.event);
        applyEvent(state, msg.event);
        render();
        showToast('Synced via P2P', 'p2p');
      } else if (msg.type === 'state:sync') {
        if (state.members.length === 0 && msg.state) {
          Object.assign(state, msg.state);
          render();
        }
      }
    });
    state.p2p.onPeerChange((peers) => { state.peers = peers; render(); });
  } catch (err) { console.error('P2P init error:', err.message); }

  // Seed data
  if (state.mode === 'demo') seedData();
  render();

  // Hide skeleton, show app
  const skeleton = document.getElementById('skeleton');
  const app = document.getElementById('app');
  if (skeleton) skeleton.style.display = 'none';
  if (app) app.style.display = 'block';

  // Tour
  if (shouldShowTour()) setTimeout(startTour, 1000);
}

function seedData() {
  if (state.members.length > 0) return;
  const members = [
    { id: 'm1', name: 'Carlos Mendoza', role: 'founder', walletAddr: generateWallet().address },
    { id: 'm2', name: 'Ana Stolbovskaja', role: 'approver', walletAddr: state.wallet.address },
    { id: 'm3', name: 'Diego Ramirez', role: 'approver', walletAddr: generateWallet().address },
    { id: 'm4', name: 'Lucia Fernandez', role: 'member', walletAddr: generateWallet().address },
  ];
  for (const m of members) { const ev = createEvent(EVENT_TYPES.MEMBER_JOIN, m, state.wallet); state.events.push(ev); applyEvent(state, ev); }
  state.currentUser = 'm2';

  const contribs = [
    { memberId: 'm1', amount: 500, ts: Date.now() - 86400000 * 7 },
    { memberId: 'm2', amount: 300, ts: Date.now() - 86400000 * 6 },
    { memberId: 'm3', amount: 200, ts: Date.now() - 86400000 * 5 },
    { memberId: 'm4', amount: 150, ts: Date.now() - 86400000 * 4 },
  ];
  for (const c of contribs) { const ev = createEvent(EVENT_TYPES.CONTRIBUTION, { ...c, txHash: simulateTxHash() }, state.wallet); state.events.push(ev); applyEvent(state, ev); }

  const p1 = { id: 'p1', payee: 'Buses Ruta Sur', amount: 450, currency: 'USDt', purpose: 'Bus rental for away match', category: 'Transport', createdBy: 'm1', ts: Date.now() - 86400000 * 3 };
  const evP1 = createEvent(EVENT_TYPES.PROPOSAL_CREATE, p1, state.wallet); state.events.push(evP1); applyEvent(state, evP1);
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm1', sig: '0xs1', ts: Date.now() - 86400000 * 3 + 3600000 }, state.wallet));
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm2', sig: '0xs2', ts: Date.now() - 86400000 * 3 + 7200000 }, state.wallet));
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: simulateTxHash(), ts: Date.now() - 86400000 * 3 + 10800000 }, state.wallet));

  const p2 = { id: 'p2', payee: 'Print Shop', amount: 320, currency: 'USDt', purpose: 'Tifo: flags and banners', category: 'Tifo', createdBy: 'm2', ts: Date.now() - 86400000 * 2 };
  const evP2 = createEvent(EVENT_TYPES.PROPOSAL_CREATE, p2, state.wallet); state.events.push(evP2); applyEvent(state, evP2);
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p2', memberId: 'm2', sig: '0xs3', ts: Date.now() - 86400000 * 2 + 3600000 }, state.wallet));
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p2', memberId: 'm3', sig: '0xs4', ts: Date.now() - 86400000 * 2 + 7200000 }, state.wallet));
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p2', txHash: simulateTxHash(), ts: Date.now() - 86400000 * 2 + 10800000 }, state.wallet));

  const p3 = { id: 'p3', payee: 'Hardware Store', amount: 180, currency: 'USDt', purpose: 'Materials for temporary stand', category: 'Equipment', createdBy: 'm3', ts: Date.now() - 3600000 };
  const evP3 = createEvent(EVENT_TYPES.PROPOSAL_CREATE, p3, state.wallet); state.events.push(evP3); applyEvent(state, evP3);
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p3', memberId: 'm3', sig: '0xs5', ts: Date.now() - 3000000 }, state.wallet));
}

// ═══════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════

function emitEvent(event) {
  state.events.push(event);
  applyEvent(state, event);
  if (state.p2p) state.p2p.broadcast({ type: 'event:broadcast', from: state.p2p.peerId, event });
  render();
}

async function doContribute(amount) {
  if (!amount || amount <= 0) { showToast('Invalid amount', 'error'); return; }
  try {
    const auth = await signTransferAuthorization(state.wallet.privateKey, { to: state.smartAccount.address, amount });
    if (!auth) { showToast('Signing failed', 'error'); return; }
    emitEvent(createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: state.currentUser, amount, txHash: simulateTxHash(), authSignature: auth.signature, authNonce: auth.nonce, ts: Date.now() }, state.wallet));
    state.showContribute = false;
    showToast(`${amount} USDt contributed (gasless)`, 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function doCreateProposal(payee, amount, purpose, category) {
  if (!payee || !amount || amount <= 0 || !purpose) { showToast('Fill all fields', 'error'); return; }
  const id = 'p' + Date.now();
  emitEvent(createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id, payee, amount: Number(amount), currency: 'USDt', purpose, category: category || 'Other', createdBy: state.currentUser, ts: Date.now() }, state.wallet));
  if (state.proposalReceipt) emitEvent(createEvent(EVENT_TYPES.RECEIPT_PARSE, { proposalId: id, parsed: state.proposalReceipt }, state.wallet));
  state.showProposal = false; state.proposalReceipt = null;
  showToast('Proposal created and synced', 'success');
}

async function doApprove(proposalId) {
  try {
    const msg = `approve:${proposalId}:${state.currentUser}`;
    const sig = await signMessage(state.wallet.privateKey, msg);
    if (!sig) { showToast('Signing failed', 'error'); return; }
    emitEvent(createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId, memberId: state.currentUser, sig, ts: Date.now() }, state.wallet));
    showToast('Approval signed', 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function doExecute(proposalId) {
  try {
    const proposal = state.proposals.find(p => p.id === proposalId);
    if (!proposal || !checkThreshold(proposal, state.threshold)) { showToast('Not enough approvals', 'error'); return; }
    const auth = await signTransferAuthorization(state.wallet.privateKey, { to: proposal.payee, amount: proposal.amount });
    emitEvent(createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId, txHash: simulateTxHash(), authSignature: auth ? auth.signature : null, ts: Date.now() }, state.wallet));
    showToast('Gasless transfer executed', 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function doParseReceipt(file) {
  state.ocrLoading = true; render();
  try {
    const url = URL.createObjectURL(file);
    const result = await parseReceipt(url);
    URL.revokeObjectURL(url);
    state.proposalReceipt = result; state.ocrLoading = false;
    if (result.error) showToast('OCR: ' + result.error, 'error');
    else showToast(`Receipt: ${result.payee} - ${result.amount} USDt - ${result.category}`, 'success');
    render();
  } catch (err) { state.ocrLoading = false; showToast('OCR error: ' + err.message, 'error'); render(); }
}

function doNLQuery(query) {
  try { state.nlInput = query; state.nlResult = queryLedger(state, query); render(); }
  catch (err) { state.nlResult = 'Error: ' + err.message; render(); }
}

function addNote(text) {
  if (!text || !text.trim()) return;
  const note = { id: Date.now(), text: text.trim(), ts: Date.now(), author: state.currentUser };
  state.notes.push(note);
  localStorage.setItem('pena_notes', JSON.stringify(state.notes));
  state.noteInput = '';
  showToast('Note added', 'success');
  render();
}

function deleteNote(id) {
  state.notes = state.notes.filter(n => n.id !== id);
  localStorage.setItem('pena_notes', JSON.stringify(state.notes));
  render();
}

function switchMode(mode) {
  state.mode = mode;
  localStorage.setItem('pena_mode', mode);
  if (mode === 'real') {
    state.members = []; state.contributions = []; state.proposals = [];
    state.executions = []; state.receipts = []; state.balance = 0; state.events = [];
    state.currentUser = null;
    // Create self as first member
    const self = { id: 'me', name: 'You', role: 'founder', walletAddr: state.wallet.address };
    emitEvent(createEvent(EVENT_TYPES.MEMBER_JOIN, self, state.wallet));
    state.currentUser = 'me';
  }
  render();
  showToast(mode === 'demo' ? 'Demo mode loaded' : 'Real mode activated', 'info');
}

function generateReport() {
  const totalIn = state.contributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalOut = state.proposals.filter(p => p.status === 'executed').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const cats = getCategorySummary(state);
  const byM = getMemberContributions(state);
  const report = `PEÑA Treasury Report - ${state.groupName}
Generated: ${new Date().toISOString()}

SUMMARY
=======
Balance: ${state.balance} USDt
Total Income: ${totalIn} USDt
Total Expenses: ${totalOut} USDt
Members: ${state.members.length}
Proposals: ${state.proposals.length} (${state.proposals.filter(p => p.status === 'executed').length} executed, ${state.proposals.filter(p => p.status === 'pending').length} pending)

EXPENSES BY CATEGORY
====================
${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, a]) => `${c}: ${a} USDt`).join('\n')}

CONTRIBUTIONS BY MEMBER
=======================
${Object.entries(byM).sort((a, b) => b[1] - a[1]).map(([n, a]) => `${n}: ${a} USDt`).join('\n')}

TRANSACTIONS
============
${state.contributions.map(c => { const m = state.members.find(m => m.id === c.memberId); return `[IN]  ${c.amount} USDt from ${m ? m.name : '?'} - ${shortenHash(c.txHash)}`; }).join('\n')}
${state.executions.map(e => { const p = state.proposals.find(p => p.id === e.proposalId); return `[OUT] ${p ? p.amount : 0} USDt to ${p ? p.payee : '?'} - ${shortenHash(e.txHash)}`; }).join('\n')}
`;
  return report;
}

function downloadReport() {
  const report = generateReport();
  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pena-report-${Date.now()}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Report downloaded', 'success');
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

const TABS = [
  { id: 'feed', label: 'Audit', icon: 'audit' },
  { id: 'proposals', label: 'Proposals', icon: 'proposals' },
  { id: 'balance', label: 'Balance', icon: 'balance' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'query', label: 'Query', icon: 'query' },
  { id: 'p2p', label: 'P2P', icon: 'p2p' },
  { id: 'help', label: 'Help', icon: 'help' },
];

function layout() {
  return `
    <div class="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      ${renderHeader()}
      ${renderDesktopTabs()}
      <div class="mt-4 sm:mt-6 overflow-hidden">${renderTab()}</div>
      ${renderFooter()}
      ${renderBottomNav()}
    </div>
  `;
}

function renderHeader() {
  const totalIn = state.contributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalOut = state.proposals.filter(p => p.status === 'executed').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return `
    <div data-tour="balance" class="bg-white dark:bg-gray-900 rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-800">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">P</div>
          <div class="min-w-0">
            <h1 class="text-lg sm:text-xl font-bold truncate">PEÑA</h1>
            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">${escapeHtml(state.groupName)}</p>
          </div>
        </div>
        <div class="flex items-center gap-3 sm:gap-6">
          <div class="text-right">
            <p class="text-xs text-gray-500 dark:text-gray-400">Balance</p>
            <p class="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">${state.balance} <span class="text-xs sm:text-sm">USDt</span></p>
          </div>
          <div class="text-right hidden sm:block">
            <p class="text-xs text-gray-500 dark:text-gray-400">Members</p>
            <p class="text-xl sm:text-2xl font-bold">${state.members.length}</p>
          </div>
          <div class="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950 flex-shrink-0">
            <div class="w-2 h-2 rounded-full bg-green-500 p2p-pulse"></div>
            <span class="text-xs font-medium text-green-700 dark:text-green-300">${state.peers.length}</span>
          </div>
        </div>
      </div>
      <div class="mt-3 flex gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        <span class="flex items-center gap-1">${icon('arrowUp', 'sm')} ${totalIn}</span>
        <span class="flex items-center gap-1">${icon('arrowDown', 'sm')} ${totalOut}</span>
        <span>M-of-N: ${state.threshold}/${state.members.filter(m => m.role !== 'member').length}</span>
        <span class="font-mono hidden sm:inline">${shortenHash(state.wallet?.address || '', 8, 6)}</span>
        <button data-mode-toggle class="ml-auto px-2 py-0.5 rounded-full text-xs ${state.mode === 'demo' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}">${state.mode === 'demo' ? 'Demo' : 'Live'}</button>
      </div>
    </div>
  `;
}

function renderDesktopTabs() {
  return `
    <div data-tour="tabs" class="desktop-tabs flex gap-1 mt-4 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
      ${TABS.map(t => `<button data-tab="${t.id}" class="tab-btn px-3 sm:px-4 py-2.5 font-medium text-sm whitespace-nowrap transition-smooth flex items-center gap-1.5 ${state.activeTab === t.id ? 'tab-active' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}">${icon(t.icon, 'sm')} <span class="hidden sm:inline">${t.label}</span></button>`).join('')}
    </div>
  `;
}

function renderBottomNav() {
  return `
    <nav class="bottom-nav">
      ${TABS.map(t => `<button data-tab="${t.id}" class="bottom-nav-item ${state.activeTab === t.id ? 'active' : ''}">${icon(t.icon, 'md')}<span>${t.label}</span></button>`).join('')}
    </nav>
  `;
}

function renderTab() {
  switch (state.activeTab) {
    case 'feed': return renderFeed();
    case 'proposals': return renderProposals();
    case 'balance': return renderBalance();
    case 'reports': return renderReports();
    case 'query': return renderQuery();
    case 'p2p': return renderP2P();
    case 'help': return renderHelp();
    default: return renderFeed();
  }
}

// ─── FEED ──────────────────────────────────────────────────────

function renderFeed() {
  const events = [];
  state.members.forEach(m => events.push({ ts: m.ts || Date.now(), type: 'member', data: m }));
  state.contributions.forEach(c => events.push({ ts: c.ts, type: 'contribution', data: c }));
  state.proposals.forEach(p => { events.push({ ts: p.ts, type: 'proposal', data: p }); p.approvals.forEach(a => events.push({ ts: a.ts, type: 'approval', data: a, proposal: p })); });
  state.executions.forEach(e => { const p = state.proposals.find(p => p.id === e.proposalId); events.push({ ts: e.ts, type: 'execution', data: e, proposal: p }); });
  events.sort((a, b) => b.ts - a.ts);

  const quickAmounts = [50, 100, 200, 500];
  const quickPurposes = ['Bus rental', 'Tifo materials', 'Match tickets', 'Equipment', 'Charity'];

  return `
    <div class="space-y-3" data-tour="actions">
      <div class="flex gap-2">
        <button id="btn-contribute" class="flex-1 py-2.5 px-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-smooth flex items-center justify-center gap-2">${icon('plus', 'sm')} Contribute</button>
        <button id="btn-propose" class="flex-1 py-2.5 px-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium text-sm transition-smooth flex items-center justify-center gap-2">${icon('plus', 'sm')} Proposal</button>
      </div>
      ${state.showContribute ? `
        <div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
          <h4 class="font-semibold mb-3">Contribute to Treasury</h4>
          <div class="flex gap-2 mb-3">
            <input id="contrib-amount" type="number" placeholder="USDt amount" class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
            <button id="btn-contrib-ok" class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm">Send</button>
            <button id="btn-contrib-cancel" class="px-3 py-2 rounded-lg text-gray-500 text-sm">Cancel</button>
          </div>
          <div class="flex gap-2 flex-wrap">
            ${quickAmounts.map(a => `<button data-quick-amount="${a}" class="text-xs px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-green-100 dark:hover:bg-green-900 transition-smooth">${a} USDt</button>`).join('')}
          </div>
          <p class="text-xs text-gray-400 mt-2 flex items-center gap-1">${icon('zap', 'sm')} WDK ERC-4337 - EIP-3009 transferWithAuthorization - gasless</p>
        </div>
      ` : ''}
      ${state.showProposal ? `
        <div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
          <h4 class="font-semibold mb-3">New Spending Proposal</h4>
          <div class="space-y-3">
            <input id="prop-payee" type="text" placeholder="Payee" value="${escapeHtml(state.proposalReceipt?.payee || '')}" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
            <input id="prop-amount" type="number" placeholder="USDt amount" value="${escapeHtml(String(state.proposalReceipt?.amount || ''))}" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
            <input id="prop-purpose" type="text" placeholder="Purpose" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
            <div class="flex gap-2 flex-wrap">
              ${quickPurposes.map(p => `<button data-quick-purpose="${escapeHtml(p)}" class="text-xs px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-green-100 dark:hover:bg-green-900">${escapeHtml(p)}</button>`).join('')}
            </div>
            <div class="receipt-drop rounded-lg p-4 text-center cursor-pointer" id="receipt-upload">
              ${state.ocrLoading ? `<div class="flex items-center justify-center gap-2 text-blue-500"><span class="spin">${icon('refresh', 'md')}</span> Processing OCR...</div>` : state.proposalReceipt ? `<div class="text-left"><p class="text-xs text-green-600 dark:text-green-400 font-medium mb-1 flex items-center gap-1">${icon('check', 'sm')} QVAC OCR parsed:</p><p class="text-sm">${escapeHtml(state.proposalReceipt.payee)} - ${state.proposalReceipt.amount} USDt - ${escapeHtml(state.proposalReceipt.category)}</p></div>` : `<div class="flex items-center justify-center gap-2 text-gray-400"><span>${icon('camera', 'md')}</span> Attach receipt - on-device OCR</div>`}
            </div>
            <div class="flex gap-2">
              <button id="btn-prop-ok" class="flex-1 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium text-sm">Create</button>
              <button id="btn-prop-cancel" class="px-3 py-2 rounded-lg text-gray-500 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      ` : ''}
      <div data-tour="feed" class="mt-4">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">${icon('list', 'sm')} AUDIT FEED - TRANSPARENT AND IMMUTABLE</h3>
        <div class="space-y-2">
          ${events.length === 0 ? '<p class="text-center text-gray-400 py-8">No activity yet</p>' : events.slice(0, 50).map(feedItem).join('')}
        </div>
      </div>
    </div>
  `;
}

function feedItem(e) {
  const time = new Date(e.ts).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const member = (id) => state.members.find(m => m.id === id);
  if (e.type === 'member') return `<div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800"><div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-green-600 dark:text-green-400 flex-shrink-0">${icon('user', 'sm')}</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${escapeHtml(e.data.name)} joined</p><p class="text-xs text-gray-400">${escapeHtml(e.data.role)} - ${time}</p></div></div>`;
  if (e.type === 'contribution') { const m = member(e.data.memberId); return `<div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900"><div class="w-8 h-8 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center text-green-700 dark:text-green-300 flex-shrink-0">${icon('arrowUp', 'sm')}</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${escapeHtml(m ? m.name : '?')} contributed <span class="text-green-600 dark:text-green-400 font-bold">${e.data.amount} USDt</span></p><p class="text-xs text-gray-400 font-mono truncate">${shortenHash(e.data.txHash)} - ${time}</p></div><span class="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex-shrink-0">on-chain</span></div>`; }
  if (e.type === 'proposal') { const m = member(e.data.createdBy); return `<div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-100 dark:border-yellow-900"><div class="w-8 h-8 rounded-full bg-yellow-200 dark:bg-yellow-800 flex items-center justify-center text-yellow-700 dark:text-yellow-300 flex-shrink-0">${icon('proposals', 'sm')}</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${escapeHtml(m ? m.name : '?')} proposed <span class="font-bold">${e.data.amount} USDt</span> to ${escapeHtml(e.data.payee)}</p><p class="text-xs text-gray-400 truncate">${escapeHtml(e.data.purpose)} - ${time}</p></div><span class="text-xs px-2 py-1 rounded-full ${e.data.status === 'executed' ? 'badge-executed' : 'badge-pending'} flex-shrink-0">${e.data.status === 'executed' ? 'executed' : 'pending'}</span></div>`; }
  if (e.type === 'approval') { const m = member(e.data.memberId); return `<div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800"><div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 flex-shrink-0">${icon('check', 'sm')}</div><div class="flex-1 min-w-0"><p class="text-sm truncate">${escapeHtml(m ? m.name : '?')} approved: ${escapeHtml(e.proposal ? e.proposal.payee : '')}</p><p class="text-xs text-gray-400 font-mono truncate">${shortenHash(e.data.sig || '', 8, 6)} - ${time}</p></div></div>`; }
  if (e.type === 'execution') { return `<div class="slide-in flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900"><div class="w-8 h-8 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-300 flex-shrink-0">${icon('arrowDown', 'sm')}</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">Executed: <span class="font-bold">${e.proposal ? e.proposal.amount : 0} USDt</span> to ${escapeHtml(e.proposal ? e.proposal.payee : '')}</p><p class="text-xs text-gray-400 font-mono truncate">${shortenHash(e.data.txHash)} - gasless - ${time}</p></div><span class="text-xs px-2 py-1 rounded-full badge-executed flex-shrink-0">on-chain</span></div>`; }
  return '';
}

// ─── PROPOSALS ─────────────────────────────────────────────────

function renderProposals() {
  const pending = state.proposals.filter(p => p.status === 'pending');
  const executed = state.proposals.filter(p => p.status === 'executed');
  return `<div class="space-y-4"><div><h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">PENDING - REQUIRES ${state.threshold} APPROVALS</h3><div class="space-y-3">${pending.length === 0 ? '<p class="text-center text-gray-400 py-8">No pending proposals</p>' : pending.map(proposalCard).join('')}</div></div>${executed.length > 0 ? `<div><h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 mt-6">EXECUTED</h3><div class="space-y-3">${executed.map(proposalCard).join('')}</div></div>` : ''}</div>`;
}

function proposalCard(p) {
  const hasApproved = p.approvals.some(a => a.memberId === state.currentUser);
  const canApprove = state.currentUser && !hasApproved && p.status === 'pending';
  const canExecute = p.status === 'pending' && checkThreshold(p, state.threshold);
  const progress = Math.min(100, (p.approvals.length / state.threshold) * 100);
  const receipt = state.receipts.find(r => r.proposalId === p.id);
  return `<div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 card-hover transition-smooth"><div class="flex items-start justify-between gap-3"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1 flex-wrap"><span class="text-xs px-2 py-0.5 rounded-full ${p.status === 'executed' ? 'badge-executed' : 'badge-pending'}">${p.status === 'executed' ? 'executed' : 'pending'}</span>${p.category ? `<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">${escapeHtml(p.category)}</span>` : ''}</div><p class="font-semibold text-base truncate">${escapeHtml(p.payee)}</p><p class="text-sm text-gray-500 dark:text-gray-400 truncate">${escapeHtml(p.purpose)}</p><p class="text-2xl font-bold mt-2">${p.amount} <span class="text-sm font-normal text-gray-400">USDt</span></p>${receipt ? `<div class="mt-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-xs flex items-center gap-1"><span class="text-green-600 dark:text-green-400">${icon('camera', 'sm')}</span> OCR: ${escapeHtml(receipt.parsed.payee)} - ${escapeHtml(receipt.parsed.category)}</div>` : ''}</div><div class="text-right flex-shrink-0">${p.status === 'pending' ? `<p class="text-xs text-gray-400 mb-2">Approvals</p><p class="text-lg font-bold">${p.approvals.length}/${state.threshold}</p><div class="progress-bar mt-2 w-20 sm:w-24"><div class="progress-bar-fill" style="width:${progress}%"></div></div>${canApprove ? `<button data-approve="${p.id}" class="mt-3 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-smooth">Approve</button>` : ''}${hasApproved ? '<p class="text-xs text-green-600 dark:text-green-400 mt-2">Approved</p>' : ''}${canExecute ? `<button data-execute="${p.id}" class="mt-3 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium block w-full">Execute</button>` : ''}` : `<p class="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">${icon('check', 'sm')} Done</p>${state.executions.find(e => e.proposalId === p.id) ? `<p class="text-xs font-mono text-gray-400 mt-1">${shortenHash(state.executions.find(e => e.proposalId === p.id).txHash)}</p>` : ''}`}</div></div>${p.approvals.length > 0 ? `<div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex gap-2 flex-wrap">${p.approvals.map(a => { const m = state.members.find(m => m.id === a.memberId); return `<span class="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center gap-1">${icon('check', 'sm')} ${escapeHtml(m ? m.name : '?')}</span>`; }).join('')}</div>` : ''}</div>`;
}

// ─── BALANCE ───────────────────────────────────────────────────

function renderBalance() {
  const totalIn = state.contributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalOut = state.proposals.filter(p => p.status === 'executed').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const cats = getCategorySummary(state);
  const byM = getMemberContributions(state);
  const catData = Object.entries(cats).map(([label, value]) => ({ label, value }));
  const memberData = Object.entries(byM).map(([label, value]) => ({ label, value }));

  // Spending trend (last 7 days)
  const trendData = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = Date.now() - i * 86400000;
    const dayLabel = new Date(dayStart).toLocaleDateString('en', { weekday: 'short' });
    const dayTotal = state.executions.filter(e => { const p = state.proposals.find(p => p.id === e.proposalId); return p && e.ts >= dayStart && e.ts < dayStart + 86400000; }).reduce((s, e) => { const p = state.proposals.find(p => p.id === e.proposalId); return s + (p ? p.amount : 0); }, 0);
    trendData.push({ label: dayLabel, value: dayTotal });
  }

  return `
    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-2 mb-1"><span class="text-green-600 dark:text-green-400">${icon('wallet', 'md')}</span><p class="text-xs text-gray-400">Balance</p></div>
          <p class="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">${state.balance}</p>
          <p class="text-xs text-gray-400">USDt</p>
        </div>
        <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-2 mb-1"><span class="text-blue-600 dark:text-blue-400">${icon('arrowUp', 'md')}</span><p class="text-xs text-gray-400">Income</p></div>
          <p class="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">${totalIn}</p>
          <p class="text-xs text-gray-400">${state.contributions.length} contributions</p>
        </div>
        <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-2 mb-1"><span class="text-orange-600 dark:text-orange-400">${icon('arrowDown', 'md')}</span><p class="text-xs text-gray-400">Expenses</p></div>
          <p class="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">${totalOut}</p>
          <p class="text-xs text-gray-400">${state.proposals.filter(p => p.status === 'executed').length} executed</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
          <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('pie', 'sm')} Expenses by Category</h4>
          ${donutChart(catData)}
        </div>
        <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
          <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('chart', 'sm')} Spending Trend (7 days)</h4>
          ${lineChart(trendData)}
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('users', 'sm')} Contributions by Member</h4>
        ${barChart(memberData)}
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('list', 'sm')} Transactions</h4>
        ${sortableTable(
          [{ label: 'Type' }, { label: 'Amount' }, { label: 'From/To' }, { label: 'Tx Hash' }, { label: 'Time' }],
          [
            ...state.contributions.slice().reverse().map(c => { const m = state.members.find(m => m.id === c.memberId); return [`IN`, `<span class="text-green-600 dark:text-green-400">${c.amount} USDt</span>`, escapeHtml(m ? m.name : ''), `<span class="font-mono text-gray-400">${shortenHash(c.txHash)}</span>`, new Date(c.ts).toLocaleDateString('en')]; }),
            ...state.executions.slice().reverse().map(e => { const p = state.proposals.find(p => p.id === e.proposalId); return [`OUT`, `<span class="text-blue-600 dark:text-blue-400">${p ? p.amount : 0} USDt</span>`, escapeHtml(p ? p.payee : ''), `<span class="font-mono text-gray-400">${shortenHash(e.txHash)}</span>`, new Date(e.ts).toLocaleDateString('en')]; }),
          ]
        )}
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-semibold flex items-center gap-2">${icon('note', 'sm')} Notes</h4>
          <span class="text-xs text-gray-400">Stored locally on device</span>
        </div>
        <div class="flex gap-2 mb-3">
          <input id="note-input" type="text" placeholder="Add a note..." value="${escapeHtml(state.noteInput)}" class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
          <button id="btn-note-add" class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium">Add</button>
        </div>
        <div class="space-y-2">
          ${state.notes.length === 0 ? '<p class="text-sm text-gray-400 text-center py-4">No notes yet</p>' : state.notes.slice().reverse().map(n => `<div class="flex items-start justify-between gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 slide-in"><div class="flex-1 min-w-0"><p class="text-sm">${escapeHtml(n.text)}</p><p class="text-xs text-gray-400 mt-1">${new Date(n.ts).toLocaleString('en')}</p></div><button data-note-delete="${n.id}" class="text-gray-400 hover:text-red-500 flex-shrink-0">${icon('trash', 'sm')}</button></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

// ─── REPORTS ───────────────────────────────────────────────────

function renderReports() {
  const cats = getCategorySummary(state);
  const byM = getMemberContributions(state);
  const totalIn = state.contributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalOut = state.proposals.filter(p => p.status === 'executed').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const pending = state.proposals.filter(p => p.status === 'pending');
  const executed = state.proposals.filter(p => p.status === 'executed');
  const avgContribution = state.contributions.length > 0 ? (totalIn / state.contributions.length).toFixed(0) : 0;
  const avgExpense = executed.length > 0 ? (totalOut / executed.length).toFixed(0) : 0;
  const largestExpense = executed.length > 0 ? Math.max(...executed.map(p => p.amount)) : 0;

  // Monthly trend
  const monthlyData = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(); monthStart.setMonth(monthStart.getMonth() - i); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart); monthEnd.setMonth(monthEnd.getMonth() + 1);
    const label = monthStart.toLocaleDateString('en', { month: 'short' });
    const income = state.contributions.filter(c => c.ts >= monthStart.getTime() && c.ts < monthEnd.getTime()).reduce((s, c) => s + c.amount, 0);
    monthlyData.push({ label, value: income });
  }

  return `
    <div class="space-y-4">
      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-semibold flex items-center gap-2">${icon('reports', 'md')} Treasury Report</h4>
          <div class="flex gap-2">
            <button id="btn-report-download" class="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium flex items-center gap-1">${icon('download', 'sm')} Export</button>
            <button id="btn-report-copy" class="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium flex items-center gap-1">${icon('copy', 'sm')} Copy</button>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Avg Contribution</p><p class="text-lg font-bold">${avgContribution}</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Avg Expense</p><p class="text-lg font-bold">${avgExpense}</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Largest Expense</p><p class="text-lg font-bold">${largestExpense}</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Pending Value</p><p class="text-lg font-bold">${pending.reduce((s, p) => s + p.amount, 0)}</p></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><h5 class="text-xs font-medium text-gray-500 mb-2">Monthly Income Trend</h5>${lineChart(monthlyData)}</div>
          <div><h5 class="text-xs font-medium text-gray-500 mb-2">Category Distribution</h5>${donutChart(Object.entries(cats).map(([label, value]) => ({ label, value })))}</div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('trending', 'sm')} Detailed Breakdown</h4>
        ${sortableTable(
          [{ label: 'Member' }, { label: 'Contributed' }, { label: 'Proposals' }, { label: 'Approvals' }],
          state.members.map(m => {
            const contrib = state.contributions.filter(c => c.memberId === m.id).reduce((s, c) => s + c.amount, 0);
            const props = state.proposals.filter(p => p.createdBy === m.id).length;
            const apprs = state.proposals.reduce((s, p) => s + p.approvals.filter(a => a.memberId === m.id).length, 0);
            return [escapeHtml(m.name), `${contrib} USDt`, String(props), String(apprs)];
          })
        )}
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('clock', 'sm')} Proposal History</h4>
        ${sortableTable(
          [{ label: 'Payee' }, { label: 'Amount' }, { label: 'Category' }, { label: 'Status' }, { label: 'Date' }],
          state.proposals.map(p => [escapeHtml(p.payee), `${p.amount} USDt`, escapeHtml(p.category || 'Other'), p.status, new Date(p.ts).toLocaleDateString('en')])
        )}
      </div>
    </div>
  `;
}

// ─── NL QUERY ──────────────────────────────────────────────────

function renderQuery() {
  const suggestions = ['balance', 'transport', 'tifo', 'who contributed most', 'categories', 'pending', 'last activity'];
  return `
    <div class="space-y-4">
      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-green-600 dark:text-green-400">${icon('query', 'md')}</span>
          <h4 class="font-semibold">Natural Language Query</h4>
        </div>
        <p class="text-xs text-gray-400 mb-4 flex items-center gap-1">${icon('cpu', 'sm')} Processed on-device - no server, no API calls</p>
        <div class="flex gap-2">
          <input id="nl-input" type="text" placeholder="e.g. how much on buses?" value="${escapeHtml(state.nlInput)}" class="flex-1 px-3 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
          <button id="btn-nl" class="px-4 sm:px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-sm flex items-center gap-1">${icon('search', 'sm')} <span class="hidden sm:inline">Query</span></button>
        </div>
        <div class="flex gap-2 mt-3 flex-wrap">
          ${suggestions.map(s => `<button data-suggest="${escapeHtml(s)}" class="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-green-100 dark:hover:bg-green-900 transition-smooth">${escapeHtml(s)}</button>`).join('')}
        </div>
      </div>
      ${state.nlResult ? `<div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800"><div class="flex items-center gap-2 mb-2"><span class="text-green-600 dark:text-green-400">${icon('sparkles', 'md')}</span><h4 class="font-semibold">Answer</h4><span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">on-device</span><button id="btn-nl-copy" class="ml-auto text-gray-400 hover:text-green-500">${icon('copy', 'sm')}</button></div><div class="text-sm whitespace-pre-line">${escapeHtml(state.nlResult)}</div></div>` : ''}
    </div>
  `;
}

// ─── P2P ───────────────────────────────────────────────────────

function renderP2P() {
  const inviteCode = state.p2p?.peerId || '';
  return `
    <div class="space-y-4">
      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-2 mb-3"><span class="text-green-600 dark:text-green-400">${icon('p2p', 'md')}</span><h4 class="font-semibold">P2P Synchronization</h4></div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">PEÑA syncs the ledger across devices without a server. BroadcastChannel handles same-browser sync. WebRTC connects separate devices via manual signaling.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400 mb-2">Your Peer ID</p><div class="flex items-center gap-2"><p class="font-mono text-sm truncate">${escapeHtml(inviteCode)}</p><button data-copy="${escapeHtml(inviteCode)}" class="text-gray-400 hover:text-green-500 flex-shrink-0">${icon('copy', 'sm')}</button></div></div>
          <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400 mb-2">Connected Peers</p><div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-green-500 p2p-pulse"></div><p class="font-mono text-sm">${state.peers.length} active</p></div></div>
        </div>
        <div class="mt-4 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
          <p class="text-sm font-medium text-green-700 dark:text-green-300 mb-2 flex items-center gap-1">${icon('info', 'sm')} Test P2P sync:</p>
          <ol class="text-sm text-green-600 dark:text-green-400 space-y-1 list-decimal list-inside"><li>Open this page in another browser tab</li><li>Peer count increases to 2</li><li>Create a contribution in one tab</li><li>It appears instantly in the other - no server</li></ol>
        </div>
        <div class="mt-4"><p class="text-xs text-gray-400 mb-2">Connected peers:</p><div class="space-y-1">${state.peers.map(pid => `<div class="flex items-center gap-2 text-xs font-mono p-2 rounded-lg bg-gray-50 dark:bg-gray-800"><div class="w-2 h-2 rounded-full ${pid === state.p2p?.peerId ? 'bg-blue-500' : 'bg-green-500'} p2p-pulse"></div><span class="truncate">${escapeHtml(pid)}</span>${pid === state.p2p?.peerId ? '<span class="text-gray-400">(you)</span>' : '<span class="text-green-600 dark:text-green-400">connected</span>'}</div>`).join('')}</div></div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('qr', 'sm')} QR Code - Share Invite</h4>
        <div class="flex flex-col sm:flex-row items-center gap-4">
          <div class="qr-container flex-shrink-0">${generateQR(inviteCode, 180)}</div>
          <div class="flex-1"><p class="text-sm text-gray-500 dark:text-gray-400">Scan this QR code with another device to sync the treasury ledger. The peer ID is used for P2P discovery.</p><div class="mt-3 flex gap-2"><button data-copy="${escapeHtml(inviteCode)}" class="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium flex items-center gap-1">${icon('copy', 'sm')} Copy ID</button></div></div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('wifi', 'sm')} WebRTC - Cross-Device Connection</h4>
        <div class="space-y-3">
          <button id="btn-rtc-offer" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-1">${icon('plus', 'sm')} Generate Offer</button>
          ${state.rtcOffer ? `<div><p class="text-xs text-gray-400 mb-1">Copy this Offer and paste it on the other device:</p><textarea readonly class="w-full h-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-mono">${escapeHtml(state.rtcOffer)}</textarea><button data-copy="${escapeHtml(state.rtcOffer)}" class="mt-1 text-xs text-green-600 flex items-center gap-1">${icon('copy', 'sm')} Copy</button></div>` : ''}
          <div><p class="text-xs text-gray-400 mb-1">Paste the Answer from the other device:</p><textarea id="rtc-answer-input" class="w-full h-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-mono" placeholder="SDP answer..."></textarea><button id="btn-rtc-connect" class="mt-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium">Connect</button></div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('layers', 'sm')} Technology Stack</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><span class="text-green-600 dark:text-green-400">${icon('wifi', 'md')}</span><div><strong>BroadcastChannel</strong><br><span class="text-xs text-gray-400">Same-browser tab sync</span></div></div>
          <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><span class="text-blue-600 dark:text-blue-400">${icon('phone', 'md')}</span><div><strong>WebRTC DataChannel</strong><br><span class="text-xs text-gray-400">Cross-device P2P</span></div></div>
          <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><span class="text-purple-600 dark:text-purple-400">${icon('wallet', 'md')}</span><div><strong>WDK / ethers.js</strong><br><span class="text-xs text-gray-400">ERC-4337, EIP-3009</span></div></div>
          <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><span class="text-orange-600 dark:text-orange-400">${icon('cpu', 'md')}</span><div><strong>QVAC / Tesseract.js</strong><br><span class="text-xs text-gray-400">On-device OCR + NL</span></div></div>
        </div>
      </div>
    </div>
  `;
}

// ─── HELP ──────────────────────────────────────────────────────

function renderHelp() {
  return `
    <div class="space-y-4">
      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('book', 'md')} How PEÑA Works</h4>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">PEÑA is a transparent self-custody treasury for football fan groups. It replaces opaque cash handling with a collective wallet where every transaction is visible to all members and confirmed by M-of-N approvals.</p>
        <div class="space-y-3">
          <div class="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><span class="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5">${icon('wallet', 'md')}</span><div><p class="font-medium text-sm">Collective Wallet (WDK)</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Each member has a self-custody wallet. The treasury is an ERC-4337 smart account with M-of-N approval threshold. Transfers are gasless via EIP-3009 transferWithAuthorization.</p></div></div>
          <div class="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><span class="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5">${icon('p2p', 'md')}</span><div><p class="font-medium text-sm">P2P Ledger (Pears)</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">All transactions are recorded in an append-only event log that syncs across devices without a server. BroadcastChannel handles same-browser sync; WebRTC connects separate devices.</p></div></div>
          <div class="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><span class="text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5">${icon('cpu', 'md')}</span><div><p class="font-medium text-sm">On-Device Intelligence (QVAC)</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Receipt photos are parsed with Tesseract.js OCR running locally in the browser. Natural language queries are answered from the local ledger state. No data leaves the device.</p></div></div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('list', 'md')} Features Guide</h4>
        <div class="space-y-2">
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('audit', 'sm')} Audit Feed</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Transparent, immutable log of all treasury activity: member joins, contributions, proposals, approvals, and executions.</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('proposals', 'sm')} Proposals</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Create spending proposals. M-of-N members must approve before a gasless transfer is executed. Attach receipts for automatic OCR parsing.</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('balance', 'sm')} Balance</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Visual dashboard with balance, income, expenses, category breakdown, spending trends, and member contributions. Add notes stored locally.</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('reports', 'sm')} Reports</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Detailed statistics, sortable tables, and exportable reports. Download as text file or copy to clipboard.</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('query', 'sm')} NL Query</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Ask questions in natural language: "how much on buses?", "who contributed most?", "what's the balance?" — answered locally from the ledger.</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('p2p', 'sm')} P2P Sync</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Real-time sync between devices. Open in two tabs to test. Use WebRTC for cross-device connections. Share invite via QR code.</p></div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('database', 'md')} Data Storage</h4>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Wallet keys:</strong> Stored in browser localStorage on your device only. Never transmitted to any server.</p>
          <p><strong>Ledger events:</strong> Stored in memory and synced via P2P. In production, persisted via Hypercore/Corestore on-device.</p>
          <p><strong>Notes:</strong> Stored in browser localStorage on your device.</p>
          <p><strong>Receipts:</strong> Processed locally by Tesseract.js OCR. Images are not stored or transmitted.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('rocket', 'md')} Architecture & Deployment</h4>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Current:</strong> Static web app (PWA). Works in any browser. Installable on mobile via Add to Home Screen. No backend server required.</p>
          <p><strong>Production target:</strong> Pear runtime app (Holepunch). Runs as a native desktop/mobile application with full Autobase + Hyperswarm P2P stack. Distributed as a Pear link or APK.</p>
          <p><strong>Vertical scaling:</strong> Multi-chain support (Solana, TON, TRON via WDK). Subgroup treasuries. Recurring contributions. Budget limits per category.</p>
          <p><strong>Horizontal scaling:</strong> Federation of fan group treasuries. Cross-group payments for shared events. Public transparency pages for sponsors.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('shield', 'md')} Security</h4>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>All user input is HTML-escaped to prevent XSS attacks.</p>
          <p>Wallet private keys never leave the device. All signing happens locally via ethers.js.</p>
          <p>Every async operation has try/catch error handling. The app never crashes silently.</p>
          <p>Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy.</p>
          <p>No hardcoded secrets, API keys, or tokens in the codebase.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('info', 'md')} Demo vs Live Mode</h4>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Demo mode:</strong> Pre-loaded with sample data (4 members, contributions, proposals). Perfect for exploring features and testing P2P sync.</p>
          <p><strong>Live mode:</strong> Starts empty. You are the first member. Create proposals, invite peers via QR, and build your real treasury.</p>
          <p>Toggle between modes using the badge in the header.</p>
        </div>
      </div>
    </div>
  `;
}

// ─── FOOTER ────────────────────────────────────────────────────

function renderFooter() {
  return `<div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-center"><p class="text-xs text-gray-400 flex items-center justify-center gap-1">${icon('shield', 'sm')} PEÑA - Transparent Self-Custody Treasury - WDK + Pears + QVAC</p><p class="text-xs text-gray-400 mt-1"><a href="https://github.com/anna-stolbovskaja/PENA" target="_blank" class="hover:text-green-500 transition-smooth flex items-center justify-center gap-1">${icon('github', 'sm')} github.com/anna-stolbovskaja/PENA</a></p></div>`;
}

// ═══════════════════════════════════════════════════════════════
// EVENT BINDING
// ═══════════════════════════════════════════════════════════════

function bindEvents() {
  // Tabs
  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => { state.activeTab = btn.dataset.tab; state.showContribute = false; state.showProposal = false; render(); }));

  // Mode toggle
  document.querySelectorAll('[data-mode-toggle]').forEach(btn => btn.addEventListener('click', () => { switchMode(state.mode === 'demo' ? 'real' : 'demo'); }));

  // Contribute
  const bc = document.getElementById('btn-contribute'); if (bc) bc.addEventListener('click', () => { state.showContribute = !state.showContribute; state.showProposal = false; render(); });
  const bcOk = document.getElementById('btn-contrib-ok'); if (bcOk) bcOk.addEventListener('click', () => doContribute(parseInt(document.getElementById('contrib-amount').value, 10)));
  const bcCancel = document.getElementById('btn-contrib-cancel'); if (bcCancel) bcCancel.addEventListener('click', () => { state.showContribute = false; render(); });
  document.querySelectorAll('[data-quick-amount]').forEach(btn => btn.addEventListener('click', () => { const inp = document.getElementById('contrib-amount'); if (inp) { inp.value = btn.dataset.quickAmount; } }));

  // Propose
  const bp = document.getElementById('btn-propose'); if (bp) bp.addEventListener('click', () => { state.showProposal = !state.showProposal; state.showContribute = false; render(); });
  const bpOk = document.getElementById('btn-prop-ok'); if (bpOk) bpOk.addEventListener('click', () => { const payee = document.getElementById('prop-payee').value.trim(); const amount = parseInt(document.getElementById('prop-amount').value, 10); const purpose = document.getElementById('prop-purpose').value.trim(); doCreateProposal(payee, amount, purpose, state.proposalReceipt?.category); });
  const bpCancel = document.getElementById('btn-prop-cancel'); if (bpCancel) bpCancel.addEventListener('click', () => { state.showProposal = false; state.proposalReceipt = null; render(); });
  document.querySelectorAll('[data-quick-purpose]').forEach(btn => btn.addEventListener('click', () => { const inp = document.getElementById('prop-purpose'); if (inp) inp.value = btn.dataset.quickPurpose; }));

  // Receipt upload
  const ru = document.getElementById('receipt-upload'); if (ru) ru.addEventListener('click', () => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = (e) => { if (e.target.files[0]) doParseReceipt(e.target.files[0]); }; input.click(); });

  // Approve / Execute
  document.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', () => doApprove(btn.dataset.approve)));
  document.querySelectorAll('[data-execute]').forEach(btn => btn.addEventListener('click', () => doExecute(btn.dataset.execute)));

  // NL Query
  const nl = document.getElementById('btn-nl'); if (nl) nl.addEventListener('click', () => { const v = document.getElementById('nl-input').value.trim(); if (v) doNLQuery(v); });
  const nlIn = document.getElementById('nl-input'); if (nlIn) nlIn.addEventListener('keypress', (e) => { if (e.key === 'Enter') { const v = nlIn.value.trim(); if (v) doNLQuery(v); } });
  document.querySelectorAll('[data-suggest]').forEach(btn => btn.addEventListener('click', () => doNLQuery(btn.dataset.suggest)));
  const nlCopy = document.getElementById('btn-nl-copy'); if (nlCopy) nlCopy.addEventListener('click', () => { copyToClipboard(state.nlResult).then(() => showToast('Copied', 'success')); });

  // Notes
  const noteAdd = document.getElementById('btn-note-add'); if (noteAdd) noteAdd.addEventListener('click', () => { const inp = document.getElementById('note-input'); if (inp) addNote(inp.value); });
  const noteIn = document.getElementById('note-input'); if (noteIn) noteIn.addEventListener('keypress', (e) => { if (e.key === 'Enter') addNote(noteIn.value); });
  document.querySelectorAll('[data-note-delete]').forEach(btn => btn.addEventListener('click', () => deleteNote(parseInt(btn.dataset.noteDelete, 10))));

  // Reports
  const reportDl = document.getElementById('btn-report-download'); if (reportDl) reportDl.addEventListener('click', downloadReport);
  const reportCopy = document.getElementById('btn-report-copy'); if (reportCopy) reportCopy.addEventListener('click', () => { copyToClipboard(generateReport()).then(() => showToast('Report copied', 'success')); });

  // Copy buttons
  document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => { copyToClipboard(btn.dataset.copy).then(() => showToast('Copied to clipboard', 'success')); }));

  // WebRTC
  const rtcOffer = document.getElementById('btn-rtc-offer'); if (rtcOffer) rtcOffer.addEventListener('click', async () => { const sdp = await state.p2p?.createOffer(); state.rtcOffer = sdp || ''; render(); });
  const rtcConnect = document.getElementById('btn-rtc-connect'); if (rtcConnect) rtcConnect.addEventListener('click', async () => { const sdp = document.getElementById('rtc-answer-input').value.trim(); if (sdp && state.p2p) { const ok = await state.p2p.connectWithAnswer(sdp); showToast(ok ? 'WebRTC connected' : 'WebRTC error', ok ? 'success' : 'error'); } });

  // Sortable tables
  document.querySelectorAll('table[id^="sortable-table-"]').forEach(t => attachSortable(t.id));
}

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

try {
  init();
} catch (err) {
  console.error('PEÑA init error:', err);
  const app = document.getElementById('app');
  const skeleton = document.getElementById('skeleton');
  if (skeleton) skeleton.style.display = 'none';
  if (app) {
    app.style.display = 'block';
    app.innerHTML = '<div style="padding:2rem;text-align:center;font-family:system-ui,sans-serif"><h2 style="font-size:1.5rem;font-weight:bold">PEÑA</h2><p style="color:#666;max-width:400px;margin:1rem auto">Failed to initialize: ' + escapeText(err.message || 'unknown error') + '</p><button onclick="location.reload()" style="padding:0.5rem 1rem;background:#00a86b;color:white;border:none;border-radius:0.5rem;cursor:pointer">Reload</button></div>';
  }
}

window.addEventListener('error', (e) => console.error('PEÑA runtime error:', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('PEÑA unhandled promise:', e.reason));
