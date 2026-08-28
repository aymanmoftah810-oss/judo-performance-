import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, hashPassword, validatePassword, verifyPassword } from "./auth/passwords";

describe("كلمات مرور حسابات المنصة", () => {
  it("AUTH-B-001: تجزئ كلمة المرور وتتحقق منها دون حفظ النص الأصلي", async () => {
    const password = "JudoSecure2026!"; const hash = await hashPassword(password);
    expect(hash).toMatch(/^scrypt\$/); expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true); await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
  it("AUTH-B-002: ينشئ كلمات مرور مؤقتة قوية وصالحة للسياسة في كل مرة", () => {
    for (let index = 0; index < 100; index += 1) { const temporary = generateTemporaryPassword(); expect(temporary).toHaveLength(18); expect(temporary).toMatch(/[A-Z]/); expect(temporary).toMatch(/[a-z]/); expect(temporary).toMatch(/\d/); expect(temporary).toMatch(/[!@#$%]/); expect(validatePassword(temporary)).toBeNull(); }
  });
});
