import { chromium, devices } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = __dirname;

const prodUrl = 'https://ski-race-timer.vercel.app';
const device = devices['Pixel 5'];

async function main() {
  console.log('Taking Results view with actual data...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...device,
    locale: 'en-US'
  });

  const page = await context.newPage();

  try {
    // First visit to set localStorage with some test entries
    console.log('1. Navigating to app and adding test entries...');
    await page.goto(prodUrl);

    // Add some test entries to localStorage
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

      // Add some sample timing entries
      const now = Date.now();
      const entries = [
        { id: '1', bib: '42', point: 'S', run: 1, timestamp: now - 60000, status: 'ok', deviceId: 'test', deviceName: 'Test Device' },
        { id: '2', bib: '42', point: 'F', run: 1, timestamp: now - 30000, status: 'ok', deviceId: 'test', deviceName: 'Test Device' },
        { id: '3', bib: '15', point: 'S', run: 1, timestamp: now - 45000, status: 'ok', deviceId: 'test', deviceName: 'Test Device' },
        { id: '4', bib: '15', point: 'F', run: 1, timestamp: now - 20000, status: 'ok', deviceId: 'test', deviceName: 'Test Device' },
        { id: '5', bib: '7', point: 'S', run: 1, timestamp: now - 15000, status: 'ok', deviceId: 'test', deviceName: 'Test Device' },
      ];
      localStorage.setItem('skiTimerEntries', JSON.stringify(entries));
    });

    // Reload to apply the localStorage setting
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Navigate to Results view
    console.log('2. Navigating to Results view...');
    const resultsTab = page.locator('#results-tab, button[data-view="results"]').first();
    if (await resultsTab.count() > 0) {
      await resultsTab.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: path.join(outputDir, '04-results-view-with-data.png'),
      fullPage: false
    });
    console.log('   Saved: 04-results-view-with-data.png');

    console.log('\n=== Done! ===\n');

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({
      path: path.join(outputDir, 'error-screenshot.png'),
      fullPage: true
    });
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
