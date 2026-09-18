import { test, expect } from "@playwright/test";
import { pause, saveScenarioVideo } from "./helpers/video";

/**
 * Full new-cemetery onboarding (dedicated demo page).
 * Video: e2e/videos/new-cemetery-onboarding.webm
 */
test.describe("New cemetery onboarding", () => {
  test.afterEach(async ({}, testInfo) => {
    saveScenarioVideo(testInfo, "new-cemetery-onboarding");
  });

  test("typical process video", async ({ page }) => {
    await page.goto("/dev/onboarding-demo");
    await expect(page.getByTestId("onboarding-demo")).toBeVisible();
    await expect(page.getByTestId("step-welcome")).toBeVisible();
    await pause(800);

    await page.getByTestId("btn-create-location").click();
    await expect(page.getByTestId("step-create")).toBeVisible();
    await page.getByTestId("input-cemetery-name").fill("Oakwood Cemetery");
    await pause(500);
    await page.getByTestId("btn-save-location").click();

    await expect(page.getByTestId("step-teach-intro")).toBeVisible();
    await expect(page.getByTestId("saved-cemetery-name")).toHaveText(
      "Oakwood Cemetery",
    );
    await pause(700);
    await page.getByTestId("btn-take-photo").click();

    await expect(page.getByTestId("step-confirm")).toBeVisible();
    await page.getByTestId("kind-one_person").click();
    await expect(page.getByTestId("person-name-0")).toHaveValue("John Smith");
    await pause(600);
    await page.getByTestId("btn-confirm-stone").click();

    await expect(page.getByTestId("step-teach-more")).toBeVisible();
    await pause(500);
    await page.getByTestId("btn-take-photo").click();
    await page.getByTestId("kind-couple").click();
    await expect(page.getByTestId("person-name-0")).toHaveValue("Mary Jones");
    await pause(500);
    await page.getByTestId("btn-confirm-stone").click();

    await page.getByTestId("btn-take-photo").click();
    await page.getByTestId("kind-family").click();
    await expect(page.getByTestId("person-name-0")).toHaveValue(
      "Robert Wilson",
    );
    await pause(500);
    await page.getByTestId("btn-confirm-stone").click();

    await expect(page.getByTestId("coverage-message")).toContainText(
      "Enough confirmed stones",
    );
    await pause(600);
    await page.getByTestId("btn-finish-teach").click();
    await expect(page.getByTestId("step-learning")).toBeVisible();
    await expect(page.getByTestId("btn-go-to-map")).toBeVisible({
      timeout: 10_000,
    });
    await pause(500);
    await page.getByTestId("btn-go-to-map").click();
    await expect(page.getByTestId("demo-complete")).toBeVisible();
    await pause(1200);
  });
});
