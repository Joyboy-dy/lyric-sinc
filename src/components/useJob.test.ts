import { describe, expect, it } from "vitest";
import { isTerminal, pollDelay } from "./useJob";

describe("job polling", () => {
  it("polls faster while visible", () => {
    expect(pollDelay(true)).toBe(3000);
    expect(pollDelay(false)).toBe(10000);
  });

  it("knows terminal statuses", () => {
    for (const status of ["done", "failed", "cancelled"] as const) expect(isTerminal(status)).toBe(true);
    for (const status of ["queued", "running"] as const) expect(isTerminal(status)).toBe(false);
  });
});
