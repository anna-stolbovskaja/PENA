// PEÑA — Action Handlers
// Treasury actions: contribute, propose, approve, execute, receipts, disputes, recurring

import { EVENT_TYPES, createEvent, applyEvent, getCategorySummary, getMemberContributions, escapeHtml, sanitizeAmount } from './ledger.js';
import { signMessage, signTransferAuthorization, checkThreshold, simulateTxHash, shortenHash, verifySignature } from './wdk.js';
import { secureSet, isUnlocked } from './crypto.js';
import { parseReceipt, queryLedger } from './qvac.js';
import { showModal, closeModal, showToast } from './ui.js';
import { t } from './i18n.js';

// ── Core ───────────────────────────────────────────────────────

function emitEvent(state, event, render) {
  state.events.push(event);
  applyEvent(state, event);
  if (state.p2p) state.p2p.broadcast({ type: 'event:broadcast', from: state.p2p.peerId, event });
  persistEvents(state);
  render();
}

const MAX_PERSISTED_EVENTS = 5000;
async function persistEvents(state) {
  try {
    const toStore = state.events.length > MAX_PERSISTED_EVENTS
      ? state.events.slice(-MAX_PERSISTED_EVENTS)
      : state.events;
    await secureSet('pena_events', JSON.stringify(toStore));
  } catch {
    try {
      await secureSet('pena_events', JSON.stringify(state.events.slice(-1000)));
    } catch { /* give up silently */ }
  }
}

// ── Contribute ─────────────────────────────────────────────────

async function doContribute(state, amount, render) {
  const amt = sanitizeAmount(amount);
  if (!amt || amt <= 0 || amt > 1000000) { showToast(t('invalidAmount'), 'error'); return; }
  amount = amt;
  try {
    const auth = await signTransferAuthorization(state.wallet.privateKey, { to: state.smartAccount.address, amount });
    if (!auth) { showToast('Signing failed', 'error'); return; }
    emitEvent(state, createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: state.currentUser, amount, txHash: simulateTxHash(), authSignature: auth.signature, authNonce: auth.nonce, ts: Date.now() }, state.wallet), render);
    state.showContribute = false;
    showToast(`${amount} USDt contributed (gasless)`, 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

// ── Proposal ───────────────────────────────────────────────────

async function doCreateProposal(state, payee, amount, purpose, category, render) {
  const amt = sanitizeAmount(amount);
  if (!payee || !payee.trim() || !amt || amt <= 0 || amt > 1000000 || !purpose || !purpose.trim()) { showToast('Fill all fields with valid data', 'error'); return; }
  amount = amt;

  // Role-based budget limit
  const currentMember = state.members.find(m => m.id === state.currentUser);
  const roleLimit = state.roleLimits[currentMember?.role] ?? Infinity;
  if (amount > roleLimit) { showToast(t('budgetLimitExceeded') + ` (max ${roleLimit} USDt)`, 'error'); return; }

  const id = 'p' + Date.now();
  const cats = state.proposalCategories.length > 0 ? state.proposalCategories : [category || 'Other'];
  const catStr = cats.join(', ');
  emitEvent(state, createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id, payee, amount: Number(amount), currency: 'USDt', purpose, category: catStr, categories: cats, createdBy: state.currentUser, ts: Date.now() }, state.wallet), render);
  if (state.proposalReceipt) emitEvent(state, createEvent(EVENT_TYPES.RECEIPT_PARSE, { proposalId: id, parsed: state.proposalReceipt }, state.wallet), render);
  state.showProposal = false; state.proposalReceipt = null; state.proposalCategories = [];
  showToast('Proposal created and synced', 'success');
}

// ── Approve / Execute ──────────────────────────────────────────

