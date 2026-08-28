import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function createPlayer(page: import("@playwright/test").Page, name: string, birthYear = "2012") {
  await page.goto("/?view=players");
  await page.getByRole("button", { name: "إضافة لاعب" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").nth(0).fill(name);
  await dialog.locator("input").nth(3).fill(birthYear);
  await dialog.getByRole("button", { name: "إضافة اللاعب" }).click();
  await expect(page.getByText("تمت إضافة اللاعب بنجاح")).toBeVisible();
}

async function clearOfflineStore(page: import("@playwright/test").Page) {
  await page.goto("/__e2e__/blank.html");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    localStorage.clear();
    const deletion = indexedDB.deleteDatabase("judo-performance-offline");
    deletion.onsuccess = () => resolve(); deletion.onerror = () => reject(deletion.error); deletion.onblocked = () => reject(new Error("تعذر عزل قاعدة بيانات الاختبار"));
  }));
}

test("PLAYER-UI-001: عمليات اللاعب تعرض رسائل نجاح من الواجهة", async ({ page }) => {
  await createPlayer(page, "لاعب متصفح");
  await page.getByRole("button", { name: "تعديل اللاعب لاعب متصفح" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").nth(0).fill("لاعب متصفح محدّث");
  await dialog.getByRole("button", { name: "حفظ التعديلات" }).click();
  await expect(page.getByText("تم تحديث بيانات اللاعب بنجاح")).toBeVisible();
  page.once("dialog", (confirm) => confirm.accept());
  await page.getByRole("button", { name: "حذف اللاعب لاعب متصفح محدّث" }).click();
  await expect(page.getByText("تم حذف اللاعب منطقيًا ويمكن استرجاع سجلّه")).toBeVisible();
});

test("PLAYER-UI-002: واجهة اللاعبين تعرض رسالة فشل للبيانات غير الصالحة", async ({ page }) => {
  await page.goto("/?view=players");
  await page.getByRole("button", { name: "إضافة لاعب" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").nth(0).fill("لاعب غير صالح");
  await dialog.locator("input").nth(3).fill("1800");
  await dialog.getByRole("button", { name: "إضافة اللاعب" }).click();
  await expect(page.getByText("سنة الميلاد غير صحيحة")).toBeVisible();
});

test("STD-UI-001 وTIME-UI-001: تعديل معيار عبر الواجهة ينعكس في زمن الاختبار", async ({ page }) => {
  await page.goto("/?view=standards");
  await page.getByRole("button", { name: /تعديل معيار الضغط ذكر تحت 9/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").nth(2).fill("31");
  await dialog.getByRole("button", { name: "حفظ المعيار" }).click();
  await expect(page.getByText("تم حفظ التعديلات")).toBeVisible();
  await createPlayer(page, "لاعب زمن", String(new Date().getFullYear() - 8));
  await page.goto("/?view=tests");
  const selects = page.locator("select");
  const playerOption = selects.nth(0).locator("option").filter({ hasText: "لاعب زمن" });
  await selects.nth(0).selectOption(await playerOption.getAttribute("value") ?? "");
  await selects.nth(1).selectOption("1");
  await expect(page.getByText("زمن التنفيذ: 31 ثانية")).toBeVisible();
});

test("NAV-UI-001: الشاشات الرئيسية متاحة من الواجهة", async ({ page }) => {
  const pages = [
    ["players", "إدارة اللاعبين"], ["tests", "الاختبارات والجلسات"], ["standards", "إدارة المعايير والاختبارات"],
    ["attendance", "الحضور"], ["reports", "التقارير"], ["backup", "نسخ احتياطي ومزامنة"], ["accounts", "الحسابات والمصادقة"], ["readiness", "الجاهزية التقنية"],
  ] as const;
  for (const [view, heading] of pages) {
    await page.goto(`/?view=${view}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("REPORT-E-UI-001: تنزّل التقارير Excel وPDF عربيًا كملفات محلية", async ({ page }) => {
  await page.goto("/?view=reports");
  await expect(page.getByRole("button", { name: "تصدير Excel" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير Excel" }).click();
  await expect((await downloadPromise).suggestedFilename()).toMatch(/^judo-performance-report-.*\.xlsx$/);
  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير PDF" }).click();
  const pdf = await pdfDownloadPromise;
  await expect(pdf.suggestedFilename()).toMatch(/^judo-performance-report-.*\.pdf$/);
  const pdfPath = await pdf.path(); expect(pdfPath).not.toBeNull();
  expect((await readFile(pdfPath!)).subarray(0, 5).toString()).toBe("%PDF-");
});

test("MOBILE-F-UI-001: التنقل العربي يبقى قابلًا للتمرير وبمساحات لمس مناسبة على الهاتف", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?view=reports");
  const nav = page.getByRole("navigation", { name: "أقسام النظام" });
  await expect(nav).toBeVisible();
  await expect(page.getByRole("button", { name: "التقارير" })).toHaveAttribute("aria-current", "page");
  const geometry = await nav.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, minButtonHeight: Math.min(...Array.from(element.querySelectorAll("button")).map((button) => button.getBoundingClientRect().height)) }));
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  expect(geometry.minButtonHeight).toBeGreaterThanOrEqual(44);
});

test("MOBILE-F-UI-002: شاشات البيانات لا تتجاوز عرض الهاتف في RTL", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const views = [["players", "إدارة اللاعبين"], ["standards", "إدارة المعايير والاختبارات"], ["attendance", "الحضور"], ["accounts", "الحسابات والمصادقة"]] as const;
  for (const [view, heading] of views) {
    await page.goto(`/?view=${view}`);
    await page.getByRole("heading", { name: heading }).waitFor();
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }
});

test("MOBILE-F-UI-003: نموذج اللاعب والبطاقات والجداول تبقى ضمن viewport الهاتف", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?view=players");
  await page.getByRole("heading", { name: "إدارة اللاعبين" }).waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "إضافة لاعب" }).click();
  const dialogBox = await page.getByRole("dialog").boundingBox(); expect(dialogBox).not.toBeNull(); expect(dialogBox!.x).toBeGreaterThanOrEqual(0); expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(375);
  const inputs = page.getByRole("dialog").locator("input, select, textarea");
  for (let index = 0; index < await inputs.count(); index += 1) { const box = await inputs.nth(index).boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(375); }
  await page.keyboard.press("Escape");
  const tableContainer = page.locator("table").first().locator(".."); const tableBox = await tableContainer.boundingBox(); expect(tableBox).not.toBeNull(); expect(tableBox!.x).toBeGreaterThanOrEqual(0); expect(tableBox!.x + tableBox!.width).toBeLessThanOrEqual(375);
  await page.goto("/?view=reports");
  await page.getByRole("heading", { name: "التقارير" }).waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const exportCard = page.getByRole("heading", { name: "بطاقة أداء قابلة للتصدير" }).locator(".."); const cardBox = await exportCard.boundingBox(); expect(cardBox).not.toBeNull(); expect(cardBox!.x).toBeGreaterThanOrEqual(0); expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(375);
  for (const name of ["تصدير Excel", "تصدير PDF", "تنزيل البطاقة PDF"]) { const box = await page.getByRole("button", { name }).boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(375); expect(box!.height).toBeGreaterThanOrEqual(44); }
});

test("PHASE-A-UI-001: يحفظ اللاعب اختيارات النادي والحزام ويقترح مجموعة الفئة", async ({ page }) => {
  const club = "نادي اختبار مرجعي"; const belt = "حزام اختبار مرجعي"; const player = "لاعب قوائم مرجعية";
  await page.goto("/?view=references");
  const clubCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "الأندية" }) });
  const beltCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "درجات الأحزمة" }) });
  await clubCard.getByRole("textbox").first().fill(club); await clubCard.getByRole("button", { name: "إضافة" }).click();
  await beltCard.getByRole("textbox").first().fill(belt); await beltCard.getByRole("button", { name: "إضافة" }).click();
  await page.goto("/?view=players"); await page.getByRole("button", { name: "إضافة لاعب" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").nth(0).fill(player); await dialog.locator("input").nth(3).fill(String(new Date().getFullYear() - 8));
  await dialog.locator("select").nth(0).selectOption({ label: club }); await dialog.locator("select").nth(1).selectOption({ label: belt });
  await dialog.getByRole("button", { name: "إضافة اللاعب" }).click();
  await expect(page.getByText("تمت إضافة اللاعب بنجاح")).toBeVisible();
  await page.getByRole("button", { name: `تعديل اللاعب ${player}` }).click();
  const edit = page.getByRole("dialog");
  await expect(edit.locator("select").nth(0)).toHaveValue(/\d+/); await expect(edit.locator("select").nth(1)).toHaveValue(/\d+/);
  await expect(edit.getByText("الفئة المحسوبة", { exact: true }).locator("..")).toContainText("تحت 9");
  await expect(edit.locator("select").nth(2)).toHaveValue(/\d+/);
});

test("PHASE-A-UI-002: تعرض واجهة البيانات المرجعية مراجعة المجموعة الموروثة المختلطة", async ({ page }) => {
  const year = new Date().getFullYear();
  await clearOfflineStore(page);
  await page.evaluate(({ youngYear, olderYear }) => {
    localStorage.setItem("judo:player:71", JSON.stringify({ id: 71, name: "لاعب مراجعة صغير", membershipNo: "R-71", gender: "ذكر", birthYear: youngYear, status: "مقيد", groupName: "مجموعة تحتاج مراجعة", createdAt: "2026-01-01T00:00:00.000Z" }));
    localStorage.setItem("judo:player:72", JSON.stringify({ id: 72, name: "لاعب مراجعة أكبر", membershipNo: "R-72", gender: "ذكر", birthYear: olderYear, status: "مقيد", groupName: "مجموعة تحتاج مراجعة", createdAt: "2026-01-01T00:00:00.000Z" }));
  }, { youngYear: year - 8, olderYear: year - 10 });
  await page.goto("/?view=references");
  await expect(page.getByText("مراجعة ترحيل مطلوبة")).toBeVisible();
  await expect(page.getByText("مجموعة تدريبية", { exact: true })).toBeVisible();
  await expect(page.getByText("مجموعة تحتاج مراجعة", { exact: true })).toBeVisible();
  await expect(page.getByText("قيد المراجعة", { exact: true })).toBeVisible();
});

test("PHASE-B-UI-001: تعرض شاشة الحسابات تهيئة آمنة أو تسجيل دخول دون كشف رمز التهيئة", async ({ page }) => {
  await page.goto("/?view=accounts");
  await expect(page.getByRole("heading", { name: "الحسابات والمصادقة" })).toBeVisible();
  const setup = page.getByRole("heading", { name: "تهيئة أول حساب ADMIN" }); const login = page.getByRole("heading", { name: "تسجيل الدخول" });
  await expect(setup.or(login)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(process.env.INITIAL_ADMIN_SETUP_TOKEN ?? "not-a-token");
});

test("PHASE-B-UI-002: يرفض رمز تهيئة خاطئ دون تغيير حالة الحسابات", async ({ page }) => {
  await page.goto("/?view=accounts");
  const setup = page.getByRole("heading", { name: "تهيئة أول حساب ADMIN" }); const login = page.getByRole("heading", { name: "تسجيل الدخول" });
  await setup.or(login).waitFor();
  if (await setup.isVisible()) {
    const card = setup.locator("..").locator("..");
    await card.getByRole("textbox").nth(0).fill("مدير اختبار واجهة"); await card.getByRole("textbox").nth(1).fill("admin.ui.check");
    await card.locator('input[type="password"]').nth(0).fill("StrongPassword2026!"); await card.locator('input[type="password"]').nth(1).fill("incorrect-token");
    await card.getByRole("button", { name: "إنشاء أول ADMIN وقفل التهيئة" }).click();
    await expect(page.getByText("تعذر التحقق من بيانات التهيئة")).toBeVisible(); await expect(page.getByRole("heading", { name: "تهيئة أول حساب ADMIN" })).toBeVisible();
  } else await expect(login).toBeVisible();
});

test("RBAC-C-UI-001: حساب PLAYER يرى بطاقته فقط حتى عند فتح رابط وحدة الاختبارات", async ({ page }) => {
  const playerSnapshot = { name: "لاعب خاص", membershipNo: "P-1", playerCode: "P-1", gender: "ذكر", birthYear: 2012, weight: null, belt: "", club: "", address: "", phone: "", status: "active", groupName: "", joinDate: "2026-08-01", notes: "", deletedAt: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
  await page.addInitScript(() => { (navigator.serviceWorker as unknown as { register: () => Promise<never> }).register = () => new Promise<never>(() => undefined); });
  await page.goto("/__e2e__/blank.html");
  await page.evaluate(async () => { await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister())); await Promise.all((await caches.keys()).map((name) => caches.delete(name))); });
  await page.route("**/api/trpc/**", async (route) => {
    const endpointPath = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const payload = endpointPath.split(",").map((endpoint) => {
      if (endpoint === "accounts.status") return { result: { data: { json: { initialized: true, setupTokenConfigured: true } } } };
      if (endpoint === "accounts.me") return { result: { data: { json: { id: 303, username: "player.private", displayName: "لاعب خاص", role: "PLAYER", playerId: 501, mustChangePassword: false } } } };
      if (endpoint === "playerData.visibleData") return { result: { data: { json: { profiles: [{ id: 501, syncId: "player-private-501", sourceLocalId: 91, snapshot: JSON.stringify(playerSnapshot) }], results: [{ id: 71, syncId: "result-private-71", playerProfileId: 501, sourceLocalId: 71, testId: 1, value: 24, score: 9, rating: "ممتاز", date: "2026-08-27", notes: "نتيجة خاصة", deletedAt: null, createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" }] } } } };
      return { error: { json: { message: "إجراء اختبار غير متوقع", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } } } };
    });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.goto("/?view=tests");
  await expect(page.getByRole("heading", { name: "لاعب خاص" })).toBeVisible();
  await expect(page.getByText("سجل النتائج")).toBeVisible();
  await expect(page.getByText("2026-08-27")).toBeVisible();
  await expect(page.getByText("ممتاز · 9/5")).toBeVisible();
  await expect(page.getByRole("button", { name: "الاختبارات" })).toHaveCount(0);
  await expect(page.getByText("الاختبارات والجلسات")).toHaveCount(0);
});

test("SYNC-D-UI-001: المزامنة اليدوية ترسل عملية اللاعب المعلقة فقط عند طلب ADMIN وتعلّمها Synced", async ({ page }) => {
  let profileUpserts = 0;
  await page.addInitScript(() => { (navigator.serviceWorker as unknown as { register: () => Promise<never> }).register = () => new Promise<never>(() => undefined); });
  await page.goto("/__e2e__/blank.html");
  await page.evaluate(async () => { localStorage.clear(); await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister())); await Promise.all(["judo-performance-offline", "judo-performance-offline-account-707"].map((name) => new Promise<void>((resolve) => { const deletion = indexedDB.deleteDatabase(name); deletion.onsuccess = () => resolve(); deletion.onerror = () => resolve(); }))); });
  await page.route("**/api/trpc/**", async (route) => {
    const endpoints = (new URL(route.request().url()).pathname.split("/").pop() ?? "").split(",");
    const payload = endpoints.map((endpoint) => {
      if (endpoint === "accounts.status") return { result: { data: { json: { initialized: true, setupTokenConfigured: true } } } };
      if (endpoint === "accounts.me") return { result: { data: { json: { id: 707, username: "admin.sync", displayName: "مدير المزامنة", role: "ADMIN", playerId: null, mustChangePassword: false } } } };
      if (endpoint === "playerData.visibleData") return { result: { data: { json: { profiles: [], results: [] } } } };
      if (endpoint === "playerData.upsertProfile") { profileUpserts += 1; return { result: { data: { json: { profile: { id: 801, syncId: "profile-synced-801", revision: 1, sourceLocalId: 1, name: "لاعب مزامنة", gender: "ذكر", birthYear: 2012, archivedAt: null, createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" } } } } }; }
      return { error: { json: { message: "إجراء اختبار غير متوقع", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } } } };
    });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
  });
  await createPlayer(page, "لاعب مزامنة");
  await page.goto("/?view=backup");
  await expect(page.getByRole("button", { name: "تنفيذ مزامنة يدوية" })).toBeEnabled();
  await page.getByRole("button", { name: "تنفيذ مزامنة يدوية" }).click();
  await expect.poll(() => profileUpserts, { timeout: 5_000 }).toBe(1);
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
});

test("SYNC-D-UI-002: تعارض مزامنة اللاعب يبقي العملية والنسختين للمراجعة ولا يحذف السجل المحلي", async ({ page }) => {
  await page.addInitScript(() => { (navigator.serviceWorker as unknown as { register: () => Promise<never> }).register = () => new Promise<never>(() => undefined); });
  await page.goto("/__e2e__/blank.html");
  await page.evaluate(async () => { localStorage.clear(); await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister())); await Promise.all(["judo-performance-offline", "judo-performance-offline-account-708"].map((name) => new Promise<void>((resolve) => { const deletion = indexedDB.deleteDatabase(name); deletion.onsuccess = () => resolve(); deletion.onerror = () => resolve(); }))); });
  await page.route("**/api/trpc/**", async (route) => {
    const endpoints = (new URL(route.request().url()).pathname.split("/").pop() ?? "").split(",");
    const payload = endpoints.map((endpoint) => {
      if (endpoint === "accounts.status") return { result: { data: { json: { initialized: true, setupTokenConfigured: true } } } };
      if (endpoint === "accounts.me") return { result: { data: { json: { id: 708, username: "admin.conflict", displayName: "مدير التعارض", role: "ADMIN", playerId: null, mustChangePassword: false } } } };
      if (endpoint === "playerData.visibleData") return { result: { data: { json: { profiles: [], results: [] } } } };
      if (endpoint === "playerData.upsertProfile") return { error: { json: { message: "تعارض مزامنة في سجل اللاعب؛ حُفظت النسختان للمراجعة", code: -32009, data: { code: "CONFLICT", httpStatus: 409 } } } };
      return { error: { json: { message: "إجراء اختبار غير متوقع", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } } } };
    });
    await route.fulfill({ status: 207, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await createPlayer(page, "لاعب تعارض");
  await page.goto("/?view=backup");
  await page.getByRole("button", { name: "تنفيذ مزامنة يدوية" }).click();
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  await expect(page.getByText("تعارضات تحتاج مراجعة إدارية")).toBeVisible();
  await expect(page.getByText("لاعب تعارض")).toHaveCount(0);
  await page.goto("/?view=players");
  await expect(page.getByText("لاعب تعارض")).toBeVisible();
});

test("COACH-D-UI-001: المدير يرى تعيين المدرب ويمكنه إلغاءه من الواجهة", async ({ page }) => {
  let unassignCalls = 0;
  await page.addInitScript(() => { (navigator.serviceWorker as unknown as { register: () => Promise<never> }).register = () => new Promise<never>(() => undefined); });
  await page.goto("/__e2e__/blank.html");
  await page.evaluate(async () => { await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister())); await new Promise<void>((resolve) => { const deletion = indexedDB.deleteDatabase("judo-performance-offline-account-709"); deletion.onsuccess = () => resolve(); deletion.onerror = () => resolve(); }); });
  await page.route("**/api/trpc/**", async (route) => {
    const endpoints = (new URL(route.request().url()).pathname.split("/").pop() ?? "").split(",");
    const payload = endpoints.map((endpoint) => {
      if (endpoint === "accounts.status") return { result: { data: { json: { initialized: true, setupTokenConfigured: true } } } };
      if (endpoint === "accounts.me") return { result: { data: { json: { id: 709, username: "admin.coach", displayName: "مدير المدربين", role: "ADMIN", playerId: null, mustChangePassword: false } } } };
      if (endpoint === "playerData.visibleData") return { result: { data: { json: { profiles: [], results: [] } } } };
      if (endpoint === "accounts.list") return { result: { data: { json: [{ id: 51, username: "coach.one", displayName: "المدرب الأول", role: "COACH", playerId: null, isActive: true, mustChangePassword: false }] } } };
      if (endpoint === "playerData.visibleProfiles") return { result: { data: { json: [{ id: 801, syncId: "profile-801", revision: 1, sourceDeviceId: null, sourceLocalId: 1, name: "لاعب النطاق", gender: "ذكر", birthYear: 2012, archivedAt: null, createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" }] } } };
      if (endpoint === "playerData.coachAssignments") return { result: { data: { json: [{ id: 3, coachAccountId: 51, playerProfileId: 801, assignedByAccountId: 709, isActive: true, createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" }] } } };
      if (endpoint === "playerData.assignCoach") { unassignCalls += 1; return { result: { data: { json: { success: true } } } }; }
      return { error: { json: { message: "إجراء اختبار غير متوقع", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } } } };
    });
    await route.fulfill({ status: 207, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.goto("/?view=accounts");
  const scopeCard = page.getByRole("article").filter({ hasText: "نطاق المدربين واللاعبين" });
  await expect(scopeCard).toBeVisible();
  await expect(scopeCard.getByText("المدرب الأول", { exact: true }).last()).toBeVisible();
  await scopeCard.getByRole("button", { name: "إلغاء التعيين" }).click();
  await expect.poll(() => unassignCalls).toBe(1);
  await expect(page.getByText("تم تحديث نطاق المدرب")).toBeVisible();
});

test("PWA-UI-001: عامل الخدمة قابل للترقية ولا يعيد مسار الحسابات إلى واجهة قديمة", async ({ page }) => {
  const worker = await page.request.get("/sw.js");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  const source = await worker.text();
  expect(source).toContain("skipWaiting");
  expect(source).toContain("clients.claim");
  await page.goto("/?view=accounts");
  await expect(page.getByRole("heading", { name: "الحسابات والمصادقة" })).toBeVisible();
});

test("PWA-UI-002: يرقّي عامل خدمة قديمًا تلقائيًا من دون إلغاء التسجيل أو مسح الذاكرة", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("judo-sw-reloaded", "1");
    const realRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    (window as Window & { __e2eRealServiceWorkerRegister?: typeof realRegister }).__e2eRealServiceWorkerRegister = realRegister;
    (navigator.serviceWorker as unknown as { register: () => Promise<{ update: () => Promise<void> }> }).register = () => Promise.resolve({ update: async () => undefined });
  });
  await page.goto("/?view=accounts");
  await page.evaluate(async () => {
    await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister()));
    await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
    const realRegister = (window as Window & { __e2eRealServiceWorkerRegister: ServiceWorkerContainer["register"] }).__e2eRealServiceWorkerRegister;
    await realRegister("/__e2e__/legacy-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  });
  await expect.poll(async () => page.evaluate(() => caches.keys())).toContain("judo-legacy-upgrade-check");
  await page.evaluate(async () => {
    const realRegister = (window as Window & { __e2eRealServiceWorkerRegister: ServiceWorkerContainer["register"] }).__e2eRealServiceWorkerRegister;
    const registration = await realRegister("/sw.js", { scope: "/" });
    await registration.update();
  });
  await expect.poll(async () => page.evaluate(() => caches.keys()), { timeout: 10_000 }).toContain("judo-performance-offline-v3");
  await expect.poll(async () => page.evaluate(() => caches.keys()), { timeout: 10_000 }).not.toContain("judo-legacy-upgrade-check");
  await expect.poll(async () => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ""), { timeout: 10_000 }).toContain("/sw.js");
  await expect(page.getByRole("heading", { name: "الحسابات والمصادقة" })).toBeVisible();
});
