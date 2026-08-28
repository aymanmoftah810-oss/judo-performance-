import { SignJWT, jwtVerify } from "jose";

export const ACCOUNT_SESSION_COOKIE = "judo_account_session";
const sessionSecret = () => new TextEncoder().encode(process.env.JWT_SECRET ?? "");

export type AccountSession = { accountId: number; role: "ADMIN" | "COACH" | "PLAYER"; username: string };

export async function createAccountSession(session: AccountSession): Promise<string> {
  return new SignJWT({ kind: "judo-account", accountId: session.accountId, role: session.role, username: session.username })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime("12h").sign(sessionSecret());
}

export async function verifyAccountSession(token: string | undefined): Promise<AccountSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    const accountId = Number(payload.accountId);
    if (payload.kind !== "judo-account" || !Number.isSafeInteger(accountId) || typeof payload.username !== "string" || !["ADMIN", "COACH", "PLAYER"].includes(String(payload.role))) return null;
    return { accountId, username: payload.username, role: payload.role as AccountSession["role"] };
  } catch { return null; }
}
