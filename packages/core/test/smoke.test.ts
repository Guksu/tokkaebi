import { describe, expect, it } from "vitest";
import { CORE_NAME } from "../src/index.js";

describe("core package", () => {
  it("exposes the package entrypoint", () => {
    expect(CORE_NAME).toBe("@tokkaebi/core");
  });
});
