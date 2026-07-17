export default class CustomCacheHandler {
  constructor() {
    this.cache = new Map();
  }

  async get(key) {
    return this.cache.get(key);
  }

  async set(key, value) {
    this.cache.set(key, value);
  }

  async delete(key) {
    this.cache.delete(key);
  }
}
