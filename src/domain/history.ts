// Bounded snapshot history for the store's undo stack.
//
// Pure: no state references, no I/O, just a ring-buffer over generic
// snapshots. The store instantiates one of these and pushes a
// structured-clone of the previous state on every mutate() call.
//
// Why a ring rather than an unbounded stack?
//   - Memory: unbounded + structuredClone on every mutate would grow
//     O(n) per user action. Capping to N keeps steady-state memory
//     bounded and predictable.
//   - UX: nobody expects "undo 500 actions ago" to work. Fifty is
//     plenty for realistic workflows ("oh I archived the wrong
//     project, let me undo").

export class HistoryStack<T> {
  private buf: T[] = [];
  constructor(private readonly limit: number = 50) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("HistoryStack limit must be a positive integer");
    }
  }

  /** Push a snapshot. When the buffer is full, drops the oldest. */
  push(snapshot: T): void {
    this.buf.push(snapshot);
    if (this.buf.length > this.limit) this.buf.shift();
  }

  /** Pop the most recent snapshot, or return null if empty. */
  pop(): T | null {
    return this.buf.pop() ?? null;
  }

  /** Peek at the most recent snapshot without popping. */
  peek(): T | null {
    return this.buf.length ? this.buf[this.buf.length - 1]! : null;
  }

  canUndo(): boolean {
    return this.buf.length > 0;
  }

  get size(): number {
    return this.buf.length;
  }

  clear(): void {
    this.buf.length = 0;
  }
}
