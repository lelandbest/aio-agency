/**
 * Minimal ULID generator for Flow IDs
 * Reuses existing ulid.js pattern from the app
 */

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomInt() {
  return Math.floor(Math.random() * 32);
}

function encodeTime(timestamp) {
  const encodedTime = [];
  let ms = timestamp;
  for (let i = 9; i >= 0; i--) {
    encodedTime[i] = CROCKFORD_ALPHABET[ms % 32];
    ms = Math.floor(ms / 32);
  }
  return encodedTime.join('');
}

function encodeRandomness() {
  const randomness = [];
  for (let i = 0; i < 16; i++) {
    randomness[i] = CROCKFORD_ALPHABET[randomInt()];
  }
  return randomness.join('');
}

export function generateULID() {
  const timestamp = Date.now();
  const time = encodeTime(timestamp);
  const randomness = encodeRandomness();
  return time + randomness;
}
