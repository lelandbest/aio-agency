/**
 * ULID Generator - Universally Unique Lexicographically Sortable Identifier
 * 
 * Format: 26 characters (base32 encoded)
 * Structure: TTTTTTTTTTRRRRRRRRRRRRRRRR
 * - 10 chars timestamp (48 bits, millisecond precision)
 * - 16 chars randomness (80 bits)
 * 
 * Benefits:
 * - Sortable by creation time
 * - URL-safe (no special characters)
 * - Case insensitive
 * - 128-bit compatible with UUID
 */

// Crockford's Base32 alphabet (excludes I, L, O, U to avoid confusion)
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;
const TIME_MAX = Math.pow(2, 48) - 1;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now, len) {
  if (now > TIME_MAX) {
    throw new Error('Time value is too large');
  }
  let str = '';
  for (let i = len - 1; i >= 0; i--) {
    const mod = now % ENCODING_LEN;
    str = ENCODING[mod] + str;
    now = Math.floor(now / ENCODING_LEN);
  }
  return str;
}

function encodeRandom(len) {
  let str = '';
  for (let i = 0; i < len; i++) {
    const rand = Math.floor(Math.random() * ENCODING_LEN);
    str += ENCODING[rand];
  }
  return str;
}

/**
 * Generate a ULID
 * @param {number} seedTime - Optional seed time (defaults to Date.now())
 * @returns {string} 26-character ULID
 */
export function ulid(seedTime) {
  const time = seedTime || Date.now();
  return encodeTime(time, TIME_LEN) + encodeRandom(RANDOM_LEN);
}

/**
 * Generate a shorter NanoID-style identifier
 * @param {number} length - Length of ID (default 12)
 * @returns {string} URL-safe random string
 */
export function nanoid(length = 12) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

/**
 * Generate a contact ID with CNT prefix
 * @returns {string} Contact ID (e.g., CNT-01H4VCZQP2QJ9K3X8M7N5BWTC)
 */
export function generateContactId() {
  return `CNT-${ulid()}`;
}

/**
 * Generate a submission ID with SUB prefix
 * @returns {string} Submission ID
 */
export function generateSubmissionId() {
  return `SUB-${ulid()}`;
}

/**
 * Generate a form ID with FRM prefix
 * @returns {string} Form ID
 */
export function generateFormId() {
  return `FRM-${ulid()}`;
}

/**
 * Generate an activity ID with ACT prefix
 * @returns {string} Activity ID
 */
export function generateActivityId() {
  return `ACT-${ulid()}`;
}

/**
 * Generate a CMS record ID with CMS prefix
 * @returns {string} CMS ID
 */
export function generateCmsId() {
  return `CMS-${ulid()}`;
}

/**
 * Generate a company ID with COMP prefix
 * @returns {string} Company ID
 */
export function generateCompanyId() {
  return `COMP-${ulid()}`;
}

/**
 * Parse ULID to get timestamp
 * @param {string} id - ULID string
 * @returns {number} Timestamp in milliseconds
 */
export function decodeTime(id) {
  // Remove prefix if exists
  const ulid = id.includes('-') ? id.split('-')[1] : id;
  
  if (ulid.length !== 26) {
    throw new Error('Invalid ULID format');
  }
  
  const timeStr = ulid.substring(0, TIME_LEN);
  let time = 0;
  
  for (let i = 0; i < timeStr.length; i++) {
    const char = timeStr[i];
    const index = ENCODING.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid ULID character');
    }
    time = time * ENCODING_LEN + index;
  }
  
  return time;
}

export default {
  ulid,
  nanoid,
  generateContactId,
  generateSubmissionId,
  generateFormId,
  generateActivityId,
  generateCmsId,
  generateCompanyId,
  decodeTime
};
