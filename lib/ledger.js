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

function createEvent(type, data, signer) {
  const event = {
    type,
    data,
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

function applyEvent(state, event) {
  try {
    switch (event.type) {
      case EVENT_TYPES.MEMBER_JOIN: {
        if (!state.members.find(m => m.id === event.data.id)) {
          state.members.push({ ...event.data });
        }
        break;
      }
      case EVENT_TYPES.CONTRIBUTION: {
        if (!state.contributions.find(c => c.id === event.id)) {
          state.contributions.push({ ...event.data, eventId: event.id });
          state.balance += Number(event.data.amount) || 0;
        }
        break;
      }
      case EVENT_TYPES.PROPOSAL_CREATE: {
        if (!state.proposals.find(p => p.id === event.data.id)) {
          state.proposals.push({
            ...event.data,
            approvals: [],
            status: 'pending',
            eventId: event.id,
          });
        }
        break;
      }
      case EVENT_TYPES.PROPOSAL_APPROVE: {
        const prop = state.proposals.find(p => p.id === event.data.proposalId);
        if (prop && !prop.approvals.find(a => a.memberId === event.data.memberId)) {
          prop.approvals.push({ ...event.data });
        }
        break;
      }
      case EVENT_TYPES.PROPOSAL_EXECUTE: {
        const prop = state.proposals.find(p => p.id === event.data.proposalId);
        if (prop && prop.status !== 'executed') {
          prop.status = 'executed';
          state.executions.push({ ...event.data, eventId: event.id });
          state.balance -= Number(prop.amount) || 0;
          if (state.balance < 0) state.balance = 0;
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

function rebuildState(events) {
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
  isApproved,
  getCategorySummary,
  getMemberContributions,
  escapeHtml,
};
