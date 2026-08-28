import { describe, expect, it } from "vitest";
import { createAccountSession, verifyAccountSession } from "./auth/accountSession";

describe("جلسة حساب المنصة", () => {
  it("AUTH-B-003: توقع جلسة الحساب وتتحقق منها وترفض الرمز المعدل", async () => {
    const token = await createAccountSession({ accountId: 42, username: "coach.ahmed", role: "COACH" });
    await expect(verifyAccountSession(token)).resolves.toEqual({ accountId: 42, username: "coach.ahmed", role: "COACH" });
    await expect(verifyAccountSession(`${token}modified`)).resolves.toBeNull();
  });
});
