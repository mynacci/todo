import { expect, test as anon } from "@playwright/test";
import { loginContext, test } from "./auth-fixture";

anon("unauthenticated /board redirects to /login with a GitHub login button", async ({ page }) => {
  await page.goto("/board");
  await expect(page).toHaveURL(/\/login\?next=%2Fboard$/);
  const button = page.getByRole("link", { name: "GitHub로 로그인" });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("href", "/auth/github?next=%2Fboard");
  for (const path of ["/goals", "/weeks", "/weeks/abc"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});

anon("/login?error=... shows an error message", async ({ page }) => {
  await page.goto("/login?error=OAUTH_DENIED");
  // Next's route announcer is also role=alert once hydrated, so match on the message.
  await expect(page.getByRole("alert").filter({ hasText: "GitHub 로그인이 취소" })).toBeVisible();
});

test("logged-in nav shows login; logout returns to /login and /board redirects again", async ({
  page,
  login,
}) => {
  await page.goto("/board");
  await expect(page.getByTestId("nav-login")).toHaveText(`@${login}`);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/board$/); // already logged in

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("link", { name: "GitHub로 로그인" })).toBeVisible();
  await page.goto("/board");
  await expect(page).toHaveURL(/\/login\?next=%2Fboard$/);
});

test("a second user cannot see the first user's todos", async ({ page, request, browser, baseURL }) => {
  const title = `private-${Date.now()}`;
  const res = await request.post("/api/todos", { data: { title } });
  expect(res.ok()).toBeTruthy();
  await page.goto("/board");
  await page.getByRole("tab", { name: "상태별" }).click();
  await expect(page.getByText(title)).toBeVisible();

  const other = await browser.newContext({ baseURL });
  await loginContext(other, baseURL!, `other${Date.now()}`);
  const page2 = await other.newPage();
  const mine = `mine-${Date.now()}`;
  expect((await other.request.post("/api/todos", { data: { title: mine } })).ok()).toBeTruthy();
  await page2.goto("/board");
  await page2.getByRole("tab", { name: "상태별" }).click();
  await expect(page2.getByText(mine)).toBeVisible();
  await expect(page2.getByText(title)).toHaveCount(0);
  await other.close();
});

