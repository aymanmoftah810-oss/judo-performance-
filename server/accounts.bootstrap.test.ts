import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  bootstrapInitialAdmin: vi.fn(), getAccountSetting: vi.fn(), getAccountByUsername: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), getAccountById: vi.fn(), listAccounts: vi.fn(), setAccountSetting: vi.fn(), writeAuditLog: vi.fn(),
}));
vi.mock("./db", () => mock);

import { appRouter } from "./routers";

function context() { return { user: null, account: null, req: { protocol: "https", headers: {} }, res: { cookie: vi.fn(), clearCookie: vi.fn() } } as any; }
const input = () => ({ displayName: "مدير الاختبار", username: "admin.bootstrap", password: "StrongPass2026!", setupToken: process.env.INITIAL_ADMIN_SETUP_TOKEN ?? "" });

describe("تهيئة أول ADMIN", () => {
  beforeEach(() => { vi.clearAllMocks(); mock.writeAuditLog.mockResolvedValue(undefined); mock.getAccountSetting.mockResolvedValue(null); mock.bootstrapInitialAdmin.mockResolvedValue({ id: 9, username: "admin.bootstrap", displayName: "مدير الاختبار", role: "ADMIN", playerId: null, isActive: true, mustChangePassword: false }); });
  it("AUTH-B-004: يقبل الرمز الصحيح، لا يعيده، ويضع جلسة حساب فقط", async () => {
    const ctx = context(); const result = await appRouter.createCaller(ctx).accounts.bootstrap(input());
    expect(result.initialized).toBe(true); expect(JSON.stringify(result)).not.toContain(input().setupToken); expect(mock.bootstrapInitialAdmin).toHaveBeenCalledTimes(1); expect(ctx.res.cookie).toHaveBeenCalledTimes(1);
  });
  it("AUTH-B-005: يرفض الرمز الخاطئ دون استدعاء قاعدة البيانات", async () => {
    await expect(appRouter.createCaller(context()).accounts.bootstrap({ ...input(), setupToken: "incorrect-token" })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mock.bootstrapInitialAdmin).not.toHaveBeenCalled();
  });
  it("AUTH-B-006: يعيد القفل الذري رفضًا واضحًا عند تهيئة الحساب مسبقًا", async () => {
    mock.bootstrapInitialAdmin.mockRejectedValue(new Error("INITIAL_ADMIN_LOCKED")); await expect(appRouter.createCaller(context()).accounts.bootstrap(input())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
