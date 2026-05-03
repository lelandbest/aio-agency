function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function toSnakeCase(obj) {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof RegExp) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  }
  const newObj = {};
  Object.keys(obj).forEach((key) => {
    const newKey = camelToSnake(key);
    newObj[newKey] = toSnakeCase(obj[key]);
  });
  return newObj;
}