async function doApprove(state, proposalId, render) {
  try {
    const msg = `approve:${proposalId}:${state.currentUser}`;
    const sig = await signMessage(state.wallet.privateKey, msg);
    if (!sig) { showToast('Signing failed', 'error'); return; }
    emitEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId, memberId: state.currentUser, sig, ts: Date.now() }, state.wallet), render);
    showToast('Approval signed', 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function doExecute(state, proposalId, render) {
  try {
    const proposal = state.proposals.find(p => p.id === proposalId);
    if (!proposal || !checkThreshold(proposal, state.threshold)) { showToast('Not enough approvals', 'error'); return; }
    if (state.balance < proposal.amount) { showToast(t('insufficientBalance'), 'error'); return; }
    const auth = await signTransferAuthorization(state.wallet.privateKey, { to: proposal.payee, amount: proposal.amount });
    emitEvent(state, createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId, txHash: simulateTxHash(), authSignature: auth ? auth.signature : null, ts: Date.now() }, state.wallet), render);
    showToast('Gasless transfer executed', 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

// ── Receipt OCR ────────────────────────────────────────────────

async function doParseReceipt(state, file, render) {
  if (file.size > 10 * 1024 * 1024) { showToast('Image too large (max 10 MB)', 'error'); return; }
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

// ── Signature Verification Cache ───────────────────────────────

const sigCache = new Map();
function verifySigCached(approvalData, proposal, member) {
  if (!approvalData.sig || !member.walletAddr || !proposal) return null;
  const key = approvalData.sig + ':' + member.walletAddr;
  if (sigCache.has(key)) return sigCache.get(key);
  try {
    const msg = `approve:${approvalData.proposalId}:${approvalData.memberId}`;
    const result = verifySignature(msg, approvalData.sig, member.walletAddr);
    sigCache.set(key, result);
    return result;
  } catch { sigCache.set(key, null); return null; }
}

// ── Disputes ───────────────────────────────────────────────────

function flagDispute(state, proposalId, reason, render) {
  if (!proposalId || !reason?.trim()) { showToast('Provide a reason', 'error'); return; }
  state.disputes.push({
    id: 'd' + Date.now(), proposalId,
    reason: reason.trim().substring(0, 300),
    filedBy: state.currentUser, ts: Date.now(), status: 'open',
  });
  secureSet('pena_disputes', JSON.stringify(state.disputes));
  showToast(t('disputeSubmit') + ' ✓', 'success');
  render();
}

function resolveDispute(state, disputeId, render) {
  const d = state.disputes.find(d => d.id === disputeId);
  if (d) { d.status = 'resolved'; d.resolvedAt = Date.now(); }
  secureSet('pena_disputes', JSON.stringify(state.disputes));
  render();
}

// ── Recurring Contributions ────────────────────────────────────

function addRecurring(state, amount, interval, render) {
  if (!amount || amount <= 0) { showToast(t('invalidAmount'), 'error'); return; }
  state.recurring.push({
    id: 'r' + Date.now(), amount: sanitizeAmount(amount),
    interval, nextDue: Date.now() + (interval === 'weekly' ? 7 * 86400000 : 30 * 86400000),
    active: true,
  });
  secureSet('pena_recurring', JSON.stringify(state.recurring));
  showToast(t('recurringTitle') + ': ' + amount + ' USDt ' + interval, 'success');
  render();
}

function cancelRecurring(state, id, render) {
  state.recurring = state.recurring.filter(r => r.id !== id);
  secureSet('pena_recurring', JSON.stringify(state.recurring));
  render();
}

// ── Transparency Page ──────────────────────────────────────────

function generateTransparencyHTML(state) {
  const totalIn = state.contributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalOut = state.proposals.filter(p => p.status === 'executed').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const cats = getCategorySummary(state);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PEÑA — ${escapeHtml(state.groupName)} Treasury</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#f8fafc;color:#1e293b;padding:2rem;max-width:800px;margin:0 auto}.card{background:white;border-radius:1rem;padding:1.5rem;margin-bottom:1rem;box-shadow:0 1px 3px rgba(0,0,0,.1)}.stat{display:inline-block;margin-right:2rem;margin-bottom:1rem}.stat-label{font-size:.75rem;color:#64748b}.stat-value{font-size:1.5rem;font-weight:700}.green{color:#16a34a}.blue{color:#2563eb}.orange{color:#ea580c}table{width:100%;border-collapse:collapse;font-size:.875rem}th,td{text-align:left;padding:.5rem;border-bottom:1px solid #e2e8f0}th{color:#64748b;font-weight:600}h1{font-size:1.5rem;margin-bottom:.5rem}h2{font-size:1rem;margin-bottom:.75rem;color:#475569}.footer{text-align:center;margin-top:2rem;font-size:.75rem;color:#94a3b8}</style></head><body><h1>PEÑA — ${escapeHtml(state.groupName)}</h1><p style="color:#64748b;margin-bottom:1.5rem">Public Treasury Report · Generated ${new Date().toLocaleDateString()}</p><div class="card"><div class="stat"><p class="stat-label">${t('balance')}</p><p class="stat-value green">${state.balance} USDt</p></div><div class="stat"><p class="stat-label">${t('income')}</p><p class="stat-value blue">${totalIn} USDt</p></div><div class="stat"><p class="stat-label">${t('expenses')}</p><p class="stat-value orange">${totalOut} USDt</p></div><div class="stat"><p class="stat-label">${t('members')}</p><p class="stat-value">${state.members.length}</p></div></div><div class="card"><h2>Expenses by Category</h2><table><tr><th>Category</th><th>Amount</th></tr>${Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c,a])=>`<tr><td>${escapeHtml(c)}</td><td>${a} USDt</td></tr>`).join('')}</table></div><div class="card"><h2>Contributions</h2><table><tr><th>Member</th><th>Amount</th></tr>${state.contributions.map(c=>{const m=state.members.find(m=>m.id===c.memberId);return `<tr><td>${escapeHtml(m?m.name:'?')}</td><td>${c.amount} USDt</td></tr>`;}).join('')}</table></div><div class="card"><h2>Proposals</h2><table><tr><th>Payee</th><th>Amount</th><th>Status</th><th>Approvals</th></tr>${state.proposals.map(p=>`<tr><td>${escapeHtml(p.payee)}</td><td>${p.amount} USDt</td><td>${p.status}</td><td>${p.approvals.length}/${state.threshold}</td></tr>`).join('')}</table></div><p class="footer">PEÑA — Transparent Self-Custody Treasury · pena-repo.vercel.app</p></body></html>`;
}

function downloadTransparency(state) {
  const html = generateTransparencyHTML(state);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `pena-transparency-${Date.now()}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(t('transparencyTitle') + ' downloaded', 'success');
}

// ── Push Notifications ─────────────────────────────────────────

async function requestNotifications() {
  if (!('Notification' in window)) { showToast('Notifications not supported', 'error'); return false; }
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  if (result === 'granted') { showToast('Notifications enabled', 'success'); return true; }
  showToast('Notifications denied', 'error');
  return false;
}

function sendLocalNotification(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title, body, tag: 'pena-' + Date.now() });
  } else {
    new Notification(title, { body, icon: '/icon.svg' });
  }
}

// ── NL Query ───────────────────────────────────────────────────

function doNLQuery(state, query, render) {
  try { state.nlInput = query; state.nlResult = queryLedger(state, query); render(); }
  catch (err) { state.nlResult = 'Error: ' + err.message; render(); }
}

// ── Notes ──────────────────────────────────────────────────────

function addNote(state, text, render) {
  if (!text || !text.trim()) return;
  if (state.notes.length >= 500) { showToast('Notes limit reached (500)', 'error'); return; }
  state.notes.push({ id: Date.now(), text: text.trim().substring(0, 500), ts: Date.now(), author: state.currentUser });
  secureSet('pena_notes', JSON.stringify(state.notes));
  state.noteInput = '';
  showToast('Note added', 'success');
  render();
}

function deleteNote(state, id, render) {
  state.notes = state.notes.filter(n => n.id !== id);
  secureSet('pena_notes', JSON.stringify(state.notes));
  render();
}

// ── Reports ────────────────────────────────────────────────────

function generateReport(state) {
  const totalIn = state.contributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalOut = state.proposals.filter(p => p.status === 'executed').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const cats = getCategorySummary(state);
  const byM = getMemberContributions(state);
  return `PEÑA Treasury Report - ${state.groupName}
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
`;
}

function downloadReport(state) {
  const report = generateReport(state);
  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `pena-report-${Date.now()}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Report downloaded', 'success');
}

export {
  emitEvent, persistEvents,
  doContribute, doCreateProposal, doApprove, doExecute,
  doParseReceipt, verifySigCached,
  flagDispute, resolveDispute,
  addRecurring, cancelRecurring,
  generateTransparencyHTML, downloadTransparency,
  requestNotifications, sendLocalNotification,
  doNLQuery, addNote, deleteNote,
  generateReport, downloadReport,
};
