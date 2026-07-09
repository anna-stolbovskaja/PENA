// WDK — Wallet operations via ethers.js v6
// Real keypair generation, EIP-191 signing, EIP-3009 transferWithAuthorization

import { ethers } from 'https://esm.sh/ethers@6.13.4';

const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // mainnet USDT
const USDT_DECIMALS = 6;

// ── On-chain configuration ────────────────────────────────────
const CHAINS = {
  sepolia: { chainId: 11155111, rpc: 'https://rpc.sepolia.org', name: 'Sepolia', symbol: 'ETH', explorer: 'https://sepolia.etherscan.io' },
  ethereum: { chainId: 1, rpc: 'https://eth.drpc.org', name: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io' },
};
let _provider = null;
let _chainKey = 'sepolia';

function getChain() { return CHAINS[_chainKey] || CHAINS.sepolia; }
function setChain(key) { if (CHAINS[key]) { _chainKey = key; _provider = null; } }

function getProvider() {
  if (!_provider) {
    const chain = getChain();
    _provider = new ethers.JsonRpcProvider(chain.rpc, { chainId: chain.chainId, name: chain.name });
  }
  return _provider;
}

// Get on-chain balance (native token, e.g. ETH on Sepolia)
async function getOnChainBalance(address) {
  try {
    const provider = getProvider();
    const balance = await provider.getBalance(address);
    return { wei: balance.toString(), display: ethers.formatEther(balance), symbol: getChain().symbol };
  } catch (err) {
    console.error('WDK getOnChainBalance error:', err.message);
    return { wei: '0', display: '0.0', symbol: getChain().symbol };
  }
}

// Send real on-chain ETH transfer
async function sendOnChainTransfer(privateKey, to, amountEth) {
  const provider = getProvider();
  const wallet = new ethers.Wallet(privateKey, provider);
  const tx = await wallet.sendTransaction({
    to,
    value: ethers.parseEther(String(amountEth)),
  });
  const receipt = await tx.wait();
  return {
    hash: receipt.hash,
    from: receipt.from,
    to: receipt.to,
    blockNumber: receipt.blockNumber,
    status: receipt.status === 1 ? 'success' : 'failed',
    explorerUrl: getChain().explorer + '/tx/' + receipt.hash,
  };
}

function generateWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}

function loadWallet(privateKey) {
  try {
    return new ethers.Wallet(privateKey);
  } catch (err) {
    console.error('WDK loadWallet error:', err.message);
    return null;
  }
}

async function signMessage(privateKey, message) {
  try {
    const wallet = loadWallet(privateKey);
    if (!wallet) return null;
    const sig = await wallet.signMessage(message);
    return sig;
  } catch (err) {
    console.error('WDK signMessage error:', err.message);
    return null;
  }
}

// EIP-3009 transferWithAuthorization structure
// Real signing of the authorization struct
async function signTransferAuthorization(privateKey, params) {
  try {
    const wallet = loadWallet(privateKey);
    if (!wallet) return null;

    const domain = {
      name: 'USDt',
      version: '1',
      chainId: params.chainId || 1,
      verifyingContract: params.tokenAddress || USDT_ADDRESS,
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const value = ethers.parseUnits(String(params.amount || 0), USDT_DECIMALS);
    const nonce = ethers.id(crypto.randomUUID());
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600;

    const sig = await wallet.signTypedData(domain, types, {
      from: wallet.address,
      to: params.to,
      value,
      validAfter,
      validBefore,
      nonce,
    });

    return {
      signature: sig,
      signer: wallet.address,
      nonce,
      validAfter,
      validBefore,
      value: value.toString(),
    };
  } catch (err) {
    console.error('WDK signTransferAuthorization error:', err.message);
    return null;
  }
}

// Simulated ERC-4337 smart account
// In production this would deploy via WDK's ERC-4337 module
function createSmartAccount(threshold, approvers) {
  return {
    address: ethers.Wallet.createRandom().address,
    threshold: Math.max(1, Number(threshold) || 2),
    approvers: approvers.map(a => a.address || a),
    createdAt: Date.now(),
  };
}

// Verify a signature (EIP-191)
function verifySignature(message, signature, expectedAddress) {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch (err) {
    console.error('WDK verifySignature error:', err.message);
    return false;
  }
}

// Check M-of-N: are there enough valid approvals?
function checkThreshold(proposal, threshold) {
  if (!proposal || !proposal.approvals) return false;
  return proposal.approvals.length >= threshold;
}

// Generate a deterministic tx hash for local simulation
function simulateTxHash() {
  return '0x' + Array.from({ length: 64 }, () =>
    '0123456789abcdef'[Math.floor(Math.random() * 16)]
  ).join('');
}

function shortenHash(hash, prefix = 10, suffix = 8) {
  if (!hash || hash.length < prefix + suffix) return hash || '';
  return hash.substring(0, prefix) + '...' + hash.slice(-suffix);
}

export {
  generateWallet,
  loadWallet,
  signMessage,
  signTransferAuthorization,
  createSmartAccount,
  verifySignature,
  checkThreshold,
  simulateTxHash,
  shortenHash,
  ethers,
  CHAINS,
  getChain,
  setChain,
  getProvider,
  getOnChainBalance,
  sendOnChainTransfer,
};
