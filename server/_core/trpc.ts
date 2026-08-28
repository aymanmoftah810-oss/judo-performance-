import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const accountProcedure = t.procedure.use(t.middleware(async ({ ctx, next }) => {
  if (!ctx.account) throw new TRPCError({ code: "UNAUTHORIZED", message: "يلزم تسجيل الدخول بحساب المنصة" });
  return next({ ctx: { ...ctx, account: ctx.account } });
}));

export const accountWorkProcedure = accountProcedure.use(t.middleware(async ({ ctx, next }) => {
  if (!ctx.account || ctx.account.mustChangePassword) throw new TRPCError({ code: "FORBIDDEN", message: "يجب تغيير كلمة المرور المؤقتة قبل تنفيذ عمليات البيانات" });
  return next({ ctx: { ...ctx, account: ctx.account } });
}));

export const accountAdminProcedure = t.procedure.use(t.middleware(async ({ ctx, next }) => {
  if (!ctx.account || ctx.account.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية متاحة للمدير فقط" });
  return next({ ctx: { ...ctx, account: ctx.account } });
}));

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
