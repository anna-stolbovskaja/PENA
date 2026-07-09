// PEÑA — Application Entry Point
// Modules: ledger.js (state), p2p.js (sync), wdk.js (wallet), qvac.js (OCR + NL)
// Actions: actions.js | Views: inline (render functions) | i18n: i18n.js

import { EVENT_TYPES, createEvent, initialState, applyEvent, rebuildState, resetAppliedIds, isApproved, getCategorySummary, getMemberContributions, escapeHtml, sanitizeAmount } from './lib/ledger.js';
import { P2PNode } from './lib/p2p.js';
import { generateWallet, signMessage, signTransferAuthorization, createSmartAccount, verifySignature, checkThreshold, simulateTxHash, shortenHash, ethers, getChain, getOnChainBalance, sendOnChainTransfer } from './lib/wdk.js';
import { parseReceipt, queryLedger, initOCR, categorizeExpense, QVAC } from './lib/qvac.js';
import { icon, icons } from './lib/icons.js';
import { showModal, closeModal, showToast, startTour, shouldShowTour, barChart, donutChart, lineChart, sortableTable, attachSortable, generateQR, copyToClipboard, escapeText, htmlCell } from './lib/ui.js';
import { t, setLang, getLang } from './lib/i18n.js';
import { initCrypto, isUnlocked, hasPin, secureGet, secureSet, secureRemove } from './lib/crypto.js';
import {
  emitEvent, persistEvents,
  doContribute, doCreateProposal, doApprove, doExecute,
  doParseReceipt, verifySigCached,
  flagDispute, resolveDispute,
  addRecurring, cancelRecurring,
  downloadTransparency,
  requestNotifications, sendLocalNotification,
  doNLQuery, addNote, deleteNote,
  generateReport, downloadReport,
} from './lib/actions.js';

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
  proposalCategories: [],
  ocrLoading: false,
  nlInput: '',
  nlResult: '',
  mode: 'demo',
  notes: [],
  noteInput: '',
  sortKey: -1,
  sortDir: 'asc',
  rtcOffer: '',
  rtcAnswer: '',
  showRTC: false,
  quickFill: [],
  loading: true,
  matches: [],
  calcTarget: 0,
  calcMembers: 0,
  calcAmount: 0,
  calcSplitMode: 'equal',
  tifoBudgets: [],
  lang: 'en',
  onboardingDone: false,
  disputes: [],
  recurring: [],
  roleLimits: { founder: Infinity, approver: 5000, member: 500, viewer: 0 },
  feedFilter: 'all',
};

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

async function init() {
  const savedMode = localStorage.getItem('pena_mode');
  if (savedMode === 'real') state.mode = 'real';

  try { state.notes = JSON.parse(await secureGet('pena_notes') || '[]'); } catch { state.notes = []; }
  try { state.tifoBudgets = JSON.parse(await secureGet('pena_tifo_budgets') || '[]'); } catch { state.tifoBudgets = []; }
  try { state.disputes = JSON.parse(await secureGet('pena_disputes') || '[]'); } catch { state.disputes = []; }
  try { state.recurring = JSON.parse(await secureGet('pena_recurring') || '[]'); } catch { state.recurring = []; }

  state.lang = localStorage.getItem('pena_lang') || (navigator.language?.startsWith('es') ? 'es' : 'en');
  setLang(state.lang);
  state.onboardingDone = localStorage.getItem('pena_onboarding') === 'done';

  const savedWallet = await secureGet('pena_wallet');
  if (savedWallet) {
    try { state.wallet = JSON.parse(savedWallet); } catch { state.wallet = generateWallet(); }
  } else {
    state.wallet = generateWallet();
    await secureSet('pena_wallet', JSON.stringify(state.wallet));
  }

  state.smartAccount = createSmartAccount(state.threshold, [{ address: state.wallet.address }]);

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
        if (msg.event && msg.event.id && state.events.some(e => e.id === msg.event.id)) return;
        state.events.push(msg.event);
        applyEvent(state, msg.event);
        persistEvents(state);
        render();
        showToast('Synced via P2P', 'p2p');
        sendLocalNotification('PEÑA', 'New activity synced via P2P');
      } else if (msg.type === 'state:sync') {
        if (state.members.length === 0 && msg.state) {
          Object.assign(state, msg.state);
          render();
        }
      }
    });
    state.p2p.onPeerChange((peers) => { state.peers = peers; render(); });
  } catch (err) { console.error('P2P init error:', err.message); }

  const savedEvents = await secureGet('pena_events');
  if (savedEvents) {
    try {
      const events = JSON.parse(savedEvents);
      if (Array.isArray(events) && events.length > 0) {
        const rebuilt = rebuildState(events);
        Object.assign(state, rebuilt);
        state.events = events;
      }
    } catch { /* ignore corrupt data */ }
  }

  // URL hash routing
  const validTabs = ['feed','proposals','balance','reports','matches','calc','query','p2p','help'];
  const hashTab = window.location.hash.replace('#', '');
  if (validTabs.includes(hashTab)) state.activeTab = hashTab;
  window.addEventListener('hashchange', () => {
    const tab = window.location.hash.replace('#', '');
    if (validTabs.includes(tab) && tab !== state.activeTab) { state.activeTab = tab; render(); }
  });

  if (state.mode === 'demo' && state.members.length === 0) { seedData(); seedMatches(); }
  render();

  const skeleton = document.getElementById('skeleton');
  const app = document.getElementById('app');
  if (skeleton) skeleton.style.display = 'none';
  if (app) app.style.display = 'block';

  // Onboarding
  if (!state.onboardingDone && state.mode !== 'demo') {
    setTimeout(() => {
      showModal(t('onboarding_welcome'), `
        <div class="space-y-4">
          <div class="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
            <span class="text-green-600">${icon('wallet', 'md')}</span>
            <p class="text-sm">${t('onboarding_step1')}</p>
          </div>
          <div class="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
            <span class="text-blue-600">${icon('proposals', 'md')}</span>
            <p class="text-sm">${t('onboarding_step2')}</p>
          </div>
          <div class="flex items-center gap-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30">
            <span class="text-purple-600">${icon('p2p', 'md')}</span>
            <p class="text-sm">${t('onboarding_step3')}</p>
          </div>
          <button id="onboarding-done" class="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-sm">Got it!</button>
        </div>
      `);
      setTimeout(() => {
        const btn = document.getElementById('onboarding-done');
        if (btn) btn.addEventListener('click', () => {
          state.onboardingDone = true;
          localStorage.setItem('pena_onboarding', 'done');
          closeModal();
        });
      }, 100);
    }, 500);
  }

  if (shouldShowTour()) setTimeout(startTour, 1000);
}

async function switchMode(mode) {
  state.mode = mode;
  localStorage.setItem('pena_mode', mode);
  secureRemove('pena_events');
  if (mode === 'real') {
    state.members = []; state.contributions = []; state.proposals = [];
    state.executions = []; state.receipts = []; state.balance = 0; state.events = [];
    state.currentUser = null;
    const self = { id: 'me', name: 'You', role: 'founder', walletAddr: state.wallet.address };
    emitEvent(state, createEvent(EVENT_TYPES.MEMBER_JOIN, self, state.wallet), render);
    state.currentUser = 'me';
  } else {
    state.members = []; state.contributions = []; state.proposals = [];
    state.executions = []; state.receipts = []; state.balance = 0; state.events = [];
    state.currentUser = null;
    seedData(); seedMatches();
  }
  render();
  showToast(mode === 'demo' ? 'Demo mode loaded' : 'Real mode activated', 'info');
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

  // Demo tifo budgets
  state.tifoBudgets = [
    { id: 'tb1', name: 'Flags for Derby', goal: 600, spent: 320, deadline: Date.now() + 86400000 * 12, category: 'Tifo' },
    { id: 'tb2', name: 'Away Match Bus', goal: 900, spent: 450, deadline: Date.now() + 86400000 * 5, category: 'Transport' },
  ];
  secureSet('pena_tifo_budgets', JSON.stringify(state.tifoBudgets));
}

