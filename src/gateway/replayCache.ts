import { createHash } from 'node:crypto';

export function fingerprint(tokenBytes: Uint8Array): string {
  return createHash('sha256').update(tokenBytes).digest('hex');
}

export class ReplayCache {
  private seen = new Map<string, number>();

  constructor(
    private ttlMs = 5 * 60 * 1000,
    private now: () => number = Date.now
  ) {}

  // true = first use (now stored), false = replay
  checkAndStore(fp: string): boolean {
    this.sweep();
    const expiry = this.seen.get(fp);
    if (expiry !== undefined && expiry > this.now()) return false;
    this.seen.set(fp, this.now() + this.ttlMs);
    return true;
  }

  sweep(): void {
    const t = this.now();
    for (const [fp, exp] of this.seen) if (exp <= t) this.seen.delete(fp);
  }

  get size(): number {
    return this.seen.size;
  }
}
