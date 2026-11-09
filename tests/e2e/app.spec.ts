import { test, expect } from '@playwright/test';

test('boots a local Angular build, runs real Lua integration, and has no browser errors', async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4200/')) external.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A foundation for adventure.' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('World initialized. Simulation is paused.');
  await expect(page.locator('.app-layout')).toHaveCSS('display', 'grid');
  await page.screenshot({ path: 'test-results/overview.png', fullPage: true });
  await page.getByRole('button', { name: 'Verify architecture ↗', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('verification passed');
  await expect(page.locator('.check')).toHaveCount(7);
  await page.getByRole('button', { name: 'Step +1', exact: true }).click();
  await expect(page.locator('.clock')).toContainText('Tick 1');
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('saves and reloads through IndexedDB and exports a portable save', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('World initialized. Simulation is paused.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await page.getByRole('button', { name: '+10 ticks', exact: true }).click();
  await expect(page.locator('.clock')).toContainText('Tick 10');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.clock')).toContainText('Tick 0');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toBe('haven-save.json');
  const stream = await download.createReadStream(); let text = ''; for await (const chunk of stream!) text += chunk;
  expect(JSON.parse(text).state.clock.tick).toBe(0);
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('status')).toContainText('save envelope');
  await expect(page.locator('.clock')).toContainText('Tick 0');
});

test('operates work, quests, and manual combat from the development interface', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('World initialized. Simulation is paused.');
  await page.getByRole('button', { name: 'Quests', exact: true }).click();
  const quest = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Architecture verification', exact: true }) });
  await quest.getByRole('button', { name: 'Accept quest' }).click();
  await page.getByRole('button', { name: 'Haven & work', exact: true }).click();
  await page.getByRole('button', { name: 'Assign protected position' }).click();
  await page.getByRole('button', { name: 'Create one order' }).click();
  await page.getByRole('button', { name: '+10 ticks', exact: true }).click();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expeditions', exact: true }).click();
  await page.getByRole('button', { name: 'Create party', exact: true }).click();
  await page.getByRole('button', { name: 'Begin travel', exact: true }).click();
  await page.getByRole('button', { name: '+10 ticks', exact: true }).click();
  await page.getByRole('button', { name: 'Explore here', exact: true }).click();
  await page.getByRole('button', { name: '+10 ticks', exact: true }).click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('exploration.decide accepted.');
  const battle = page.locator('section').filter({ has: page.getByRole('heading', { name: /Battle · round/ }) });
  for (let i = 0; i < 20; i++) {
    if (await battle.getByText('victory', { exact: true }).isVisible()) break;
    if (await battle.getByRole('button', { name: 'Resolve one enemy turn' }).isVisible()) await battle.getByRole('button', { name: 'Resolve one enemy turn' }).click();
    else await battle.getByRole('button', { name: 'Strike', exact: true }).click();
    await expect(page.getByRole('status')).not.toHaveText('Working…');
  }
  await expect(battle.getByText('victory', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Quests', exact: true }).click();
  await quest.getByRole('button', { name: 'Claim reward', exact: true }).click();
  await expect(quest.getByText('completed', { exact: true })).toBeVisible();
});

test('keeps the interface usable at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('World initialized. Simulation is paused.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Characters', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Ada Thorn/ })).toBeVisible();
});
