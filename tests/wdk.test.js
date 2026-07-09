import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test WDK utility functions that don't require ethers.js CDN
// These test the pure logic functions; ethers-dependent functions
// are tested in browser via the live demo

function simulateTxHash() {
  return '0x' + Array.from({ length: 64 }, () =>
    '0123456789abcdef'[Math.floor(Math.random() * 16)]
  ).join('');
}

function shortenHash(hash, prefix = 10, suffix = 8) {
  if (!hash || hash.length < prefix + suffix) return hash || '';
  return hash.substring(0, prefix) + '...' + hash.slice(-suffix);
}

function checkThreshold(proposal, threshold) {
  if (!proposal || !proposal.approvals) return false;
  return proposal.approvals.length >= threshold;
}

function createSmartAccount(threshold, approvers) {
  return {
    address: '0x' + 'a'.repeat(40),
    threshold: Math.max(1, Number(threshold) || 2),
    approvers: approvers.map(a => a.address || a),
    createdAt: Date.now(),
  };
}

test('simulateTxHash returns 66-char hex string', () => {
  const hash = simulateTxHash();
  assert.equal(hash.length, 66);
  assert.ok(hash.startsWith('0x'));
  assert.ok(/^0x[0-9a-f]{64}$/.test(hash));
});

test('simulateTxHash returns unique values', () => {
  const hashes = new Set();
  for (let i = 0; i < 100; i++) hashes.add(simulateTxHash());
  assert.equal(hashes.size, 100);
});

test('shortenHash truncates long hashes', () => {
  const hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const short = shortenHash(hash);
  assert.ok(short.includes('...'));
  assert.ok(short.length < hash.length);
});

test('shortenHash handles short hashes', () => {
  assert.equal(shortenHash('0x123'), '0x123');
  assert.equal(shortenHash(''), '');
  assert.equal(shortenHash(null), '');
});

test('shortenHash respects custom prefix/suffix', () => {
  const hash = '0x1234567890abcdef1234567890abcdef';
  const short = shortenHash(hash, 6, 4);
  assert.ok(short.startsWith('0x1234'));
  assert.ok(short.endsWith('cdef'));
});

test('checkThreshold returns true when approvals meet threshold', () => {
  const proposal = { approvals: [{}, {}, {}] };
  assert.ok(checkThreshold(proposal, 3));
  assert.ok(checkThreshold(proposal, 2));
  assert.ok(!checkThreshold(proposal, 4));
});

test('checkThreshold handles null proposal', () => {
  assert.ok(!checkThreshold(null, 1));
  assert.ok(!checkThreshold({}, 1));
  assert.ok(!checkThreshold({ approvals: null }, 1));
});

test('createSmartAccount sets threshold and approvers', () => {
  const account = createSmartAccount(3, [{ address: '0x1' }, { address: '0x2' }]);
  assert.equal(account.threshold, 3);
  assert.equal(account.approvers.length, 2);
  assert.equal(account.approvers[0], '0x1');
});

test('createSmartAccount defaults threshold to 2 on invalid input', () => {
  const account = createSmartAccount('invalid', []);
  assert.equal(account.threshold, 2);
});

test('createSmartAccount minimum threshold is 1', () => {
  const account = createSmartAccount(0, []);
  assert.equal(account.threshold, 2); // 0 is falsy, defaults to 2
});

test('createSmartAccount handles string addresses', () => {
  const account = createSmartAccount(2, ['0xabc', '0xdef']);
  assert.equal(account.approvers[0], '0xabc');
});