function seedMatches() {
  if (state.matches.length > 0) return;
  state.matches = [
    { id: 'g1', date: Date.now() - 86400000 * 14, opponent: 'Atletico Norte', venue: 'Estadio Sur', home: true, scoreHome: 2, scoreAway: 1, status: 'finished', attendance: 340 },
    { id: 'g2', date: Date.now() - 86400000 * 7, opponent: 'Club Central', venue: 'Estadio Central', home: false, scoreHome: 1, scoreAway: 1, status: 'finished', attendance: 280 },
    { id: 'g3', date: Date.now() - 86400000 * 3, opponent: 'Deportivo Este', venue: 'Estadio Sur', home: true, scoreHome: 3, scoreAway: 0, status: 'finished', attendance: 420 },
    { id: 'g4', date: Date.now() + 86400000 * 2, opponent: 'Union Oeste', venue: 'Campo Municipal', home: false, scoreHome: null, scoreAway: null, status: 'upcoming', attendance: 0 },
    { id: 'g5', date: Date.now() + 86400000 * 9, opponent: 'Atletico Norte', venue: 'Estadio Sur', home: true, scoreHome: null, scoreAway: null, status: 'upcoming', attendance: 0 },
    { id: 'g6', date: Date.now() + 86400000 * 16, opponent: 'Club Central', venue: 'Estadio Sur', home: true, scoreHome: null, scoreAway: null, status: 'upcoming', attendance: 0 },
  ];
}


// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════

let renderScheduled = false;
function render() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = layout();
    bindEvents();
  });
}

function getTabs() {
  return [
    { id: 'feed', label: t('feed'), icon: 'audit' },
    { id: 'proposals', label: t('proposals'), icon: 'proposals' },
    { id: 'balance', label: t('tabBalance'), icon: 'balance' },
    { id: 'reports', label: t('tabReports'), icon: 'reports' },
    { id: 'matches', label: t('tabMatches'), icon: 'star' },
    { id: 'calc', label: t('tabCalc'), icon: 'chart' },
    { id: 'query', label: t('tabQuery'), icon: 'query' },
    { id: 'p2p', label: t('tabP2P'), icon: 'p2p' },
    { id: 'help', label: t('tabHelp'), icon: 'help' },
  ];
}

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
          <img src="/assets/pena.png" alt="PEÑA" class="w-10 h-10 rounded-xl flex-shrink-0">
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
        <button data-lang-toggle class="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">${state.lang === 'es' ? 'EN' : 'ES'}</button>
        <button data-theme-toggle aria-label="Toggle theme" class="px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">${document.documentElement.classList.contains('dark') ? '☀️' : '🌙'}</button>
        <button data-mode-toggle class="ml-auto px-2 py-0.5 rounded-full text-xs ${state.mode === 'demo' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}">${state.mode === 'demo' ? t('demo') : t('live')}</button>
      </div>
    </div>
  `;
}

function renderDesktopTabs() {
  return `
    <div data-tour="tabs" class="desktop-tabs flex gap-1 mt-4 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
      ${getTabs().map(tb => `<button data-tab="${tb.id}" class="tab-btn px-3 sm:px-4 py-2.5 font-medium text-sm whitespace-nowrap transition-smooth flex items-center gap-1.5 ${state.activeTab === tb.id ? 'tab-active' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}">${icon(tb.icon, 'sm')} <span class="hidden sm:inline">${tb.label}</span></button>`).join('')}
    </div>
  `;
}

function renderBottomNav() {
  return `
    <nav class="bottom-nav" role="tablist" aria-label="Navigation">
      ${getTabs().map(tb => `<button data-tab="${tb.id}" role="tab" aria-selected="${state.activeTab === tb.id}" aria-label="${tb.label}" class="bottom-nav-item ${state.activeTab === tb.id ? 'active' : ''}">${icon(tb.icon, 'md')}<span>${tb.label}</span></button>`).join('')}
    </nav>
  `;
}

function renderTab() {
  switch (state.activeTab) {
    case 'feed': return renderFeed();
    case 'proposals': return renderProposals();
    case 'balance': return renderBalance();
    case 'reports': return renderReports();
    case 'matches': return renderMatches();
    case 'calc': return renderCalc();
    case 'query': return renderQuery();
    case 'p2p': return renderP2P();
    case 'help': return renderHelp();
    default: return renderFeed();
  }
}

// ─── FEED ──────────────────────────────────────────────────────

function renderFeed() {
  const allEvents = [];
  state.members.forEach(m => allEvents.push({ ts: m.ts || Date.now(), type: 'member', data: m }));
  state.contributions.forEach(c => allEvents.push({ ts: c.ts, type: 'contribution', data: c }));
  state.proposals.forEach(p => { allEvents.push({ ts: p.ts, type: 'proposal', data: p }); p.approvals.forEach(a => allEvents.push({ ts: a.ts, type: 'approval', data: a, proposal: p })); });
  state.executions.forEach(e => { const p = state.proposals.find(p => p.id === e.proposalId); allEvents.push({ ts: e.ts, type: 'execution', data: e, proposal: p }); });
  allEvents.sort((a, b) => b.ts - a.ts);

  // Apply filter
  const events = state.feedFilter === 'all' ? allEvents :
    state.feedFilter === 'contributions' ? allEvents.filter(e => e.type === 'contribution') :
    state.feedFilter === 'proposals' ? allEvents.filter(e => e.type === 'proposal' || e.type === 'approval') :
    state.feedFilter === 'executions' ? allEvents.filter(e => e.type === 'execution') : allEvents;

  const quickAmounts = [50, 100, 200, 500];
  const quickPurposes = ['Bus rental', 'Tifo materials', 'Match tickets', 'Equipment', 'Charity'];

  return `
    <div class="space-y-3" data-tour="actions">
      <div class="flex gap-2">
        <button id="btn-contribute" aria-label="${t('contribute_btn')}" class="flex-1 py-2.5 px-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-smooth flex items-center justify-center gap-2">${icon('plus', 'sm')} ${t('contribute_btn')}</button>
        <button id="btn-propose" aria-label="${t('propose_btn')}" class="flex-1 py-2.5 px-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium text-sm transition-smooth flex items-center justify-center gap-2">${icon('plus', 'sm')} ${t('propose_btn')}</button>
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
            <input id="prop-payee" type="text" placeholder="Payee" maxlength="100" value="${escapeHtml(state.proposalReceipt?.payee || '')}" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
            <input id="prop-amount" type="number" placeholder="USDt amount" value="${escapeHtml(String(state.proposalReceipt?.amount || ''))}" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
            <input id="prop-purpose" type="text" placeholder="Purpose" maxlength="200" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
            <div class="flex gap-2 flex-wrap">
              ${quickPurposes.map(p => `<button data-quick-purpose="${escapeHtml(p)}" class="text-xs px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-green-100 dark:hover:bg-green-900">${escapeHtml(p)}</button>`).join('')}
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Categories (select multiple)</label>
              <div class="flex gap-2 flex-wrap" id="prop-categories">
                ${['Transport', 'Tifo', 'Equipment', 'Food', 'Tickets', 'Charity', 'Other'].map(c => `<button data-cat-toggle="${escapeHtml(c)}" class="text-xs px-3 py-1.5 rounded-full border transition-smooth ${(state.proposalCategories || []).includes(c) ? 'bg-green-600 text-white border-green-600' : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:border-green-500'}">${escapeHtml(c)}</button>`).join('')}
              </div>
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
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">${icon('list', 'sm')} ${t('auditFeedTitle')} — ${t('transparent')}</h3>
        <div class="flex gap-2 mb-3 flex-wrap">
          ${['all','contributions','proposals','executions'].map(f => `<button data-feed-filter="${f}" class="text-xs px-3 py-1.5 rounded-full transition-smooth ${state.feedFilter === f ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-green-100 dark:hover:bg-green-900'}">${t('filter' + f.charAt(0).toUpperCase() + f.slice(1))}</button>`).join('')}
        </div>
        <div class="space-y-2">
          ${events.length === 0 ? `<p class="text-center text-gray-400 py-8">${t('noActivity')}</p>` : events.slice(0, 50).map(feedItem).join('')}
        </div>
      </div>
    </div>
  `;
}

function feedItem(e, idx) {
  const time = new Date(e.ts).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const member = (id) => state.members.find(m => m.id === id);
  const clickable = 'cursor-pointer hover:ring-2 hover:ring-green-400 hover:ring-inset';
  if (e.type === 'member') return `<div data-feed-detail="${e.type}:${escapeHtml(e.data.id)}" class="${clickable} slide-in flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800"><div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-green-600 dark:text-green-400 flex-shrink-0">${icon('user', 'sm')}</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${escapeHtml(e.data.name)} joined</p><p class="text-xs text-gray-400">${escapeHtml(e.data.role)} — ${time}</p></div></div>`;
  if (e.type === 'contribution') { const m = member(e.data.memberId); return `<div data-feed-detail="${e.type}:${escapeHtml(e.data.memberId)}" class="${clickable} slide-in flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900"><div class="w-8 h-8 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center text-green-700 dark:text-green-300 flex-shrink-0">${icon('arrowUp', 'sm')}</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${escapeHtml(m ? m.name : '?')} contributed <span class="text-green-600 dark:text-green-400 font-bold">${e.data.amount} USDt</span></p><p class="text-xs text-gray-400 font-mono truncate">${shortenHash(e.data.txHash)} — ${time}</p></div><span class="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex-shrink-0">${t('onChain')}</span></div>`; }
  if (e.type === 'proposal') { const m = member(e.data.createdBy); return `<div data-feed-detail="${e.type}:${escapeHtml(e.data.id)}" class="${clickable} slide-in flex items-center gap-3 p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-100 dark:border-yellow-900"><div class="w-8 h-8 rounded-full bg-yellow-200 dark:bg-yellow-800 flex items-center justify-center text-yellow-700 dark:text-yellow-300 flex-shrink-0">${icon('proposals', 'sm')}</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${escapeHtml(m ? m.name : '?')} proposed <span class="font-bold">${e.data.amount} USDt</span> to ${escapeHtml(e.data.payee)}</p><p class="text-xs text-gray-400 truncate">${escapeHtml(e.data.purpose)} — ${time}</p></div><span class="text-xs px-2 py-1 rounded-full ${e.data.status === 'executed' ? 'badge-executed' : 'badge-pending'} flex-shrink-0">${e.data.status === 'executed' ? t('executed') : t('pending')}</span></div>`; }
  if (e.type === 'approval') { const m = member(e.data.memberId); const sigValid = e.data.sig && m && m.walletAddr ? verifySigCached(e.data, e.proposal, m) : null; return `<div data-feed-detail="${e.type}:${escapeHtml(e.data.memberId)}" class="${clickable} slide-in flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800"><div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 flex-shrink-0">${icon('check', 'sm')}</div><div class="flex-1 min-w-0"><p class="text-sm truncate">${escapeHtml(m ? m.name : '?')} approved: ${escapeHtml(e.proposal ? e.proposal.payee : '')}</p><p class="text-xs text-gray-400 font-mono truncate">${shortenHash(e.data.sig || '', 8, 6)} — ${time}</p></div>${sigValid === true ? `<span class="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex-shrink-0 flex items-center gap-1">${icon('shield', 'sm')} ${t('sigVerified')}</span>` : sigValid === false ? `<span class="text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 flex-shrink-0">${t('sigInvalid')}</span>` : ''}</div>`; }
  if (e.type === 'execution') { return `<div data-feed-detail="${e.type}:${escapeHtml(e.data.proposalId)}" class="${clickable} slide-in flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900"><div class="w-8 h-8 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-300 flex-shrink-0">${icon('arrowDown', 'sm')}</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">Executed: <span class="font-bold">${e.proposal ? e.proposal.amount : 0} USDt</span> to ${escapeHtml(e.proposal ? e.proposal.payee : '')}</p><p class="text-xs text-gray-400 font-mono truncate">${shortenHash(e.data.txHash)} — ${t('gasless')} — ${time}</p></div><span class="text-xs px-2 py-1 rounded-full badge-executed flex-shrink-0">${t('onChain')}</span></div>`; }
  return '';
}

