// Take screenshots of design-pass key pages for review.
// Run: pnpm dev (in one terminal) + node scripts/screenshots.cjs (in another)
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({
    executablePath:
      '/home/michael/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // Login (light + dark)
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/shot-login-light.png', fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shot-login-dark.png', fullPage: true });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));

  // Login as cordoba (tipper)
  await page.fill('input[type=email]', 'cordoba@tippkick.local');
  await page.fill('input[type=password]', 'demo1234');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/shot-dashboard.png', fullPage: true });

  // Tippen
  await page.goto('http://localhost:3000/tippen?competition=BL&matchday=2', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/shot-tippen-tt2.png', fullPage: true });

  // Tippen Sonder-TT 1 (nur L2)
  await page.goto('http://localhost:3000/tippen?competition=BL&matchday=1', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/shot-tippen-tt1.png', fullPage: true });

  // Einstellungen
  await page.goto('http://localhost:3000/einstellungen', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/shot-settings.png', fullPage: true });

  // Logout, then login as admin for /admin pages
  await page.goto('http://localhost:3000/login');
  await page.evaluate(async () => {
    await fetch('/api/auth/sign-out', { method: 'POST' });
  });
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', 'admin@tippkick.local');
  await page.fill('input[type=password]', 'change-me');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/shot-admin.png', fullPage: true });

  // Matchday-Detail (zweiter Tipptag, hat Sektionen + Partien)
  const matchdayLink = await page.locator('a[href^="/admin/matchdays/"]').nth(1).getAttribute('href');
  if (matchdayLink) {
    await page.goto('http://localhost:3000' + matchdayLink, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '/tmp/shot-admin-detail.png', fullPage: true });
  }

  await browser.close();
  console.log('Screenshots written to /tmp/shot-*.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
