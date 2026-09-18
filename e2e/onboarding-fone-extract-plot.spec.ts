import { test, expect } from "@playwright/test";
import { pause, saveScenarioVideo } from "./helpers/video";

/**
 * Onboarding + correct extraction + plot creation using the Fone couple stone.
 * Video: e2e/videos/onboarding-fone-extract-plot.webm
 */
test.describe("Fone headstone onboarding", () => {
  test.afterEach(async ({}, testInfo) => {
    saveScenarioVideo(testInfo, "onboarding-fone-extract-plot");
  });

  test("onboard, extract Dennis & Beryl Fone, create plot", async ({ page }) => {
    await page.goto("/dev/onboarding-fone-demo");
    await expect(page.getByTestId("fone-onboarding-demo")).toBeVisible();
    await expect(page.getByTestId("step-welcome")).toBeVisible();
    await pause(900);

    await page.getByTestId("btn-create-location").click();
    await expect(page.getByTestId("step-create")).toBeVisible();
    await page.getByTestId("input-cemetery-name").fill("Oakwood Cemetery");
    await pause(600);
    await page.getByTestId("btn-save-location").click();

    await expect(page.getByTestId("step-teach")).toBeVisible();
    await expect(page.getByTestId("saved-cemetery-name")).toHaveText(
      "Oakwood Cemetery",
    );
    await pause(700);
    await page.getByTestId("btn-take-photo").click();

    await expect(page.getByTestId("stone-preview")).toBeVisible();
    await expect(page.getByTestId("analyzing")).toBeVisible();
    await expect(page.getByTestId("step-confirm")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId("kind-couple").click();
    await expect(page.getByTestId("person-name-0")).toHaveValue(
      "Dennis William Fone",
    );
    await expect(page.getByTestId("person-born-0")).toHaveValue("1933-06-25");
    await expect(page.getByTestId("person-died-0")).toHaveValue("2020-10-01");
    await expect(page.getByTestId("person-name-1")).toHaveValue(
      "Beryl Jean Fone",
    );
    await expect(page.getByTestId("person-born-1")).toHaveValue("1948-02-02");
    await expect(page.getByTestId("person-died-1")).toHaveValue("2021-11-01");
    await expect(page.getByTestId("person-rel-0")).toContainText("husband");
    await expect(page.getByTestId("person-rel-1")).toContainText("wife");
    await pause(1200);

    await page.getByTestId("btn-confirm-stone").click();
    await expect(page.getByTestId("step-plot")).toBeVisible();
    await page.getByTestId("input-section").fill("A");
    await page.getByTestId("input-row").fill("12");
    await page.getByTestId("input-number").fill("18");
    await expect(page.getByTestId("plot-person-0")).toContainText(
      "Dennis William Fone",
    );
    await expect(page.getByTestId("plot-person-1")).toContainText(
      "Beryl Jean Fone",
    );
    await pause(800);

    await page.getByTestId("btn-create-plot").click();
    await expect(page.getByTestId("step-done")).toBeVisible();
    await expect(page.getByTestId("plot-created")).toContainText(
      "Dennis William Fone",
    );
    await expect(page.getByTestId("plot-created")).toContainText(
      "Beryl Jean Fone",
    );
    await expect(page.getByTestId("plot-ref")).toHaveText("A-12-18");
    await expect(page.getByTestId("demo-complete")).toBeVisible();
    await pause(1500);
  });
});
