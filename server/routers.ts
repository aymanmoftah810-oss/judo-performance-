import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { accountAdminProcedure, accountProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ACCOUNT_SESSION_COOKIE, createAccountSession } from "./auth/accountSession";
import { generateTemporaryPassword, hashPassword, validatePassword, verifyPassword } from "./auth/passwords";
import { hasInitialAdminSetupToken, matchesInitialAdminSetupToken } from "./auth/initialization";
import * as db from "./db";
import { playerDataRouter } from "./playerDataRouter";

const credentialsInput = z.object({ username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, "اسم المستخدم يقبل الحروف والأرقام و._- فقط"), password: z.string().min(1).max(256) });
const bootstrapInput = credentialsInput.extend({ displayName: z.string().trim().min(2).max(160), setupToken: z.string().min(1).max(256) });
const createAccountInput = z.object({ username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, "اسم المستخدم يقبل الحروف والأرقام و._- فقط"), displayName: z.string().trim().min(2).max(160), role: z.enum(["COACH", "PLAYER"]), playerId: z.number().int().positive().nullable().optional() });
async function establishAccountSession(ctx: { res: { cookie: Function }; req: Parameters<typeof getSessionCookieOptions>[0] }, account: { id: number; username: string; role: "ADMIN" | "COACH" | "PLAYER" }) { const token = await createAccountSession({ accountId: account.id, username: account.username, role: account.role }); ctx.res.cookie(ACCOUNT_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: 12 * 60 * 60 * 1000 }); }

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  accounts: router({
    status: publicProcedure.query(async () => ({ initialized: Boolean(await db.getAccountSetting("initial_admin_locked")), setupTokenConfigured: hasInitialAdminSetupToken() })),
    bootstrap: publicProcedure.input(bootstrapInput).mutation(async ({ ctx, input }) => {
      if (!matchesInitialAdminSetupToken(input.setupToken)) throw new TRPCError({ code: "FORBIDDEN", message: "تعذر التحقق من بيانات التهيئة" });
      const passwordIssue = validatePassword(input.password); if (passwordIssue) throw new TRPCError({ code: "BAD_REQUEST", message: passwordIssue });
      let account;
      try { account = await db.bootstrapInitialAdmin({ username: input.username, displayName: input.displayName, passwordHash: await hashPassword(input.password), role: "ADMIN", playerId: null, isActive: true, mustChangePassword: false }); }
      catch (error) { const code = error instanceof Error ? error.message : ""; if (code === "INITIAL_ADMIN_LOCKED") throw new TRPCError({ code: "FORBIDDEN", message: "تمت تهيئة أول حساب إداري بالفعل" }); if (code === "ACCOUNT_USERNAME_EXISTS") throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم بالفعل" }); throw error; }
      await db.writeAuditLog(account.id, "BOOTSTRAP_INITIAL_ADMIN", "account", String(account.id), { accountId: account.id, role: "ADMIN" });
      await establishAccountSession(ctx, account); return { account: { id: account.id, username: account.username, displayName: account.displayName, role: account.role }, initialized: true };
    }),
    login: publicProcedure.input(credentialsInput).mutation(async ({ ctx, input }) => { const account = await db.getAccountByUsername(input.username); if (!account || !account.isActive || !(await verifyPassword(input.password, account.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "اسم المستخدم أو كلمة المرور غير صحيحة" }); await db.updateAccount(account.id, { lastSignedIn: new Date() }); await establishAccountSession(ctx, account); return { account: { id: account.id, username: account.username, displayName: account.displayName, role: account.role, mustChangePassword: account.mustChangePassword } }; }),
    me: accountProcedure.query(({ ctx }) => ({ id: ctx.account.id, username: ctx.account.username, displayName: ctx.account.displayName, role: ctx.account.role, playerId: ctx.account.playerId, mustChangePassword: ctx.account.mustChangePassword })),
    logout: accountProcedure.mutation(({ ctx }) => { ctx.res.clearCookie(ACCOUNT_SESSION_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 }); return { success: true }; }),
    changePassword: accountProcedure.input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1).max(256) })).mutation(async ({ ctx, input }) => { if (!(await verifyPassword(input.currentPassword, ctx.account.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور الحالية غير صحيحة" }); const issue = validatePassword(input.newPassword); if (issue) throw new TRPCError({ code: "BAD_REQUEST", message: issue }); await db.updateAccount(ctx.account.id, { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false }); await db.writeAuditLog(ctx.account.id, "CHANGE_PASSWORD", "account", String(ctx.account.id), { accountId: ctx.account.id }); return { success: true }; }),
    create: accountAdminProcedure.input(createAccountInput).mutation(async ({ ctx, input }) => { if (input.role === "PLAYER" && !input.playerId) throw new TRPCError({ code: "BAD_REQUEST", message: "ربط اللاعب مطلوب لحساب PLAYER" }); if (await db.getAccountByUsername(input.username)) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم بالفعل" }); if (input.role === "PLAYER" && input.playerId) { const [profile, linked] = await Promise.all([db.getPlayerProfileById(input.playerId), db.getAccountByPlayerProfileId(input.playerId)]); if (!profile) throw new TRPCError({ code: "BAD_REQUEST", message: "سجل اللاعب المركزي غير موجود؛ سجّل اللاعب أولًا" }); if (linked) throw new TRPCError({ code: "CONFLICT", message: "هذا السجل مرتبط بالفعل بحساب PLAYER آخر" }); } const temporaryPassword = generateTemporaryPassword(); const account = await db.createAccount({ username: input.username, displayName: input.displayName, passwordHash: await hashPassword(temporaryPassword), role: input.role, playerId: input.playerId ?? null, isActive: true, mustChangePassword: true }); await db.writeAuditLog(ctx.account.id, "CREATE_ACCOUNT", "account", String(account.id), { accountId: account.id, role: account.role, playerProfileId: account.playerId }); return { account: { id: account.id, username: account.username, displayName: account.displayName, role: account.role, playerId: account.playerId }, temporaryPassword }; }),
    resetPassword: accountAdminProcedure.input(z.object({ accountId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const target = await db.getAccountById(input.accountId); if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود" }); const temporaryPassword = generateTemporaryPassword(); const account = await db.updateAccount(target.id, { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true }); await db.writeAuditLog(ctx.account.id, "RESET_PASSWORD", "account", String(account.id), { accountId: account.id }); return { account: { id: account.id, username: account.username, displayName: account.displayName, role: account.role, playerId: account.playerId }, temporaryPassword }; }),
    setActive: accountAdminProcedure.input(z.object({ accountId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => { if (ctx.account.id === input.accountId && !input.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن للمدير تعطيل حسابه الحالي" }); const account = await db.updateAccount(input.accountId, { isActive: input.isActive }); await db.writeAuditLog(ctx.account.id, input.isActive ? "ACTIVATE_ACCOUNT" : "DEACTIVATE_ACCOUNT", "account", String(account.id), { accountId: account.id, isActive: account.isActive }); return { id: account.id, isActive: account.isActive }; }),
    list: accountAdminProcedure.query(async () => (await db.listAccounts()).map((account) => ({ id: account.id, username: account.username, displayName: account.displayName, role: account.role, playerId: account.playerId, isActive: account.isActive, mustChangePassword: account.mustChangePassword }))),
  }),
  playerData: playerDataRouter,

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
