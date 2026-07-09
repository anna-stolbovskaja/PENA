// Ledger — append-only event log with deterministic state rebuild
// Each event is signed by its creator and replicated across peers

const EVENT_TYPES = {
  MEMBER_JOIN: 'member:join',
  CONTRIBUTION: 'contribution',
  PROPOSAL_CREATE: 'proposal:create',
  PROPOSAL_APPROVE: 'proposal:approve',
  PROPOSAL_EXECUTE: 'proposal:execute',
  RECEIPT_PARSE: 'receipt:parse',
};

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeAmount(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100; // max 2 decimal places
}

function sanitizeText(str, maxLen = 200) {
  if (str == null) return '';
  return String(str).substring(0, maxLen).trim();
}

function createEvent(type, data, signer) {
  // Sanitize data based on type
  const clean = { ...data };
  if ('amount' in clean) clean.amount = sanitizeAmount(clean.amount);
  if ('payee' in clean) clean.payee = sanitizeText(clean.payee, 100);
  if ('purpose' in clean) clean.purpose = sanitizeText(clean.purpose, 200);
  if ('name' in clean) clean.name = sanitizeText(clean.name, 50);
  if ('category' in clean) clean.category = sanitizeText(clean.category, 50);

  const event = {
    type,
    data: clean,
    ts: Date.now(),
    id: crypto.randomUUID(),
  };
  if (signer && signer.address) {
    event.author = signer.address;
  }
  return event;
}

function initialState() {
  return {
    members: [],
    contributions: [],
    proposals: [],
    executions: [],
    receipts: [],
    balance: 0,
  };
}

// Track applied event IDs to prevent replay/duplicate
const appliedEventIds = new Set();

function applyEvent(state, event) {
  try {
    // Duplicate prevention — reject events already applied
    if (event.id && appliedEventIds.has(event.id)) return state;
    if (event.id) appliedEventIds.add(event.id);

    switch (event.type) {
      case EVENT_TYPES.MEMBER_JOIN: {
        const name = sanitizeText(event.data.name, 50);
        if (!name) break;
        if (!state.members.find(m => m.id === event.data.id)) {
          state.members.push({ ...event.data, name });
        }
        break;
      }
      case EVENT_TYPES.CONTRIBUTION: {
        const amount = sanitizeAmount(event.data.amount);
        if (amount <= 0) break;
        if (!state.contributions.find(c => c.eventId === event.id)) {
          state.contributions.push({ ...event.data, amount, eventId: event.id });
          state.balance += amount;
        }
        break;
      }
      case EVENT_TYPES.PROPOSAL_CREATE: {
        const amount = sanitizeAmount(event.data.amount);
        if (amount <= 0) break;
        if (!state.proposals.find(p => p.id === event.data.id)) {
          state.proposals.push({
            ...event.data,
            amount,
            payee: sanitizeText(event.data.payee, 100),
            purpose: sanitizeText(event.data.purpose, 200),
            approvals: [],
            status: 'pending',
            eventId: event.id,
          });
        }
        break;
      }
      case EVENT_TYPES.PROPOSAL_APPROVE: {
        const prop = state.proposals.find(p => p.id === event.data.proposalId);
        if (prop && prop.status === 'pending' && !prop.approvals.find(a => a.memberId === event.data.memberId)) {
          prop.approvals.push({ ...event.data });
        }
        break;
      }
      case EVENT_TYPES.PROPOSAL_EXECUTE: {
        const prop = state.proposals.find(p => p.id === event.data.proposalId);
        if (prop && prop.status !== 'executed') {
          const cost = sanitizeAmount(prop.amount);
          if (state.balance < cost) {
            console.warn('Ledger: insufficient balance for execution', prop.id, cost, state.balance);
            break; // Block execution if balance insufficient
          }
          prop.status = 'executed';
          state.executions.push({ ...event.data, eventId: event.id });
          state.balance -= cost;
        }
        break;
      }
      case EVENT_TYPES.RECEIPT_PARSE: {
        if (!state.receipts.find(r => r.proposalId === event.data.proposalId)) {
          state.receipts.push({ ...event.data });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Ledger applyEvent error:', err.message);
  }
  return state;
}

function resetAppliedIds() {
  appliedEventIds.clear();
}

function rebuildState(events) {
  resetAppliedIds();
  const state = initialState();
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  for (const event of sorted) {
    applyEvent(state, event);
  }
  return state;
}

function isApproved(proposal, threshold) {
  return proposal && proposal.approvals.length >= threshold;
}

function getCategorySummary(state) {
  const summary = {};
  for (const prop of state.proposals) {
    if (prop.status !== 'executed') continue;
    const cat = prop.category || 'Otros';
    summary[cat] = (summary[cat] || 0) + (Number(prop.amount) || 0);
  }
  return summary;
}

function getMemberContributions(state) {
  const summary = {};
  for (const c of state.contributions) {
    const m = state.members.find(m => m.id === c.memberId);
    const name = m ? m.name : 'Unknown';
    summary[name] = (summary[name] || 0) + (Number(c.amount) || 0);
  }
  return summary;
}

export {
  EVENT_TYPES,
  createEvent,
  initialState,
  applyEvent,
  rebuildState,
  resetAppliedIds,
  isApproved,
  getCategorySummary,
  getMemberContributions,
  escapeHtml,
  sanitizeAmount,
  sanitizeText,
};
