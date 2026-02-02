import { chromium, devices } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = __dirname;

const prodUrl = 'https://ski-race-timer.vercel.app';
const device = devices['Pixel 5'];

async function main() {
  console.log('Starting production app screenshots...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...device,
    locale: 'en-US'
  });

  const page = await context.newPage();

  try {
    // First visit to set localStorage
    console.log('1. Navigating to app and skipping onboarding...');
    await page.goto(prodUrl);
    await page.evaluate(() => {
      localStorage.setItem('skiTimerHasCompletedOnboarding', 'true');
      localStorage.setItem('skiTimerSettings', JSON.stringify({
        language: 'en',
        timingPoint: 'S',
        run: 1,
        autoIncrement: true,
        hapticFeedback: true,
        soundFeedback: false,
        gpsSync: false,
        cloudSync: false
      }));
    });

    // Reload to apply the localStorage setting
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for the timer view
    console.log('2. Waiting for Timer view to load...');
    await page.waitForTimeout(3000);

    // Screenshot 1: Timer View (clean)
    console.log('3. Taking Timer view screenshot...');
    await page.screenshot({
      path: path.join(outputDir, '01-timer-view.png'),
      fullPage: false
    });
    console.log('   Saved: 01-timer-view.png');

    // Screenshot 2: Enter a bib number using the radial dial
    console.log('\n4. Entering bib number using radial dial...');

    // The dial numbers have data-num attribute: .dial-number[data-num="4"]
    // Click on digit 4
    const digit4 = page.locator('.dial-number[data-num="4"]');
    if (await digit4.count() > 0) {
      await digit4.click();
      await page.waitForTimeout(300);
      console.log('   Clicked digit 4');
    }

    // Click on digit 2
    const digit2 = page.locator('.dial-number[data-num="2"]');
    if (await digit2.count() > 0) {
      await digit2.click();
      await page.waitForTimeout(300);
      console.log('   Clicked digit 2');
    }

    await page.screenshot({
      path: path.join(outputDir, '02-bib-entered.png'),
      fullPage: false
    });
    console.log('   Saved: 02-bib-entered.png');

    // Screenshot 3: Record timestamp by clicking the record button
    console.log('\n5. Recording timestamp...');

    // The record button is in the dial center area
    const recordBtn = page.locator('button.dial-record-btn, .dial-center button, button:has-text("RECORD"), button:has-text("record")').first();
    if (await recordBtn.isVisible({ timeout: 5000 })) {
      await recordBtn.click();
      await page.waitForTimeout(800);
      console.log('   Clicked record button');
    } else {
      // Try clicking the center of the dial where the record button should be
      const dialCenter = page.locator('.dial-center, .radial-dial-center').first();
      if (await dialCenter.count() > 0) {
        await dialCenter.click();
        await page.waitForTimeout(800);
        console.log('   Clicked dial center');
      }
    }

    await page.screenshot({
      path: path.join(outputDir, '03-timestamp-recorded.png'),
      fullPage: false
    });
    console.log('   Saved: 03-timestamp-recorded.png');

    // Screenshot 4: Results view
    console.log('\n6. Navigating to Results view...');

    // Click using specific tab id
    const resultsTab = page.locator('#results-tab, button[data-view="results"]').first();
    if (await resultsTab.count() > 0) {
      await resultsTab.click();
      await page.waitForTimeout(500);
      console.log('   Clicked Results tab');
    }

    await page.screenshot({
      path: path.join(outputDir, '04-results-view.png'),
      fullPage: false
    });
    console.log('   Saved: 04-results-view.png');

    // Screenshot 5: Settings view
    console.log('\n7. Navigating to Settings view...');

    // Click using specific tab id
    const settingsTab = page.locator('#settings-tab, button[data-view="settings"]').first();
    if (await settingsTab.count() > 0) {
      await settingsTab.click();
      await page.waitForTimeout(500);
      console.log('   Clicked Settings tab');
    }

    await page.screenshot({
      path: path.join(outputDir, '05-settings-view.png'),
      fullPage: false
    });
    console.log('   Saved: 05-settings-view.png');

    // Screenshot 6: Landscape orientation - Timer view
    console.log('\n8. Testing landscape orientation...');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(500);

    // Go back to Timer view
    const timerTab = page.locator('#timer-tab, button[data-view="timer"]').first();
    if (await timerTab.count() > 0) {
      await timerTab.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: path.join(outputDir, '06-timer-landscape.png'),
      fullPage: false
    });
    console.log('   Saved: 06-timer-landscape.png');

    console.log('\n=== Screenshot capture complete! ===\n');
    console.log('Files saved to:', outputDir);

  } catch (error) {
    console.error('Error during screenshot capture:', error);
    await page.screenshot({
      path: path.join(outputDir, 'error-screenshot.png'),
      fullPage: true
    });
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