// ─── PROPOSALS ─────────────────────────────────────────────────

function renderProposals() {
  const pending = state.proposals.filter(p => p.status === 'pending');
  const executed = state.proposals.filter(p => p.status === 'executed');
  const openDisputes = state.disputes.filter(d => d.status === 'open');
  return `<div class="space-y-4"><div><h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">${t('pending').toUpperCase()} - REQUIRES ${state.threshold} APPROVALS</h3><div class="space-y-3">${pending.length === 0 ? '<p class="text-center text-gray-400 py-8">No pending proposals</p>' : pending.map(proposalCard).join('')}</div></div>${executed.length > 0 ? `<div><h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 mt-6">${t('executed').toUpperCase()}</h3><div class="space-y-3">${executed.map(proposalCard).join('')}</div></div>` : ''}${openDisputes.length > 0 ? `<div class="mt-6"><h3 class="text-sm font-semibold text-red-500 mb-3 flex items-center gap-2">${icon('alert', 'sm')} ${t('disputeList')} (${openDisputes.length})</h3><div class="space-y-2">${openDisputes.map(d => { const p = state.proposals.find(p => p.id === d.proposalId); const m = state.members.find(m => m.id === d.filedBy); return `<div class="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900"><div class="flex items-center justify-between"><div><p class="text-sm font-medium">${escapeHtml(p ? p.payee : '?')} — ${p ? p.amount : 0} USDt</p><p class="text-xs text-red-600 dark:text-red-400 mt-1">${escapeHtml(d.reason)}</p><p class="text-xs text-gray-400 mt-1">Filed by ${escapeHtml(m ? m.name : '?')} · ${new Date(d.ts).toLocaleDateString()}</p></div><button data-resolve-dispute="${d.id}" class="px-3 py-1 rounded-lg bg-green-600 text-white text-xs">Resolve</button></div></div>`; }).join('')}</div></div>` : ''}${state.recurring.length > 0 ? `<div class="mt-6"><h3 class="text-sm font-semibold text-blue-500 dark:text-blue-400 mb-3 flex items-center gap-2">${icon('clock', 'sm')} ${t('recurringTitle')}</h3><div class="space-y-2">${state.recurring.map(r => `<div class="flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900"><div><p class="text-sm font-medium">${r.amount} USDt — ${r.interval === 'weekly' ? t('recurringWeekly') : t('recurringMonthly')}</p><p class="text-xs text-gray-400">Next: ${new Date(r.nextDue).toLocaleDateString()}</p></div><button data-cancel-recurring="${r.id}" class="text-red-400 hover:text-red-600 text-xs">${t('cancel')}</button></div>`).join('')}</div></div>` : ''}<div class="mt-6 flex gap-2"><button id="btn-add-recurring" class="flex-1 py-2 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-500 text-sm hover:border-blue-500 transition-smooth flex items-center justify-center gap-1">${icon('clock', 'sm')} ${t('recurringTitle')}</button><button id="btn-transparency" class="flex-1 py-2 rounded-xl border-2 border-dashed border-green-300 dark:border-green-700 text-green-500 text-sm hover:border-green-500 transition-smooth flex items-center justify-center gap-1">${icon('globe', 'sm')} ${t('transparencyTitle')}</button></div></div>`;
}

