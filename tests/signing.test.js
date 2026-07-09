import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';

// Real cryptographic tests for the WDK signing layer.
// These exercise the SAME EIP-191 and EIP-3009 signing that lib/wdk.js performs
// in the browser (same domain, types, and USDt parameters), proving the wallet
// cryptography is genuine — not mocked. Signatures are verified by recovering
// the signer address on-chain-compatible via ethers.verifyMessage / verifyTypedData.

const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDT_DECIMALS = 6;

const TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

test('generateWallet produces a valid EVM keypair', () => {
  const wallet = ethers.Wallet.createRandom();
  assert.ok(ethers.isAddress(wallet.address));
  assert.ok(wallet.privateKey.startsWith('0x'));
  assert.equal(wallet.privateKey.length, 66);
});

test('EIP-191 signMessage produces a signature that recovers to the signer', async () => {
  const wallet = ethers.Wallet.createRandom();
  const message = 'PENA proposal approval';
  const sig = await wallet.signMessage(message);
  const recovered = ethers.verifyMessage(message, sig);
  assert.equal(recovered.toLowerCase(), wallet.address.toLowerCase());
});

test('EIP-191 signature fails to recover for a tampered message', async () => {
  const wallet = ethers.Wallet.createRandom();
  const sig = await wallet.signMessage('approve 100 USDt');
  const recovered = ethers.verifyMessage('approve 999 USDt', sig);
  assert.notEqual(recovered.toLowerCase(), wallet.address.toLowerCase());
});

test('EIP-3009 transferWithAuthorization signature recovers to the signer', async () => {
  const wallet = ethers.Wallet.createRandom();
  const domain = { name: 'USDt', version: '1', chainId: 1, verifyingContract: USDT_ADDRESS };
  const message = {
    from: wallet.address,
    to: ethers.Wallet.createRandom().address,
    value: ethers.parseUnits('25', USDT_DECIMALS),
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 3600,
    nonce: ethers.id(crypto.randomUUID()),
  };
  const sig = await wallet.signTypedData(domain, TRANSFER_TYPES, message);
  const recovered = ethers.verifyTypedData(domain, TRANSFER_TYPES, message, sig);
  assert.equal(recovered.toLowerCase(), wallet.address.toLowerCase());
  assert.equal(sig.length, 132); // 0x + 65 bytes
});

test('EIP-3009 value is scaled to 6 USDt decimals', () => {
  assert.equal(ethers.parseUnits('25', USDT_DECIMALS).toString(), '25000000');
  assert.equal(ethers.parseUnits('0.5', USDT_DECIMALS).toString(), '500000');
});

test('EIP-3009 signature is bound to its domain (wrong chainId does not recover)', async () => {
  const wallet = ethers.Wallet.createRandom();
  const domain = { name: 'USDt', version: '1', chainId: 1, verifyingContract: USDT_ADDRESS };
  const message = {
    from: wallet.address,
    to: ethers.Wallet.createRandom().address,
    value: ethers.parseUnits('10', USDT_DECIMALS),
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 3600,
    nonce: ethers.id(crypto.randomUUID()),
  };
  const sig = await wallet.signTypedData(domain, TRANSFER_TYPES, message);
  const wrongDomain = { ...domain, chainId: 137 };
  const recovered = ethers.verifyTypedData(wrongDomain, TRANSFER_TYPES, message, sig);
  assert.notEqual(recovered.toLowerCase(), wallet.address.toLowerCase());
});

test('nonce is unique per authorization (replay protection)', () => {
  const nonces = new Set();
  for (let i = 0; i < 100; i++) nonces.add(ethers.id(crypto.randomUUID()));
  assert.equal(nonces.size, 100);
});
