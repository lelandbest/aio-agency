export const CANONICAL_TAG_PREFIXES = ['AI', 'AUT', 'CRM', 'CS', 'MKT', 'MKG', 'MTG', 'CP', 'CD', 'EVT', 'OPS', 'PM', 'META'];

export function validateTagFormat(name) {
  if (!name || !name.includes(':')) return { valid: false, error: 'Tag must follow PREFIX:NAME format.' };
  const [prefix] = name.toUpperCase().split(':');
  if (!CANONICAL_TAG_PREFIXES.includes(prefix)) {
    return { valid: false, error: `Invalid prefix '${prefix}'. Allowed: ${CANONICAL_TAG_PREFIXES.join(', ')}` };
  }
  return { valid: true };
}