function proposalCard(p) {
  const hasApproved = p.approvals.some(a => a.memberId === state.currentUser);
  const canApprove = state.currentUser && !hasApproved && p.status === 'pending';
  const canExecute = p.status === 'pending' && checkThreshold(p, state.threshold);
  const progress = Math.min(100, (p.approvals.length / state.threshold) * 100);
  const receipt = state.receipts.find(r => r.proposalId === p.id);
  return `<div class="slide-in bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 card-hover transition-smooth"><div class="flex items-start justify-between gap-3"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1 flex-wrap"><span class="text-xs px-2 py-0.5 rounded-full ${p.status === 'executed' ? 'badge-executed' : 'badge-pending'}">${p.status === 'executed' ? 'executed' : 'pending'}</span>${p.category ? `<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">${escapeHtml(p.category)}</span>` : ''}</div><p class="font-semibold text-base truncate">${escapeHtml(p.payee)}</p><p class="text-sm text-gray-500 dark:text-gray-400 truncate">${escapeHtml(p.purpose)}</p><p class="text-2xl font-bold mt-2">${p.amount} <span class="text-sm font-normal text-gray-400">USDt</span></p>${receipt ? `<div class="mt-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-xs flex items-center gap-1"><span class="text-green-600 dark:text-green-400">${icon('camera', 'sm')}</span> OCR: ${escapeHtml(receipt.parsed.payee)} - ${escapeHtml(receipt.parsed.category)}</div>` : ''}</div><div class="text-right flex-shrink-0">${p.status === 'pending' ? `<p class="text-xs text-gray-400 mb-2">Approvals</p><p class="text-lg font-bold">${p.approvals.length}/${state.threshold}</p><div class="progress-bar mt-2 w-20 sm:w-24"><div class="progress-bar-fill" style="width:${progress}%"></div></div>${canApprove ? `<button data-approve="${p.id}" class="mt-3 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-smooth">Approve</button>` : ''}${hasApproved ? '<p class="text-xs text-green-600 dark:text-green-400 mt-2">Approved</p>' : ''}${canExecute ? `<button data-execute="${p.id}" class="mt-3 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium block w-full">${t('execute')}</button>` : ''}${p.status === 'executed' && !state.disputes.find(d => d.proposalId === p.id) ? `<button data-flag-dispute="${p.id}" class="mt-2 px-3 py-1 rounded-lg text-red-400 hover:text-red-600 text-xs flex items-center gap-1">${icon('alert', 'sm')} Flag</button>` : ''}` : `<p class="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">${icon('check', 'sm')} Done</p>${state.executions.find(e => e.proposalId === p.id) ? `<p class="text-xs font-mono text-gray-400 mt-1">${shortenHash(state.executions.find(e => e.proposalId === p.id).txHash)}</p>` : ''}`}</div></div>${p.approvals.length > 0 ? `<div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex gap-2 flex-wrap">${p.approvals.map(a => { const m = state.members.find(m => m.id === a.memberId); return `<span class="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center gap-1">${icon('check', 'sm')} ${escapeHtml(m ? m.name : '?')}</span>`; }).join('')}</div>` : ''}</div>`;
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

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-2 flex items-center gap-2">${icon('shield', 'sm')} On-Chain · ${getChain().name}</h4>
        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
          <div class="flex-1 min-w-0"><p class="text-xs text-gray-400">Wallet</p><p class="font-mono text-xs break-all select-all">${state.wallet.address}</p></div>
          <div class="text-right"><p class="text-xs text-gray-400">Balance</p><p id="onchain-balance" class="text-lg font-bold text-green-600 dark:text-green-400">&mdash;</p></div>
        </div>
        <div class="flex gap-2 mt-3">
          <button id="btn-refresh-chain" class="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium cursor-pointer">↻ Refresh</button>
          <a href="${getChain().explorer}/address/${state.wallet.address}" target="_blank" rel="noopener" class="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium cursor-pointer">Explorer ↗</a>
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
            ...state.contributions.slice().reverse().map(c => { const m = state.members.find(m => m.id === c.memberId); return [`IN`, htmlCell(`<span class="text-green-600 dark:text-green-400">${c.amount} USDt</span>`), escapeHtml(m ? m.name : ''), htmlCell(`<span class="font-mono text-gray-400">${shortenHash(c.txHash)}</span>`), new Date(c.ts).toLocaleDateString('en')]; }),
            ...state.executions.slice().reverse().map(e => { const p = state.proposals.find(p => p.id === e.proposalId); return [`OUT`, htmlCell(`<span class="text-blue-600 dark:text-blue-400">${p ? p.amount : 0} USDt</span>`), escapeHtml(p ? p.payee : ''), htmlCell(`<span class="font-mono text-gray-400">${shortenHash(e.txHash)}</span>`), new Date(e.ts).toLocaleDateString('en')]; }),
          ]
        )}
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-semibold flex items-center gap-2">${icon('note', 'sm')} Notes</h4>
          <span class="text-xs text-gray-400">Stored locally on device</span>
        </div>
        <div class="flex gap-2 mb-3">
          <input id="note-input" type="text" placeholder="Add a note..." maxlength="500" value="${escapeHtml(state.noteInput)}" class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
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

// ─── MATCHES ───────────────────────────────────────────────────

