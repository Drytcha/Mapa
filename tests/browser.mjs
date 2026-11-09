import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
fs.mkdirSync('artifacts', { recursive: true });
const errors = [];
const now = Date.now();
const vehicle = (id, operatorKey, routeName, kursowka, delaySeconds) => ({
  vehicleId: id, operatorKey, operatorName: operatorKey === 'mzuk' ? 'MZUK Sp. z o.o.' : 'Śląskie Konsorcjum Autobusowe (ŚKA)', operatorSource: 'auto',
  model: null, routeName, routeColor: '#00658d', brigade: kursowka.split('/')[1], kursowka,
  tripId: null, lat: 50.7714, lon: 16.2843, bearing: 90, delaySeconds, speedKmh: 32,
  headsign: 'Boguszów-Gorce', timestamp: now, upcomingStops: [],
});
const fixtures = [vehicle('1', 'mzuk', '2', '2/03', 200), vehicle('404', 'ska', 'EX', 'EX/07', -90)];
async function setupPage(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/buses/live**', (route) => route.fulfill({ json: { ok: true, vehicles: fixtures, traffic: { totalVehicles: 2, trackedOnTripCount: 0, avgDelaySeconds: 100, maxDelaySeconds: 200, delayedCount: 1, onTimeCount: 1, congestionLevel: 'niski', recommendedPeakPercent: 20, operatorBreakdown: { mzuk: 1, ska: 1, other: 0 }, fetchedAt: now }, source: 'Deterministic browser test fixture' } }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  return page;
}
async function openDuties(page, mobile = false) {
  if (mobile) {
    await page.getByRole('button', { name: 'Menu aplikacji' }).click();
    await page.getByRole('button', { name: 'Kursówki Wałbrzych (GTFS)' }).click();
  } else await page.getByRole('button', { name: 'Kursówki', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Kursówki Wałbrzych' })).toBeVisible();
  await expect(page.getByTestId('duty-card').first()).toBeVisible({ timeout: 20000 });
}
async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => {
    const dialog = document.querySelector('.duty-dialog-shell');
    const body = dialog.querySelector('.scroll-area');
    return { viewport: innerWidth, page: document.documentElement.scrollWidth, dialog: dialog.getBoundingClientRect().width, content: body.clientWidth, scroll: body.scrollWidth };
  });
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.content + 1);
}
async function assertTripCards(page) {
  const cards = page.locator('.duty-trip-card');
  await expect(cards.first()).toBeVisible({ timeout: 20000 });
  const boxes = await cards.evaluateAll((elements) => elements.map((element) => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; }));
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i].height).toBeGreaterThan(60);
    if (i) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1);
  }
}
try {
  const desktop = await setupPage({ width: 1440, height: 900 });
  await openDuties(desktop);
  await assertNoOverflow(desktop);
  await expect(desktop.getByRole('button', { name: 'Wszystkie linie', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const dialogSearch = desktop.getByRole('dialog', { name: 'Kursówki Wałbrzych' }).getByRole('combobox');
  await dialogSearch.fill('2/03');
  await expect(desktop.getByTestId('duty-card')).toHaveCount(1);
  await desktop.getByRole('button', { name: 'Wyczyść wyszukiwanie autobusu' }).click();
  await expect(dialogSearch).toHaveValue('');
  expect(await desktop.getByTestId('duty-card').count()).toBeGreaterThan(1);
  await desktop.getByRole('button', { name: 'Linia 2', exact: true }).click();
  await expect(desktop.locator('.duty-detail-pane h3')).toContainText('2/', { timeout: 20000 });
  await assertTripCards(desktop);
  await desktop.screenshot({ path: 'artifacts/after-desktop.png' });
  // A delayed response for an abandoned line must not replace the newest selection.
  await desktop.route('**/api/gtfs/kursowki?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('routeId') === '5') await new Promise((resolve) => setTimeout(resolve, 1600));
    await route.continue();
  });
  await desktop.getByRole('button', { name: 'Linia 5', exact: true }).click();
  await desktop.getByRole('button', { name: 'Linia EX', exact: true }).click();
  await expect(desktop.locator('.duty-detail-pane h3')).toContainText('EX/', { timeout: 20000 });
  await desktop.waitForTimeout(1900);
  await expect(desktop.locator('.duty-detail-pane h3')).toContainText('EX/');
  // Search works even for a live duty absent from the static timetable.
  const search = desktop.getByRole('dialog', { name: 'Kursówki Wałbrzych' }).getByRole('combobox', { name: 'Znajdź autobus po kursówce lub numerze wozu' });
  await search.fill('ex/7');
  await expect(desktop.getByRole('option')).toContainText('#404');
  await search.press('Enter');
  await expect(desktop.getByRole('dialog', { name: 'Kursówki Wałbrzych' })).toHaveCount(0);
  await expect(desktop.locator('.live-bus-label')).toContainText(['2/03 #01', 'EX/07 #404']);
  await expect(desktop.locator('.live-bus-delay')).toContainText(['-3:20', '+1:30']);
  const colours = await desktop.locator('.live-bus').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
  expect(colours).toContain('rgb(134, 239, 172)');
  expect(colours).toContain('rgb(192, 132, 252)');
  await desktop.getByRole('button', { name: 'Włącz jasny motyw' }).click();
  await expect(desktop.locator('html')).not.toHaveClass(/dark/);
  await desktop.reload({ waitUntil: 'domcontentloaded' });
  await expect(desktop.locator('html')).not.toHaveClass(/dark/);
  await desktop.getByRole('button', { name: 'Włącz ciemny motyw' }).click();
  await expect(desktop.locator('html')).toHaveClass(/dark/);
  await desktop.close();

  const mobile = await setupPage({ width: 390, height: 844 });
  await openDuties(mobile, true);
  await assertNoOverflow(mobile);
  await mobile.getByTestId('duty-card').first().click();
  await expect(mobile.getByRole('button', { name: 'Wróć do listy' })).toBeVisible();
  await assertTripCards(mobile);
  await assertNoOverflow(mobile);
  await mobile.screenshot({ path: 'artifacts/after-mobile.png' });
  await mobile.getByRole('button', { name: 'Wróć do listy' }).click();
  await mobile.getByRole('button', { name: /Niedziele i święta/ }).click();
  const sundayLine4 = mobile.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/gtfs/kursowki' && url.searchParams.get('routeId') === '4' && url.searchParams.get('serviceId') === 'sunday' && response.ok();
  });
  await mobile.getByRole('button', { name: 'Linia 4', exact: true }).click();
  await sundayLine4;
  await expect(mobile.locator('.duty-dialog-shell .scroll-area')).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  if (await mobile.getByTestId('duty-card').count()) {
    await mobile.getByTestId('duty-card').first().click();
    await expect(mobile.locator('.duty-detail-pane')).toContainText('0 kursów w rozkładzie');
    await expect(mobile.locator('.duty-detail-pane')).toContainText(/nie ma przypisanych kursów w wybranym typie dnia|brak kursów w wybranym typie dnia/);
  } else {
    await expect(mobile.getByText('Brak kursówek w wybranym typie dnia. Nie podstawiamy rozkładu z innego dnia.')).toBeVisible();
  }
  await mobile.close();
  expect(errors).toEqual([]);
  console.log('PASS: dark/light persistence, company colours, signed delays, duty search, rapid line changes, complete trip rows, mobile layout, calendar isolation; no browser errors.');
} finally { await browser.close(); }
