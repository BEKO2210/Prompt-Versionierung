import { describe, it, expect } from "vitest";
import { HistoryStack } from "../../src/domain/history";

describe("HistoryStack", () => {
  it("starts empty", () => {
    const h = new HistoryStack<number>();
    expect(h.canUndo()).toBe(false);
    expect(h.size).toBe(0);
    expect(h.pop()).toBe(null);
  });

  it("pushes and pops in LIFO order", () => {
    const h = new HistoryStack<number>();
    h.push(1); h.push(2); h.push(3);
    expect(h.size).toBe(3);
    expect(h.pop()).toBe(3);
    expect(h.pop()).toBe(2);
    expect(h.pop()).toBe(1);
    expect(h.pop()).toBe(null);
  });

  it("respects the bound by dropping oldest entries", () => {
    const h = new HistoryStack<number>(3);
    for (let i = 1; i <= 5; i++) h.push(i);
    expect(h.size).toBe(3);
    // 1 and 2 dropped; stack is now [3, 4, 5]
    expect(h.pop()).toBe(5);
    expect(h.pop()).toBe(4);
    expect(h.pop()).toBe(3);
    expect(h.canUndo()).toBe(false);
  });

  it("peek does not remove", () => {
    const h = new HistoryStack<string>();
    h.push("a"); h.push("b");
    expect(h.peek()).toBe("b");
    expect(h.peek()).toBe("b");
    expect(h.size).toBe(2);
  });

  it("clear empties the stack", () => {
    const h = new HistoryStack<number>();
    h.push(1); h.push(2);
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.pop()).toBe(null);
  });

  it("rejects non-positive or non-integer limits", () => {
    expect(() => new HistoryStack(0)).toThrow();
    expect(() => new HistoryStack(-1)).toThrow();
    expect(() => new HistoryStack(1.5)).toThrow();
  });

  it("stores independent object references (doesn't deep-clone)", () => {
    // The stack is a reference holder only; deep-cloning is the caller's
    // responsibility (the store does structuredClone on its own). This
    // test pins that contract so we don't accidentally start cloning.
    const h = new HistoryStack<{ n: number }>();
    const orig = { n: 1 };
    h.push(orig);
    orig.n = 99;
    expect(h.pop()).toBe(orig);
    expect(orig.n).toBe(99);
  });

  it("limit = 1 keeps only the latest", () => {
    const h = new HistoryStack<number>(1);
    h.push(1); h.push(2); h.push(3);
    expect(h.size).toBe(1);
    expect(h.pop()).toBe(3);
    expect(h.canUndo()).toBe(false);
  });
});