function renderMatches() {
  const finished = state.matches.filter(m => m.status === 'finished').sort((a, b) => b.date - a.date);
  const upcoming = state.matches.filter(m => m.status === 'upcoming').sort((a, b) => a.date - b.date);
  const wins = finished.filter(m => m.home ? m.scoreHome > m.scoreAway : m.scoreAway > m.scoreHome).length;
  const draws = finished.filter(m => m.scoreHome === m.scoreAway).length;
  const losses = finished.filter(m => m.home ? m.scoreHome < m.scoreAway : m.scoreAway < m.scoreHome).length;
  const goalsFor = finished.reduce((s, m) => s + (m.home ? m.scoreHome : m.scoreAway), 0);
  const goalsAgainst = finished.reduce((s, m) => s + (m.home ? m.scoreAway : m.scoreHome), 0);

  // Venues
  const venues = {};
  state.matches.forEach(m => {
    if (!venues[m.venue]) venues[m.venue] = { name: m.venue, games: 0, capacity: m.venue.includes('Estadio') ? 5000 : 800 };
    venues[m.venue].games++;
  });

  return `
    <div class="space-y-4">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 text-center">
          <p class="text-xs text-gray-400">Played</p>
          <p class="text-2xl font-bold">${finished.length}</p>
        </div>
        <div class="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 text-center">
          <p class="text-xs text-gray-400">W / D / L</p>
          <p class="text-lg font-bold"><span class="text-green-600">${wins}</span> / <span class="text-gray-500">${draws}</span> / <span class="text-red-500">${losses}</span></p>
        </div>
        <div class="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 text-center">
          <p class="text-xs text-gray-400">Goals For</p>
          <p class="text-2xl font-bold text-green-600">${goalsFor}</p>
        </div>
        <div class="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 text-center">
          <p class="text-xs text-gray-400">Goals Against</p>
          <p class="text-2xl font-bold text-red-500">${goalsAgainst}</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('clock', 'sm')} Upcoming Matches</h4>
        <div class="space-y-2">
          ${upcoming.length === 0 ? '<p class="text-sm text-gray-400 text-center py-4">No upcoming matches</p>' :
            upcoming.map(m => {
              const d = new Date(m.date);
              const daysAway = Math.ceil((m.date - Date.now()) / 86400000);
              return `<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 slide-in">
                <div class="text-center flex-shrink-0 w-12">
                  <p class="text-xs text-gray-400">${d.toLocaleDateString('en', { month: 'short' })}</p>
                  <p class="text-lg font-bold">${d.getDate()}</p>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-sm truncate">${escapeHtml(m.opponent)}</p>
                  <p class="text-xs text-gray-400 truncate">${escapeHtml(m.venue)} - ${m.home ? 'Home' : 'Away'}</p>
                </div>
                <span class="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex-shrink-0">${daysAway}d</span>
              </div>`;
            }).join('')
          }
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('star', 'sm')} Results History</h4>
        ${sortableTable(
          [{ label: 'Date' }, { label: 'Opponent' }, { label: 'Venue' }, { label: 'Score' }, { label: 'Result' }],
          finished.map(m => {
            const d = new Date(m.date).toLocaleDateString('en', { month: 'short', day: 'numeric' });
            const ourScore = m.home ? m.scoreHome : m.scoreAway;
            const oppScore = m.home ? m.scoreAway : m.scoreHome;
            const result = ourScore > oppScore ? htmlCell('<span class="text-green-600 font-medium">W</span>') : ourScore === oppScore ? htmlCell('<span class="text-gray-500">D</span>') : htmlCell('<span class="text-red-500 font-medium">L</span>');
            return [d, escapeHtml(m.opponent), escapeHtml(m.venue), `${ourScore} - ${oppScore}`, result];
          })
        )}
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('globe', 'sm')} Venues</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${Object.values(venues).map(v => `
            <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-sm">${escapeHtml(v.name)}</p>
                  <p class="text-xs text-gray-400">${v.games} match${v.games !== 1 ? 'es' : ''} scheduled</p>
                </div>
                <div class="text-right">
                  <p class="text-xs text-gray-400">Capacity</p>
                  <p class="text-sm font-medium">${v.capacity.toLocaleString()}</p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('wallet', 'sm')} Budget Tracker</h4>
        <div class="space-y-3">
          ${state.tifoBudgets.length === 0 ? '<p class="text-sm text-gray-400 text-center py-4">No active budgets</p>' :
            state.tifoBudgets.map(b => {
              const pct = b.goal > 0 ? Math.min(100, Math.round(b.spent / b.goal * 100)) : 0;
              const remaining = Math.max(0, b.goal - b.spent);
              const daysLeft = Math.max(0, Math.ceil((b.deadline - Date.now()) / 86400000));
              const urgent = daysLeft <= 3;
              return `<div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">${escapeHtml(b.category)}</span>
                    <p class="font-medium text-sm">${escapeHtml(b.name)}</p>
                  </div>
                  <span class="text-xs ${urgent ? 'text-red-500 font-bold' : 'text-gray-400'}">${daysLeft}d left</span>
                </div>
                <div class="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>${b.spent} / ${b.goal} USDt</span>
                  <span>${pct}%</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-bar-fill" style="width:${pct}%;background:${pct >= 100 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#00a86b'}"></div>
                </div>
                <p class="text-xs text-gray-400 mt-1">Remaining: ${remaining} USDt · Deadline: ${new Date(b.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</p>
              </div>`;
            }).join('')
          }
          <button id="btn-add-budget" class="w-full py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 text-sm hover:border-green-500 hover:text-green-500 transition-smooth">+ Add Budget Goal</button>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('trending', 'sm')} Form Guide</h4>
        <div class="flex gap-2">
          ${finished.slice(-5).reverse().map(m => {
            const ourScore = m.home ? m.scoreHome : m.scoreAway;
            const oppScore = m.home ? m.scoreAway : m.scoreHome;
            const result = ourScore > oppScore ? 'W' : ourScore === oppScore ? 'D' : 'L';
            const color = result === 'W' ? 'bg-green-600' : result === 'D' ? 'bg-gray-500' : 'bg-red-500';
            return `<div class="w-10 h-10 rounded-lg ${color} text-white flex items-center justify-center font-bold text-sm">${result}</div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ─── CALCULATORS ───────────────────────────────────────────────

function renderCalc() {
  const members = state.members.length || 4;
  const balance = state.balance;
  const totalExpenses = state.proposals.filter(p => p.status === 'executed').reduce((s, p) => s + p.amount, 0);

  return `
    <div class="space-y-4">
      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-4 flex items-center gap-2">${icon('chart', 'md')} Expense Splitter</h4>
        <p class="text-xs text-gray-400 mb-3">Calculate how much each member pays for a shared expense</p>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Total expense (USDt)</label>
            <input id="split-amount" type="number" placeholder="e.g. 450" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Number of members</label>
            <input id="split-members" type="number" value="${members}" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
          </div>
          <button id="btn-split-calc" class="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm">Calculate Split</button>
          <div id="split-result" class="mt-3"></div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-4 flex items-center gap-2">${icon('wallet', 'md')} Contribution Target Calculator</h4>
        <p class="text-xs text-gray-400 mb-3">How much should each member contribute to reach a goal?</p>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Target amount (USDt)</label>
            <input id="target-amount" type="number" placeholder="e.g. 2000" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:border-green-500">
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Current balance: ${balance} USDt</label>
          </div>
          <button id="btn-target-calc" class="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm">Calculate</button>
          <div id="target-result" class="mt-3"></div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-4 flex items-center gap-2">${icon('trending', 'md')} Treasury Health Score</h4>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <p class="text-xs text-gray-400">Total collected</p>
              <p class="text-xl font-bold text-blue-600 dark:text-blue-400">${balance + totalExpenses} USDt</p>
            </div>
            <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <p class="text-xs text-gray-400">Total spent</p>
              <p class="text-xl font-bold text-orange-600 dark:text-orange-400">${totalExpenses} USDt</p>
            </div>
            <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <p class="text-xs text-gray-400">Avg contribution</p>
              <p class="text-xl font-bold">${state.contributions.length > 0 ? Math.round((balance + totalExpenses) / state.contributions.length) : 0} USDt</p>
            </div>
            <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <p class="text-xs text-gray-400">Spend rate</p>
              <p class="text-xl font-bold">${balance + totalExpenses > 0 ? Math.round(totalExpenses / (balance + totalExpenses) * 100) : 0}%</p>
            </div>
          </div>
          ${(() => {
            // Treasury Health Score Algorithm
            // Factors: reserve ratio (40%), contributor diversity (20%), approval rate (20%), dispute rate (10%), budget adherence (10%)
            const total = balance + totalExpenses;
            const reserveRatio = total > 0 ? balance / total : 1;
            const reserveScore = Math.min(100, reserveRatio * 200); // 50%+ reserve = 100

            const uniqueContributors = new Set(state.contributions.map(c => c.memberId)).size;
            const diversityScore = members > 0 ? Math.min(100, (uniqueContributors / members) * 100) : 0;

            const approvedCount = state.proposals.filter(p => p.approvals && p.approvals.length >= state.threshold).length;
            const approvalScore = state.proposals.length > 0 ? (approvedCount / state.proposals.length) * 100 : 100;

            const openDisputes = state.disputes.filter(d => d.status === 'open').length;
            const disputeScore = state.proposals.length > 0 ? Math.max(0, 100 - (openDisputes / state.proposals.length) * 200) : 100;

            const overBudget = state.tifoBudgets.filter(b => b.spent > b.goal).length;
            const budgetScore = state.tifoBudgets.length > 0 ? Math.max(0, 100 - (overBudget / state.tifoBudgets.length) * 100) : 100;

            const healthScore = Math.round(reserveScore * 0.4 + diversityScore * 0.2 + approvalScore * 0.2 + disputeScore * 0.1 + budgetScore * 0.1);
            const health = healthScore >= 75 ? { label: 'Excellent', color: 'text-green-600', bg: '#00a86b' } :
                          healthScore >= 50 ? { label: 'Good', color: 'text-blue-600', bg: '#2563eb' } :
                          healthScore >= 30 ? { label: 'Moderate', color: 'text-yellow-600', bg: '#f59e0b' } :
                          { label: 'At Risk', color: 'text-red-500', bg: '#ef4444' };
            return `<div class="mt-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
              <div class="flex items-center justify-between mb-2">
                <span class="${health.color} font-bold text-lg">${healthScore}/100</span>
                <span class="${health.color} font-medium text-sm">${health.label}</span>
              </div>
              <div class="progress-bar mb-3"><div class="progress-bar-fill" style="width:${healthScore}%;background:${health.bg}"></div></div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="flex justify-between"><span class="text-gray-400">Reserve ratio</span><span>${Math.round(reserveScore)}%</span></div>
                <div class="flex justify-between"><span class="text-gray-400">Contributor diversity</span><span>${Math.round(diversityScore)}%</span></div>
                <div class="flex justify-between"><span class="text-gray-400">Approval rate</span><span>${Math.round(approvalScore)}%</span></div>
                <div class="flex justify-between"><span class="text-gray-400">Dispute rate</span><span>${Math.round(disputeScore)}%</span></div>
              </div>
            </div>`;
          })()}
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-4 flex items-center gap-2">${icon('users', 'md')} Per-Member Cost Projection</h4>
        <p class="text-xs text-gray-400 mb-3">Project monthly cost per member based on current spending</p>
        ${(() => {
          const monthlyAvg = totalExpenses / 3; // rough monthly average from ~3 months of data
          const perMember = members > 0 ? Math.round(monthlyAvg / members) : 0;
          const recommended = Math.ceil(perMember / 50) * 50; // round up to nearest 50
          return `
            <div class="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
              <p class="text-sm text-green-700 dark:text-green-300">Based on current spending patterns:</p>
              <p class="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">${perMember} USDt<span class="text-sm font-normal text-gray-400">/member/month</span></p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Recommended monthly contribution: <strong>${recommended} USDt</strong> per member to maintain healthy balance</p>
            </div>
          `;
        })()}
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
  const notifStatus = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return `
    <div class="space-y-4">
      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-semibold flex items-center gap-2">${icon('bell', 'sm')} Notifications</h4>
          <span class="text-xs px-2 py-1 rounded-full ${notifStatus === 'granted' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}">${notifStatus === 'granted' ? 'Enabled' : notifStatus === 'denied' ? 'Blocked' : 'Off'}</span>
        </div>
        ${notifStatus !== 'granted' ? `<button id="btn-enable-notif" class="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">Enable Push Notifications</button>` : `<p class="text-xs text-gray-400">You'll be notified of new P2P activity, approvals, and disputes.</p>`}
      </div>
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
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('shield', 'sm')} Signature Verification</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Every approval signature is cryptographically verified against the member's wallet address using EIP-191.</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('alert', 'sm')} Dispute Resolution</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Flag executed proposals for review. Disputes are tracked with reason and status until resolved by the group.</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('clock', 'sm')} Recurring Contributions</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Set up weekly or monthly auto-contributions. Manage active schedules from the Proposals tab.</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('globe', 'sm')} Public Transparency</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Generate a shareable HTML page with treasury summary, categories, contributions, and proposals — perfect for sponsors.</p></div>
          <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="font-medium text-sm flex items-center gap-2">${icon('users', 'sm')} Roles & Budget Limits</p><p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Members have roles (Founder, Approver, Member, Viewer) with per-role proposal limits. Founder: unlimited, Approver: 5000, Member: 500.</p></div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('database', 'md')} Data Storage</h4>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Wallet keys:</strong> Stored in browser localStorage on your device only. Never transmitted to any server.</p>
          <p><strong>Ledger events:</strong> Persisted in localStorage and synced via P2P. Events survive page reloads. In production, backed by Hypercore/Corestore.</p>
          <p><strong>Notes:</strong> Stored in browser localStorage on your device.</p>
          <p><strong>Receipts:</strong> Processed locally by Tesseract.js OCR. Images are not stored or transmitted.</p>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('rocket', 'md')} Architecture & Deployment</h4>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Current:</strong> Static PWA deployed to Vercel. Works in any modern browser. Installable on mobile via Add to Home Screen. No backend server required — all data stays on-device.</p>
          <p><strong>Production target:</strong> Pear runtime app (Holepunch). Runs as a native desktop and mobile application with full Autobase + Hyperswarm P2P stack. Distributed as a Pear link or packaged APK. Zero hosting, zero server costs.</p>
          <p><strong>Account model:</strong> No accounts needed. Each user generates a self-custody wallet locally. Groups form via P2P invite codes (QR or copy-paste). No email, no password, no KYC.</p>
          <p><strong>Vertical scaling:</strong> Multi-chain support (Solana, TON, TRON via WDK). Subgroup treasuries. Recurring contributions. Budget limits per category. Time-locked proposals. Match-linked expenses.</p>
          <p><strong>Horizontal scaling:</strong> Federation of fan group treasuries. Cross-group payments for shared events. Public transparency pages for sponsors. Integration with fan club management tools.</p>
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
        <h4 class="font-semibold mb-3 flex items-center gap-2">${icon('globe', 'md')} Language / Idioma</h4>
        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>PEÑA supports <strong>English</strong> and <strong>Spanish</strong>. Toggle with the language button in the header bar.</p>
          <p>PEÑA soporta <strong>Inglés</strong> y <strong>Español</strong>. Cambia el idioma con el botón en la barra superior.</p>
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
// FEED DETAIL MODAL
// ═══════════════════════════════════════════════════════════════

