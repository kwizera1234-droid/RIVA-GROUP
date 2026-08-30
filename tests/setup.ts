/**
 * Vitest setup: provide a small in-memory Web Storage so services that read
 * localStorage (emergency config, contacts, voice config) can be unit-tested
 * under the Node environment without a browser.
 *
 * NOTE: device-only behavior (Android mic, SpeechRecognizer, TTS, cellular
 * calls, SIM selection, camera firmware) cannot run here and is covered on a
 * physical device; the pipeline logic that drives it is what we test here.
 */

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) as string : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  get length(): number {
    return this.store.size;
  }
}

const g = globalThis as unknown as Record<string, unknown>;
if (!g.localStorage) g.localStorage = new MemoryStorage();
if (!g.sessionStorage) g.sessionStorage = new MemoryStorage();