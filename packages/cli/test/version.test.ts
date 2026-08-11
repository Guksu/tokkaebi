import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("cli package", () => {
  it("declares the tokkaebi binary", () => {
    expect(packageJson.bin.tokkaebi).toBe("./dist/index.js");
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
