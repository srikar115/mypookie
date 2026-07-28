/**
 * IdGenerator port — the only place any layer above infrastructure gets an
 * identifier. Prefer this over `crypto.randomUUID()` scattered through use
 * cases; it makes tests deterministic.
 */

import { randomUUID } from "node:crypto";

export interface IdGenerator {
  next(): string;
}

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

/** For unit tests. */
export class SequenceIdGenerator implements IdGenerator {
  private i = 0;
  constructor(private readonly prefix = "id") {}
  next(): string {
    this.i += 1;
    return `${this.prefix}-${this.i}`;
  }
}
