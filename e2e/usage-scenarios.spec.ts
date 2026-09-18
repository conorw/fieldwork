import { test, expect } from "@playwright/test";
import { pause, saveScenarioVideo } from "./helpers/video";

async function openScenario(page: import("@playwright/test").Page, id: string) {
  await page.goto(`/dev/usage-demo?scenario=${id}`);
  await expect(page.getByTestId("usage-demo")).toBeVisible();
  await expect(page.getByTestId("scenario-id")).toHaveText(id);
  await pause(600);
}

test.describe("Usage scenarios (video)", () => {
  test.afterEach(async ({}, testInfo) => {
    const name =
      (testInfo.title.match(/\[video:([^\]]+)\]/) || [])[1] ||
      testInfo.title.replace(/\W+/g, "-").toLowerCase();
    saveScenarioVideo(testInfo, name);
  });

  test("[video:auth-sign-in] email sign-in", async ({ page }) => {
    await openScenario(page, "auth-sign-in");
    await page.getByTestId("input-email").fill("fieldworker@example.com");
    await pause(400);
    await page.getByTestId("btn-sign-in").click();
    await expect(page.getByTestId("auth-success")).toBeVisible();
    await pause(800);
  });

  test("[video:auth-sign-up] create account", async ({ page }) => {
    await openScenario(page, "auth-sign-up");
    await page.getByTestId("input-email").fill("new.user@example.com");
    await pause(400);
    await page.getByTestId("btn-sign-up").click();
    await expect(page.getByTestId("auth-success")).toBeVisible();
    await pause(800);
  });

  test("[video:join-cemetery] request to join public cemetery", async ({
    page,
  }) => {
    await openScenario(page, "join-cemetery");
    await page.getByTestId("input-join-search").fill("River");
    await pause(500);
    await page.getByTestId("btn-request-river").click();
    await expect(page.getByTestId("join-success")).toBeVisible();
    await pause(900);
  });

  test("[video:teach-finish-later] defer teaching", async ({ page }) => {
    await openScenario(page, "teach-finish-later");
    await pause(500);
    await page.getByTestId("btn-finish-later").click();
    await expect(page.getByTestId("finish-later-done")).toBeVisible();
    await pause(900);
  });

  test("[video:headstone-confirm] review and confirm names", async ({
    page,
  }) => {
    await openScenario(page, "headstone-confirm");
    await page.getByTestId("kind-one_person").click();
    await page.getByTestId("person-name-0").fill("John Smith");
    await page.getByTestId("person-born-0").fill("1920");
    await page.getByTestId("person-died-0").fill("1998");
    await pause(500);
    await page.getByTestId("btn-confirm-stone").click();
    await expect(page.getByTestId("confirm-success")).toBeVisible();
    await pause(900);
  });

  test("[video:map-browse] browse map and select plot", async ({ page }) => {
    await openScenario(page, "map-browse");
    await page.getByTestId("plot-marker-p1").click();
    await expect(page.getByTestId("plot-info-panel")).toBeVisible();
    await expect(page.getByTestId("plot-ref")).toContainText("A-12-04");
    await pause(500);
    await page.getByTestId("btn-view-details").click();
    await expect(page.getByTestId("map-browse-done")).toBeVisible();
    await pause(900);
  });

  test("[video:create-plot-photo] create plot with photo", async ({ page }) => {
    await openScenario(page, "create-plot-photo");
    await page.getByTestId("btn-gallery").click();
    await expect(page.getByTestId("photo-preview")).toBeVisible();
    await page.getByTestId("input-section").fill("A");
    await page.getByTestId("input-row").fill("12");
    await page.getByTestId("input-number").fill("05");
    await pause(400);
    await page.getByTestId("btn-plot-continue").click();
    await page.getByTestId("person-name-0").fill("John Smith");
    await page.getByTestId("btn-create-plot").click();
    await expect(page.getByTestId("plot-created")).toBeVisible();
    await pause(900);
  });

  test("[video:create-plot-skip-photo] create plot without photo", async ({
    page,
  }) => {
    await openScenario(page, "create-plot-skip-photo");
    await page.getByTestId("btn-skip-photo").click();
    await page.getByTestId("input-section").fill("C");
    await page.getByTestId("input-row").fill("01");
    await page.getByTestId("input-number").fill("09");
    await pause(400);
    await page.getByTestId("btn-create-plot").click();
    await expect(page.getByTestId("plot-created")).toBeVisible();
    await pause(900);
  });

  test("[video:create-plot-map-point] add plot at map location", async ({
    page,
  }) => {
    await openScenario(page, "create-plot-map-point");
    await page.getByTestId("btn-add-at-location").click();
    await expect(page.getByTestId("map-edit")).toBeVisible();
    await page.getByTestId("input-section").fill("B");
    await page.getByTestId("input-row").fill("07");
    await page.getByTestId("input-number").fill("02");
    await pause(400);
    await page.getByTestId("btn-create-plot").click();
    await expect(page.getByTestId("plot-created")).toBeVisible();
    await pause(900);
  });

  test("[video:plots-search-filter] search and filter plots", async ({
    page,
  }) => {
    await openScenario(page, "plots-search-filter");
    await page.getByTestId("input-plots-search").fill("Smith");
    await pause(500);
    await expect(page.getByTestId("plots-count")).toContainText("1 plot");
    await page.getByTestId("filter-status-occupied").click();
    await expect(page.getByTestId("filter-applied")).toBeVisible();
    await pause(900);
  });

  test("[video:plot-detail-edit] edit plot and add person", async ({
    page,
  }) => {
    await openScenario(page, "plot-detail-edit");
    await page.getByTestId("btn-edit-plot").click();
    await page.getByTestId("input-notes").fill("Updated west path note");
    await pause(400);
    await page.getByTestId("btn-save-plot").click();
    await expect(page.getByTestId("plot-saved")).toBeVisible();
    await page.getByTestId("btn-add-person").click();
    await page.getByTestId("person-name-0").fill("Anne Brown");
    await page.getByTestId("person-born-0").fill("1870");
    await page.getByTestId("person-died-0").fill("1945");
    await page.getByTestId("btn-save-person").click();
    await expect(page.getByTestId("person-saved")).toBeVisible();
    await pause(900);
  });

  test("[video:settings-facility-ai] switch facility and open teach", async ({
    page,
  }) => {
    await openScenario(page, "settings-facility-ai");
    await expect(page.getByTestId("ai-status-chip")).toBeVisible();
    await expect(page.getByTestId("storage-breakdown")).toBeVisible();
    await page.getByTestId("facility-riverside").click();
    await expect(page.getByTestId("facility-switched")).toBeVisible();
    await pause(400);
    await page.getByTestId("btn-teach-settings").click();
    await expect(page.getByTestId("settings-teach-nav")).toBeVisible();
    await pause(900);
  });

  test("[video:app-shell-nav] navigate map plots settings sign-out", async ({
    page,
  }) => {
    await openScenario(page, "app-shell-nav");
    await page.getByTestId("nav-plots").click();
    await expect(page.getByTestId("shell-view-label")).toHaveText("Plots list");
    await pause(400);
    await page.getByTestId("nav-settings").click();
    await expect(page.getByTestId("shell-view-label")).toHaveText("Settings");
    await pause(400);
    await page.getByTestId("nav-map").click();
    await expect(page.getByTestId("shell-view-label")).toHaveText("Map view");
    await pause(400);
    await page.getByTestId("btn-sign-out").click();
    await expect(page.getByTestId("signed-out")).toBeVisible();
    await pause(900);
  });

  test("[video:location-admin] cemetery admin invite and approve", async ({
    page,
  }) => {
    await openScenario(page, "location-admin");
    await page.getByTestId("input-cemetery-name").fill("Oakwood Cemetery");
    await page.getByTestId("btn-save-location").click();
    await expect(page.getByTestId("loc-saved")).toBeVisible();
    await page.getByTestId("input-invite-email").fill("partner@example.com");
    await page.getByTestId("btn-send-invite").click();
    await expect(page.getByTestId("invite-sent")).toBeVisible();
    await page.getByTestId("btn-approve-request").click();
    await expect(page.getByTestId("request-approved")).toBeVisible();
    await page.getByTestId("btn-remove-member").click();
    await expect(page.getByTestId("member-removed")).toBeVisible();
    await pause(900);
  });
});