function showFeedDetail(type, id) {
  let title = '', body = '';
  if (type === 'member') {
    const m = state.members.find(m => m.id === id);
    if (!m) return;
    const contribs = state.contributions.filter(c => c.memberId === id);
    const totalContrib = contribs.reduce((s, c) => s + c.amount, 0);
    const proposals = state.proposals.filter(p => p.createdBy === id);
    const approvals = state.proposals.reduce((s, p) => s + p.approvals.filter(a => a.memberId === id).length, 0);
    title = escapeHtml(m.name);
    body = `<div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Role</p><p class="font-medium text-sm">${escapeHtml(m.role)}</p></div>
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Total Contributed</p><p class="font-medium text-sm">${totalContrib} USDt</p></div>
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Proposals</p><p class="font-medium text-sm">${proposals.length}</p></div>
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Approvals</p><p class="font-medium text-sm">${approvals}</p></div>
      </div>
      <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400 mb-1">Wallet</p><p class="font-mono text-xs break-all">${escapeHtml(m.walletAddr || '')}</p></div>
    </div>`;
  } else if (type === 'contribution') {
    const contribs = state.contributions.filter(c => c.memberId === id);
    const m = state.members.find(m => m.id === id);
    title = `Contribution — ${escapeHtml(m ? m.name : '?')}`;
    body = `<div class="space-y-2">${contribs.map(c => `<div class="flex justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/30"><div><p class="text-sm font-medium">${c.amount} USDt</p><p class="text-xs text-gray-400">${new Date(c.ts).toLocaleString()}</p></div><p class="font-mono text-xs text-gray-400">${escapeHtml(c.txHash || '')}</p></div>`).join('')}</div>`;
  } else if (type === 'proposal') {
    const p = state.proposals.find(p => p.id === id);
    if (!p) return;
    const creator = state.members.find(m => m.id === p.createdBy);
    title = `Proposal — ${escapeHtml(p.payee)}`;
    body = `<div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Amount</p><p class="font-bold text-lg">${p.amount} USDt</p></div>
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Status</p><p class="font-medium text-sm">${p.status}</p></div>
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Category</p><p class="font-medium text-sm">${escapeHtml(p.category || 'Other')}</p></div>
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Created by</p><p class="font-medium text-sm">${escapeHtml(creator ? creator.name : '?')}</p></div>
      </div>
      <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Purpose</p><p class="text-sm">${escapeHtml(p.purpose)}</p></div>
      <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Date</p><p class="text-sm">${new Date(p.ts).toLocaleString()}</p></div>
      ${p.approvals.length > 0 ? `<div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400 mb-2">Approvals (${p.approvals.length}/${state.threshold})</p>${p.approvals.map(a => { const am = state.members.find(m => m.id === a.memberId); return `<p class="text-xs font-mono">${escapeHtml(am ? am.name : '?')} — ${shortenHash(a.sig || '', 8, 6)}</p>`; }).join('')}</div>` : ''}
    </div>`;
  } else if (type === 'approval') {
    const m = state.members.find(m => m.id === id);
    title = `Approval — ${escapeHtml(m ? m.name : '?')}`;
    const approved = state.proposals.filter(p => p.approvals.some(a => a.memberId === id));
    body = `<div class="space-y-2">${approved.map(p => `<div class="flex justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><div><p class="text-sm font-medium">${escapeHtml(p.payee)} — ${p.amount} USDt</p><p class="text-xs text-gray-400">${escapeHtml(p.purpose)}</p></div><span class="text-xs px-2 py-1 rounded-full ${p.status === 'executed' ? 'badge-executed' : 'badge-pending'}">${p.status}</span></div>`).join('')}</div>`;
  } else if (type === 'execution') {
    const p = state.proposals.find(p => p.id === id);
    const ex = state.executions.find(e => e.proposalId === id);
    title = `Execution — ${escapeHtml(p ? p.payee : '?')}`;
    body = `<div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Amount</p><p class="font-bold text-lg">${p ? p.amount : 0} USDt</p></div>
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Payee</p><p class="font-medium text-sm">${escapeHtml(p ? p.payee : '?')}</p></div>
      </div>
      ${ex ? `<div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Tx Hash</p><p class="font-mono text-xs break-all">${escapeHtml(ex.txHash || '')}</p></div>
      <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"><p class="text-xs text-gray-400">Date</p><p class="text-sm">${new Date(ex.ts).toLocaleString()}</p></div>` : ''}
    </div>`;
  }
  if (title) showModal(title, body);
}

// ═══════════════════════════════════════════════════════════════
// EVENT BINDING
// ═══════════════════════════════════════════════════════════════

function bindEvents() {
  // Tabs
  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => { state.activeTab = btn.dataset.tab; state.showContribute = false; state.showProposal = false; window.location.hash = btn.dataset.tab; render(); }));

  // Feed filter
  document.querySelectorAll('[data-feed-filter]').forEach(btn => btn.addEventListener('click', () => { state.feedFilter = btn.dataset.feedFilter; render(); }));

  // Feed detail click
  document.querySelectorAll('[data-feed-detail]').forEach(el => el.addEventListener('click', () => {
    const [type, id] = el.dataset.feedDetail.split(':');
    showFeedDetail(type, id);
  }));

  // Mode toggle
  document.querySelectorAll('[data-mode-toggle]').forEach(btn => btn.addEventListener('click', () => { switchMode(state.mode === 'demo' ? 'real' : 'demo'); }));

  // Theme toggle
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => btn.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('pena_theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    render();
  }));

  // Contribute
  const bc = document.getElementById('btn-contribute'); if (bc) bc.addEventListener('click', () => { state.showContribute = !state.showContribute; state.showProposal = false; render(); });
  const bcOk = document.getElementById('btn-contrib-ok'); if (bcOk) bcOk.addEventListener('click', () => doContribute(state, parseInt(document.getElementById('contrib-amount').value, 10), render));
  const bcCancel = document.getElementById('btn-contrib-cancel'); if (bcCancel) bcCancel.addEventListener('click', () => { state.showContribute = false; render(); });
  document.querySelectorAll('[data-quick-amount]').forEach(btn => btn.addEventListener('click', () => { const inp = document.getElementById('contrib-amount'); if (inp) { inp.value = btn.dataset.quickAmount; } }));

  // Propose
  const bp = document.getElementById('btn-propose'); if (bp) bp.addEventListener('click', () => { state.showProposal = !state.showProposal; state.showContribute = false; render(); });
  const bpOk = document.getElementById('btn-prop-ok'); if (bpOk) bpOk.addEventListener('click', () => { const payee = document.getElementById('prop-payee').value.trim(); const amount = parseInt(document.getElementById('prop-amount').value, 10); const purpose = document.getElementById('prop-purpose').value.trim(); doCreateProposal(state, payee, amount, purpose, state.proposalReceipt?.category, render); });
  const bpCancel = document.getElementById('btn-prop-cancel'); if (bpCancel) bpCancel.addEventListener('click', () => { state.showProposal = false; state.proposalReceipt = null; render(); });
  document.querySelectorAll('[data-quick-purpose]').forEach(btn => btn.addEventListener('click', () => { const inp = document.getElementById('prop-purpose'); if (inp) inp.value = btn.dataset.quickPurpose; }));
  document.querySelectorAll('[data-cat-toggle]').forEach(btn => btn.addEventListener('click', () => { const cat = btn.dataset.catToggle; const idx = state.proposalCategories.indexOf(cat); if (idx >= 0) state.proposalCategories.splice(idx, 1); else state.proposalCategories.push(cat); render(); }));

  // Receipt upload
  const ru = document.getElementById('receipt-upload'); if (ru) ru.addEventListener('click', () => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = (e) => { if (e.target.files[0]) doParseReceipt(state, e.target.files[0], render); }; input.click(); });

  // Approve / Execute
  document.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', () => doApprove(state, btn.dataset.approve, render)));
  document.querySelectorAll('[data-execute]').forEach(btn => btn.addEventListener('click', () => doExecute(state, btn.dataset.execute, render)));

  // NL Query
  const nl = document.getElementById('btn-nl'); if (nl) nl.addEventListener('click', () => { const v = document.getElementById('nl-input').value.trim(); if (v) doNLQuery(state, v, render); });
  const nlIn = document.getElementById('nl-input'); if (nlIn) nlIn.addEventListener('keypress', (e) => { if (e.key === 'Enter') { const v = nlIn.value.trim(); if (v) doNLQuery(state, v, render); } });
  document.querySelectorAll('[data-suggest]').forEach(btn => btn.addEventListener('click', () => doNLQuery(state, btn.dataset.suggest, render)));
  const nlCopy = document.getElementById('btn-nl-copy'); if (nlCopy) nlCopy.addEventListener('click', () => { copyToClipboard(state.nlResult).then(() => showToast('Copied', 'success')); });

  // Notes
  const noteAdd = document.getElementById('btn-note-add'); if (noteAdd) noteAdd.addEventListener('click', () => { const inp = document.getElementById('note-input'); if (inp) addNote(state, inp.value, render); });
  const noteIn = document.getElementById('note-input'); if (noteIn) noteIn.addEventListener('keypress', (e) => { if (e.key === 'Enter') addNote(noteIn.value); });
  document.querySelectorAll('[data-note-delete]').forEach(btn => btn.addEventListener('click', () => deleteNote(state, parseInt(btn.dataset.noteDelete, 10), render)));

  // On-chain balance refresh
  const refreshChain = document.getElementById('btn-refresh-chain');
  if (refreshChain) refreshChain.addEventListener('click', async () => {
    const el = document.getElementById('onchain-balance');
    if (el) el.textContent = '...';
    try { const b = await getOnChainBalance(state.wallet.address); if (el) el.textContent = b.display + ' ' + b.symbol; } catch { if (el) el.textContent = 'error'; }
  });
  // Auto-load on-chain balance
  if (document.getElementById('onchain-balance')) {
    getOnChainBalance(state.wallet.address).then(b => { const el = document.getElementById('onchain-balance'); if (el) el.textContent = b.display + ' ' + b.symbol; }).catch(() => {});
  }

  // Reports
  const reportDl = document.getElementById('btn-report-download'); if (reportDl) reportDl.addEventListener('click', () => downloadReport(state));
  const reportCopy = document.getElementById('btn-report-copy'); if (reportCopy) reportCopy.addEventListener('click', () => { copyToClipboard(generateReport(state)).then(() => showToast('Report copied', 'success')); });

  // Copy buttons
  document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => { copyToClipboard(btn.dataset.copy).then(() => showToast('Copied to clipboard', 'success')); }));

  // WebRTC
  const rtcOffer = document.getElementById('btn-rtc-offer'); if (rtcOffer) rtcOffer.addEventListener('click', async () => { const sdp = await state.p2p?.createOffer(); state.rtcOffer = sdp || ''; render(); });
  const rtcConnect = document.getElementById('btn-rtc-connect'); if (rtcConnect) rtcConnect.addEventListener('click', async () => { const sdp = document.getElementById('rtc-answer-input').value.trim(); if (sdp && state.p2p) { const ok = await state.p2p.connectWithAnswer(sdp); showToast(ok ? 'WebRTC connected' : 'WebRTC error', ok ? 'success' : 'error'); } });

  // Budget tracker
  const addBudget = document.getElementById('btn-add-budget');
  if (addBudget) addBudget.addEventListener('click', () => {
    showModal('New Budget Goal', `
      <div class="space-y-3">
        <input id="budget-name" type="text" placeholder="Budget name (e.g. Flags for Derby)" maxlength="80" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm">
        <input id="budget-goal" type="number" placeholder="Goal amount (USDt)" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm">
        <input id="budget-deadline" type="date" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm">
        <select id="budget-cat" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm">
          <option value="Tifo">Tifo</option><option value="Transport">Transport</option><option value="Equipment">Equipment</option><option value="Tickets">Tickets</option><option value="Other">Other</option>
        </select>
        <button id="budget-save" class="w-full py-2 rounded-lg bg-green-600 text-white font-medium text-sm">Create Budget</button>
      </div>
    `);
    setTimeout(() => {
      const save = document.getElementById('budget-save');
      if (save) save.addEventListener('click', () => {
        const name = document.getElementById('budget-name')?.value?.trim();
        const goal = parseFloat(document.getElementById('budget-goal')?.value || '0');
        const deadline = document.getElementById('budget-deadline')?.value;
        const cat = document.getElementById('budget-cat')?.value || 'Other';
        if (!name || goal <= 0) { showToast('Fill name and goal', 'error'); return; }
        state.tifoBudgets.push({ id: 'tb' + Date.now(), name, goal, spent: 0, deadline: deadline ? new Date(deadline).getTime() : Date.now() + 86400000 * 30, category: cat });
        secureSet('pena_tifo_budgets', JSON.stringify(state.tifoBudgets));
        closeModal(); render(); showToast('Budget created', 'success');
      });
    }, 100);
  });

  // Enable notifications
  const notifBtn = document.getElementById('btn-enable-notif');
  if (notifBtn) notifBtn.addEventListener('click', async () => { await requestNotifications(); render(); });

  // Language toggle
  document.querySelectorAll('[data-lang-toggle]').forEach(btn => btn.addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'es' : 'en';
    setLang(state.lang);
    localStorage.setItem('pena_lang', state.lang);
    render();
  }));

  // Dispute flag
  document.querySelectorAll('[data-flag-dispute]').forEach(btn => btn.addEventListener('click', () => {
    const pid = btn.dataset.flagDispute;
    showModal(t('disputeTitle'), `
      <div class="space-y-3">
        <textarea id="dispute-reason" placeholder="${t('disputeReason')}" maxlength="300" class="w-full h-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"></textarea>
        <button id="dispute-submit" class="w-full py-2 rounded-lg bg-red-600 text-white font-medium text-sm">${t('disputeSubmit')}</button>
      </div>
    `);
    setTimeout(() => {
      const sub = document.getElementById('dispute-submit');
      if (sub) sub.addEventListener('click', () => {
        const reason = document.getElementById('dispute-reason')?.value;
        flagDispute(state, pid, reason, render);
        closeModal();
      });
    }, 100);
  }));

  // Resolve dispute
  document.querySelectorAll('[data-resolve-dispute]').forEach(btn => btn.addEventListener('click', () => resolveDispute(state, btn.dataset.resolveDispute, render)));

  // Cancel recurring
  document.querySelectorAll('[data-cancel-recurring]').forEach(btn => btn.addEventListener('click', () => cancelRecurring(state, btn.dataset.cancelRecurring, render)));

  // Add recurring
  const addRec = document.getElementById('btn-add-recurring');
  if (addRec) addRec.addEventListener('click', () => {
    showModal(t('recurringTitle'), `
      <div class="space-y-3">
        <input id="recurring-amount" type="number" placeholder="${t('amount')} (USDt)" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm">
        <select id="recurring-interval" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm">
          <option value="weekly">${t('recurringWeekly')}</option>
          <option value="monthly">${t('recurringMonthly')}</option>
        </select>
        <button id="recurring-save" class="w-full py-2 rounded-lg bg-blue-600 text-white font-medium text-sm">${t('create')}</button>
      </div>
    `);
    setTimeout(() => {
      const save = document.getElementById('recurring-save');
      if (save) save.addEventListener('click', () => {
        const amt = parseFloat(document.getElementById('recurring-amount')?.value || '0');
        const interval = document.getElementById('recurring-interval')?.value || 'monthly';
        addRecurring(state, amt, interval, render);
        closeModal();
      });
    }, 100);
  });

  // Transparency download
  const transBtn = document.getElementById('btn-transparency');
  if (transBtn) transBtn.addEventListener('click', () => downloadTransparency(state));

  // Sortable tables
  document.querySelectorAll('table[id^="sortable-table-"]').forEach(t => attachSortable(t.id));

  // Calculators
  const splitCalc = document.getElementById('btn-split-calc');
  if (splitCalc) splitCalc.addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('split-amount')?.value || '0');
    const members = parseInt(document.getElementById('split-members')?.value || '0', 10);
    const result = document.getElementById('split-result');
    if (!result || amount <= 0 || members <= 0) { if (result) result.innerHTML = '<p class="text-sm text-red-500">Enter valid values</p>'; return; }
    const perPerson = (amount / members).toFixed(2);
    result.innerHTML = `<div class="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900"><p class="text-sm text-green-700 dark:text-green-300">Each member pays:</p><p class="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">${perPerson} <span class="text-sm font-normal">USDt</span></p><p class="text-xs text-gray-400 mt-2">${amount} USDt / ${members} members = ${perPerson} USDt each</p></div>`;
  });

  const targetCalc = document.getElementById('btn-target-calc');
  if (targetCalc) targetCalc.addEventListener('click', () => {
    const target = parseFloat(document.getElementById('target-amount')?.value || '0');
    const members = state.members.length || 4;
    const result = document.getElementById('target-result');
    if (!result || target <= 0) { if (result) result.innerHTML = '<p class="text-sm text-red-500">Enter a valid target</p>'; return; }
    const remaining = target - state.balance;
    if (remaining <= 0) {
      result.innerHTML = `<div class="p-4 rounded-lg bg-green-50 dark:bg-green-950/30"><p class="text-sm text-green-700 dark:text-green-300">Target already reached!</p><p class="text-lg font-bold text-green-600 mt-1">Surplus: ${Math.abs(remaining)} USDt</p></div>`;
    } else {
      const perMember = (remaining / members).toFixed(2);
      result.innerHTML = `<div class="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900"><p class="text-sm text-blue-700 dark:text-blue-300">Remaining to target:</p><p class="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">${remaining} <span class="text-sm font-normal">USDt</span></p><p class="text-sm text-blue-600 dark:text-blue-400 mt-2">Each member needs to contribute:</p><p class="text-3xl font-bold text-blue-600 dark:text-blue-400">${perMember} <span class="text-sm font-normal">USDt</span></p></div>`;
    }
  });
}


// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

async function showPinScreen() {
  const app = document.getElementById('app');
  const skeleton = document.getElementById('skeleton');
  if (skeleton) skeleton.style.display = 'none';
  if (app) app.style.display = 'block';

  const isNew = !hasPin();
  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="w-full max-w-sm text-center">
        <img src="/assets/pena.png" alt="PEÑA" class="w-20 h-20 rounded-2xl mx-auto mb-4">
        <h1 class="text-2xl font-bold mb-1">PEÑA</h1>
        <p class="text-gray-500 dark:text-gray-400 text-sm mb-6">${isNew ? t('pinCreate') : t('pinEnter')}</p>
        <input id="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="${isNew ? '4-8 digit PIN' : 'PIN'}"
          class="w-full text-center text-2xl tracking-widest px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:border-green-500 focus:outline-none mb-4">
        ${isNew ? `<input id="pin-confirm" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Confirm PIN"
          class="w-full text-center text-2xl tracking-widest px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:border-green-500 focus:outline-none mb-4">` : ''}
        <button id="pin-submit" class="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-smooth">
          ${isNew ? t('pinCreateBtn') : t('pinUnlockBtn')}
        </button>
        <p id="pin-error" class="text-red-500 text-xs mt-3 hidden"></p>
        <p class="text-gray-400 text-xs mt-4">${icon('shield', 'sm')} AES-256-GCM</p>
      </div>
    </div>
  `;

  const pinInput = document.getElementById('pin-input');
  const pinConfirm = document.getElementById('pin-confirm');
  const pinSubmit = document.getElementById('pin-submit');
  const pinError = document.getElementById('pin-error');

  pinInput.focus();

  const submit = async () => {
    const pin = pinInput.value.trim();
    if (pin.length < 4) { pinError.textContent = t('pinTooShort'); pinError.classList.remove('hidden'); return; }
    if (isNew && pinConfirm) {
      if (pin !== pinConfirm.value.trim()) { pinError.textContent = t('pinMismatch'); pinError.classList.remove('hidden'); return; }
    }
    try {
      await initCrypto(pin);
      await init();
    } catch (e) {
      if (e.message === 'wrong_pin') {
        pinError.textContent = t('pinWrong');
        pinError.classList.remove('hidden');
        pinInput.value = '';
        pinInput.focus();
      } else {
        throw e;
      }
    }
  };

  pinSubmit.addEventListener('click', submit);
  const lastInput = pinConfirm || pinInput;
  lastInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

try {
  showPinScreen();
} catch (err) {
  console.error('PEÑA init error:', err);
  const app = document.getElementById('app');
  const skeleton = document.getElementById('skeleton');
  if (skeleton) skeleton.style.display = 'none';
  if (app) {
    app.style.display = 'block';
    app.innerHTML = '<div style="padding:2rem;text-align:center;font-family:system-ui,sans-serif"><h2 style="font-size:1.5rem;font-weight:bold">PEÑA</h2><p style="color:#666;max-width:400px;margin:1rem auto">Failed to initialize: ' + escapeText(err.message || 'unknown error') + '</p><button id="pena-error-reload" style="padding:0.5rem 1rem;background:#00a86b;color:white;border:none;border-radius:0.5rem;cursor:pointer">Reload</button></div>';
    const reloadBtn = document.getElementById('pena-error-reload');
    if (reloadBtn) reloadBtn.addEventListener('click', () => location.reload());
  }
}

window.addEventListener('error', (e) => { console.error('PEÑA runtime error:', e.error || e.message); try { showToast('Something went wrong. Please reload.', 'error'); } catch {} });
window.addEventListener('unhandledrejection', (e) => { console.error('PEÑA unhandled promise:', e.reason); e.preventDefault(); try { showToast('Something went wrong. Please reload.', 'error'); } catch {} });
