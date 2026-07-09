// PEÑA — localStorage encryption via Web Crypto API (AES-256-GCM)
// Derives a key from user PIN using PBKDF2, encrypts/decrypts all stored data.

const SALT_KEY = 'pena_salt';
const IV_LEN = 12;
const PBKDF2_ITERATIONS = 100000;

let _cryptoKey = null;

async function deriveKey(pin, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function getSalt() {
  let saltHex = localStorage.getItem(SALT_KEY);
  if (saltHex) return new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''));
  return salt;
}

async function initCrypto(pin) {
  const salt = getSalt();
  _cryptoKey = await deriveKey(pin, salt);
  // Verify by trying to decrypt a known marker
  const marker = localStorage.getItem('pena_enc_marker');
  if (marker) {
    try {
      const result = await decryptValue(marker);
      if (result !== 'PENA_OK') throw new Error('wrong pin');
    } catch {
      _cryptoKey = null;
      throw new Error('wrong_pin');
    }
  } else {
    // First time — store marker
    const encrypted = await encryptValue('PENA_OK');
    localStorage.setItem('pena_enc_marker', encrypted);
  }
  return true;
}

function isUnlocked() {
  return _cryptoKey !== null;
}

function hasPin() {
  return localStorage.getItem('pena_enc_marker') !== null;
}

async function encryptValue(plaintext) {
  if (!_cryptoKey) throw new Error('not_unlocked');
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _cryptoKey, enc.encode(plaintext));
  const combined = new Uint8Array(IV_LEN + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), IV_LEN);
  return btoa(String.fromCharCode(...combined));
}

async function decryptValue(base64) {
  if (!_cryptoKey) throw new Error('not_unlocked');
  const combined = new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
  const iv = combined.slice(0, IV_LEN);
  const ciphertext = combined.slice(IV_LEN);
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _cryptoKey, ciphertext);
  return dec.decode(plaintext);
}

// High-level: encrypted localStorage get/set
async function secureGet(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  // If crypto not initialized, return raw (migration)
  if (!_cryptoKey) return raw;
  try {
    return await decryptValue(raw);
  } catch {
    // Fallback: might be unencrypted (migration)
    return raw;
  }
}

async function secureSet(key, value) {
  if (!_cryptoKey) {
    localStorage.setItem(key, value);
    return;
  }
  const encrypted = await encryptValue(value);
  localStorage.setItem(key, encrypted);
}

async function secureRemove(key) {
  localStorage.removeItem(key);
}

export { initCrypto, isUnlocked, hasPin, secureGet, secureSet, secureRemove, encryptValue, decryptValue };
