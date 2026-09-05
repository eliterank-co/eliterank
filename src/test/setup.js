import '@testing-library/jest-dom';

if (typeof window !== 'undefined') {
  const store = new Map();
  if (typeof Storage === 'undefined') {
    globalThis.Storage = function Storage() {};
  }
  Storage.prototype.getItem = function (key) { return store.has(key) ? store.get(key) : null; };
  Storage.prototype.setItem = function (key, val) { store.set(key, String(val)); };
  Storage.prototype.removeItem = function (key) { store.delete(key); };
  Storage.prototype.clear = function () { store.clear(); };
  Object.defineProperty(Storage.prototype, 'length', { get() { return store.size; } });
  Storage.prototype.key = function (i) { return Array.from(store.keys())[i] || null; };

  const mockInstance = Object.create(Storage.prototype);
  Object.defineProperty(window, 'localStorage', {
    value: mockInstance,
    writable: true,
    configurable: true,
  });
}
