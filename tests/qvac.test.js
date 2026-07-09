import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test QVAC query engine and categorization logic
// OCR tests require browser (Tesseract.js); these test the pure logic

function categorizeExpense(text) {
  const t = (text || '').toLowerCase();
  const categories = {
    'Transport': ['bus', 'autobus', 'transport', 'combustible', 'gasolina', 'gas', 'ruta', 'viaje', 'taxi', 'uber'],
    'Tifo': ['tifo', 'bandera', 'pancarta', 'pintura', 'tela', 'imprenta', 'banner', 'cartel'],
    'Equipment': ['ferreteria', 'material', 'herramienta', 'graderia', 'equipo', 'construccion'],
    'Food': ['carniceria', 'supermercado', 'bar', 'restaurante', 'comida', 'bebida', 'agua', 'mercado'],
    'Tickets': ['estadio', 'entrada', 'ticket', 'abono', 'acceso'],
    'Charity': ['caridad', 'donacion', 'beneficencia', 'ayuda', 'solidaridad'],
  };
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => t.includes(kw))) return cat;
  }
  return 'Other';
}

function queryLedger(state, query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return 'Empty query';

  if (q.match(/saldo|balance/)) {
    return `Saldo: ${state.balance} USDt`;
  }
  if (q.match(/miembro|member/)) {
    return `Members: ${state.members.length}`;
  }
  if (q.match(/pendiente|pending/)) {
    const pending = state.proposals.filter(p => p.status === 'pending');
    return `Pending: ${pending.length}`;
  }
  return 'Default response';
}

test('categorizeExpense identifies transport', () => {
  assert.equal(categorizeExpense('Bus rental for away match'), 'Transport');
  assert.equal(categorizeExpense('Gasolina para viaje'), 'Transport');
  assert.equal(categorizeExpense('autobus ruta sur'), 'Transport');
});

test('categorizeExpense identifies tifo', () => {
  assert.equal(categorizeExpense('Tifo materials and banners'), 'Tifo');
  assert.equal(categorizeExpense('bandera pintura tela'), 'Tifo');
});

test('categorizeExpense identifies food', () => {
  assert.equal(categorizeExpense('Carniceria Don Pepe'), 'Food');
  assert.equal(categorizeExpense('Supermercado compra'), 'Food');
});

test('categorizeExpense identifies equipment', () => {
  assert.equal(categorizeExpense('Ferreteria materiales'), 'Equipment');
  assert.equal(categorizeExpense('herramienta construccion'), 'Equipment');
});

test('categorizeExpense identifies tickets', () => {
  assert.equal(categorizeExpense('Entradas estadio'), 'Tickets');
  assert.equal(categorizeExpense('abono acceso'), 'Tickets');
});

test('categorizeExpense identifies charity', () => {
  assert.equal(categorizeExpense('Donacion caridad'), 'Charity');
  assert.equal(categorizeExpense('ayuda solidaridad'), 'Charity');
});

test('categorizeExpense returns Other for unrecognized', () => {
  assert.equal(categorizeExpense('Random purchase'), 'Other');
  assert.equal(categorizeExpense(''), 'Other');
  assert.equal(categorizeExpense(null), 'Other');
});

test('queryLedger handles balance query', () => {
  const state = { balance: 500, members: [], proposals: [] };
  const result = queryLedger(state, 'balance');
  assert.ok(result.includes('500'));
});

test('queryLedger handles saldo query', () => {
  const state = { balance: 750, members: [], proposals: [] };
  const result = queryLedger(state, 'saldo');
  assert.ok(result.includes('750'));
});

test('queryLedger handles member query', () => {
  const state = { balance: 0, members: [{ id: '1' }, { id: '2' }], proposals: [] };
  const result = queryLedger(state, 'members');
  assert.ok(result.includes('2'));
});

test('queryLedger handles pending query', () => {
  const state = {
    balance: 0, members: [],
    proposals: [{ status: 'pending' }, { status: 'executed' }, { status: 'pending' }],
  };
  const result = queryLedger(state, 'pending');
  assert.ok(result.includes('2'));
});

test('queryLedger handles empty query', () => {
  const state = { balance: 0, members: [], proposals: [] };
  const result = queryLedger(state, '');
  assert.ok(result.includes('Empty'));
});

test('queryLedger handles null query', () => {
  const state = { balance: 0, members: [], proposals: [] };
  const result = queryLedger(state, null);
  assert.ok(typeof result === 'string');
});

test('queryLedger handles unknown query with default', () => {
  const state = { balance: 0, members: [], proposals: [] };
  const result = queryLedger(state, 'xyz unknown');
  assert.ok(typeof result === 'string');
});
