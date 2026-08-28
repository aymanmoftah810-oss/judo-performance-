import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "./db";

describe("سلامة سجل العمليات", () => {
  it("AUDIT-D-001: يستبعد كلمة المرور والرمز والسر وملف الارتباط من metadata", () => {
    const metadata = sanitizeAuditMetadata({ accountId: 7, role: "COACH", passwordHash: "hash", setupToken: "hidden", secretHint: "hidden", authorization: "Bearer hidden", cookie: "hidden" });
    expect(metadata).toBe(JSON.stringify({ accountId: 7, role: "COACH" }));
    expect(metadata).not.toMatch(/hash|hidden|Bearer/i);
  });
});
