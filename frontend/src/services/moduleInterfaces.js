export const MODULE_INTERFACES = {
  forms: {
    getFormsList: 'forms.getFormsList',
  },
  flows: {
    getFlowsList: 'flows.getFlowsList',
  },
};

let _registry = {};

export function registerModuleInterface(key, implementation) {
  _registry[key] = implementation;
}

export function getModuleInterface(key) {
  const impl = _registry[key];
  if (!impl) {
    console.warn(`[ModuleInterface] No implementation registered for: ${key}`);
    return null;
  }
  return impl;
}

export function clearModuleInterfaces() {
  _registry = {};
}