import { expect, test } from "@playwright/test";

test.describe("PRD smoke", () => {
  test("version endpoint is reachable", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/version`);
    expect(res.ok(), await res.text()).toBeTruthy();
  });
});
