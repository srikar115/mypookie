/**
 * Clock port — inject this into use cases instead of calling `new Date()` or
 * `Date.now()` directly.
 *
 * Why: it lets unit tests advance time deterministically (`FixedClock`), and
 * keeps time-dependent logic testable without heroic mocking.
 */

export interface Clock {
  now(): Date;
  nowMs(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  nowMs(): number {
    return Date.now();
  }
}

/** For unit tests. Advances only when you tell it to. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  nowMs(): number {
    return this.current.getTime();
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
  set(date: Date): void {
    this.current = new Date(date);
  }
}
