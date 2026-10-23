import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./auth-fixture";

async function post<T>(request: APIRequestContext, path: string, body: unknown): Promise<T> {
  const res = await request.post(path, { data: body });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data as T;
}

async function seed(request: APIRequestContext, name: string) {
  const week = await post<{ id: string }>(request, "/api/weeks", {
    title: `${name} week`,
    startDate: "2030-01-07",
    endDate: "2030-01-13",
  });
  const todo = await post<{ id: string }>(request, "/api/todos", {
    title: `${name} card`,
    weekId: week.id,
  });
  await post(request, "/api/todos", { title: `${name} other`, weekId: week.id, status: "done" });
  return { week, todo };
}

async function dragWithPointer(
  page: Page,
  from: ReturnType<Page["locator"]>,
  to: ReturnType<Page["locator"]>,
) {
  const saved = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes("/api/todos/"),
  );
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await page.mouse.up();
  expect((await saved).ok()).toBeTruthy();
}

test("AC-7: pointer drag todo -> doing persists after reload and updates week progress", async ({
  page,
  request,
}) => {
  const { week, todo } = await seed(request, "ac7");
  await page.goto(`/weeks/${week.id}`);
  await expect(page.getByText("1/2 · 50%")).toBeVisible();

  const card = page.getByTestId(`card-${todo.id}`);
  await expect(page.getByTestId("column-todo").getByTestId(`card-${todo.id}`)).toBeVisible();
  await dragWithPointer(page, card, page.getByTestId("column-doing"));
  await expect(page.getByTestId("column-doing").getByTestId(`card-${todo.id}`)).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("column-doing").getByTestId(`card-${todo.id}`)).toBeVisible();
  await expect(page.getByText("1/2 · 50%")).toBeVisible();

  // drag doing -> done: progress becomes 2/2
  await dragWithPointer(
    page,
    page.getByTestId(`card-${todo.id}`),
    page.getByTestId("column-done"),
  );
  await expect(page.getByText("2/2 · 100%").first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("column-done").getByTestId(`card-${todo.id}`)).toBeVisible();
});

test("AC-7: keyboard drag todo -> doing persists after reload", async ({ page, request }) => {
  const { week, todo } = await seed(request, "kbd");
  await page.goto(`/weeks/${week.id}`);
  const card = page.getByTestId(`card-${todo.id}`);
  await card.focus();
  // dnd-kit measures droppables asynchronously after pick-up and announces each step in its
  // live region; wait for those announcements instead of firing keys back-to-back.
  const announce = page.getByRole("status").filter({ hasText: "Draggable item" });
  await page.keyboard.press("Space");
  await expect(announce).toContainText(`over droppable area ${todo.id}`); // picked up, rects measured
  await page.keyboard.press("ArrowRight");
  await expect(announce).not.toContainText(`over droppable area ${todo.id}`); // moved to another target
  const saved = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes("/api/todos/"),
  );
  await page.keyboard.press("Space");
  expect((await saved).ok()).toBeTruthy();
  await expect(page.getByTestId("column-doing").getByTestId(`card-${todo.id}`)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("column-doing").getByTestId(`card-${todo.id}`)).toBeVisible();
});

test("AC-8: delete asks for confirmation; cancel keeps, confirm removes", async ({
  page,
  request,
}) => {
  const { week, todo } = await seed(request, "ac8");
  await page.goto(`/weeks/${week.id}`);
  const card = page.getByTestId(`card-${todo.id}`);
  await card.getByRole("button", { name: "ac8 card 삭제" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toBeVisible();
  await page.reload();
  await expect(page.getByTestId(`card-${todo.id}`)).toBeVisible();

  await page.getByTestId(`card-${todo.id}`).getByRole("button", { name: "ac8 card 삭제" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "삭제" }).click();
  await expect(page.getByTestId(`card-${todo.id}`)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId(`card-${todo.id}`)).toHaveCount(0);
});
