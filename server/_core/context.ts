import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { Account } from "../../drizzle/schema";
import { parse as parseCookieHeader } from "cookie";
import { verifyAccountSession, ACCOUNT_SESSION_COOKIE } from "../auth/accountSession";
import * as db from "../db";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  account: Account | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let account: Account | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }
  try {
    const token = parseCookieHeader(opts.req.headers.cookie ?? "")[ACCOUNT_SESSION_COOKIE];
    const session = await verifyAccountSession(token);
    if (session) { const loaded = await db.getAccountById(session.accountId); if (loaded?.isActive) account = loaded; }
  } catch { account = null; }

  return {
    req: opts.req,
    res: opts.res,
    user,
    account,
  };
}
