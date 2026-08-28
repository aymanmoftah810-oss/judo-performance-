import { timingSafeEqual } from "node:crypto";

function configuredToken(): string {
  return process.env.INITIAL_ADMIN_SETUP_TOKEN ?? "";
}

/** يتحقق خادميًا فقط من رمز تهيئة أول ADMIN؛ لا يعيد الرمز ولا يسجله. */
export function hasInitialAdminSetupToken(): boolean {
  return configuredToken().length >= 24;
}

export function matchesInitialAdminSetupToken(candidate: string): boolean {
  const expected = configuredToken();
  if (!expected || !candidate) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const candidateBytes = Buffer.from(candidate, "utf8");

  return (
    expectedBytes.length === candidateBytes.length &&
    timingSafeEqual(expectedBytes, candidateBytes)
  );
}
