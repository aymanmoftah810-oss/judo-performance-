import { describe, expect, it } from "vitest";
import { hasInitialAdminSetupToken, matchesInitialAdminSetupToken } from "./auth/initialization";

describe("رمز تهيئة أول ADMIN", () => {
  it("SECRET-001: يتحقق من الرمز من البيئة على الخادم فقط دون كشفه", () => {
    const configured = process.env.INITIAL_ADMIN_SETUP_TOKEN ?? "";
    expect(hasInitialAdminSetupToken()).toBe(true);
    expect(matchesInitialAdminSetupToken(configured)).toBe(true);
    expect(matchesInitialAdminSetupToken(`${configured}-invalid`)).toBe(false);
  });
});
