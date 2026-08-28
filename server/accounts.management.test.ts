import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ bootstrapInitialAdmin: vi.fn(), getAccountSetting: vi.fn(), getAccountByUsername: vi.fn(), getAccountByPlayerProfileId: vi.fn(), getPlayerProfileById: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), getAccountById: vi.fn(), listAccounts: vi.fn(), setAccountSetting: vi.fn(), writeAuditLog: vi.fn() }));
vi.mock("./db", () => mock);
import { appRouter } from "./routers";

const admin = { id: 1, username: "admin", displayName: "المدير", passwordHash: "scrypt$salt$deadbeef", role: "ADMIN", playerId: null, isActive: true, mustChangePassword: false, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: null } as any;
const coach = { id: 2, username: "coach.one", displayName: "مدرب واحد", passwordHash: "scrypt$salt$deadbeef", role: "COACH", playerId: null, isActive: true, mustChangePassword: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: null } as any;
const context = (account: any = null) => ({ user: null, account, req: { protocol: "https", headers: {} }, res: { cookie: vi.fn(), clearCookie: vi.fn() } } as any);

describe("إدارة حسابات Phase B", () => {
  beforeEach(() => { vi.clearAllMocks(); mock.writeAuditLog.mockResolvedValue(undefined); mock.getAccountByUsername.mockResolvedValue(undefined); mock.getAccountByPlayerProfileId.mockResolvedValue(undefined); mock.getPlayerProfileById.mockResolvedValue({ id: 77 }); mock.createAccount.mockResolvedValue(coach); mock.updateAccount.mockResolvedValue({ ...coach, isActive: false }); });
  it("AUTH-B-007: ينشئ المدير حساب COACH بكلمة مؤقتة غير مخزنة نصًا", async () => {
    const result = await appRouter.createCaller(context(admin)).accounts.create({ displayName: "مدرب واحد", username: "coach.one", role: "COACH", playerId: null });
    expect(result.temporaryPassword).toHaveLength(18); const stored = mock.createAccount.mock.calls[0][0]; expect(stored.passwordHash).toMatch(/^scrypt\$/); expect(stored.passwordHash).not.toContain(result.temporaryPassword); expect(stored.mustChangePassword).toBe(true);
  });
  it("AUTH-B-008: يرفض حساب PLAYER غير المرتبط بلاعب ويرفض الطلب غير المخول", async () => {
    await expect(appRouter.createCaller(context(admin)).accounts.create({ displayName: "لاعب", username: "player.one", role: "PLAYER", playerId: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(appRouter.createCaller(context()).accounts.create({ displayName: "مدرب", username: "coach.two", role: "COACH", playerId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("AUTH-B-008B: ينشئ حساب PLAYER مرتبطًا بلاعب مع تجزئة كلمة المرور المؤقتة", async () => {
    const playerAccount = { ...coach, id: 3, username: "player.one", displayName: "لاعب واحد", role: "PLAYER", playerId: 77 }; mock.createAccount.mockResolvedValueOnce(playerAccount);
    const result = await appRouter.createCaller(context(admin)).accounts.create({ displayName: "لاعب واحد", username: "player.one", role: "PLAYER", playerId: 77 });
    const stored = mock.createAccount.mock.calls[0][0]; expect(result.account).toMatchObject({ role: "PLAYER", playerId: 77 }); expect(stored).toMatchObject({ role: "PLAYER", playerId: 77, mustChangePassword: true }); expect(stored.passwordHash).toMatch(/^scrypt\$/); expect(stored.passwordHash).not.toContain(result.temporaryPassword);
  });
  it("RBAC-C-007: يرفض إنشاء PLAYER إذا كان سجل اللاعب غير موجود أو مرتبطًا بحساب آخر", async () => {
    mock.getPlayerProfileById.mockResolvedValueOnce(undefined);
    await expect(appRouter.createCaller(context(admin)).accounts.create({ displayName: "لاعب", username: "player.missing", role: "PLAYER", playerId: 77 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    mock.getAccountByPlayerProfileId.mockResolvedValueOnce({ id: 9 });
    await expect(appRouter.createCaller(context(admin)).accounts.create({ displayName: "لاعب", username: "player.linked", role: "PLAYER", playerId: 77 })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("AUTH-B-010: يعيد المدير تعيين كلمة المرور بتجزئة وكلمة مؤقتة تعرض لمرة واحدة", async () => {
    mock.getAccountById.mockResolvedValueOnce(coach); mock.updateAccount.mockResolvedValueOnce({ ...coach, mustChangePassword: true });
    const result = await appRouter.createCaller(context(admin)).accounts.resetPassword({ accountId: 2 });
    const stored = mock.updateAccount.mock.calls[0][1]; expect(result.temporaryPassword).toHaveLength(18); expect(stored).toMatchObject({ mustChangePassword: true }); expect(stored.passwordHash).toMatch(/^scrypt\$/); expect(stored.passwordHash).not.toContain(result.temporaryPassword);
  });
  it("AUTH-B-009: يمنع المدير من تعطيل حسابه الحالي ويسمح بتعطيل حساب آخر", async () => {
    await expect(appRouter.createCaller(context(admin)).accounts.setActive({ accountId: 1, isActive: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(appRouter.createCaller(context(admin)).accounts.setActive({ accountId: 2, isActive: false })).resolves.toEqual({ id: 2, isActive: false });
  });
});
