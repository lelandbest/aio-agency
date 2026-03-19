export const TM = '\u2122';

export const normalizeDisplayText = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/â„¢/g, TM)
    .replace(/âœ“/g, '\u2713')
    .replace(/Ã—/g, '\u00D7');
};
