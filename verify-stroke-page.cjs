const { chromium } = require('C:/Users/zj.chen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve('生字筆順.html')).href);
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('完成，共'), { timeout: 30000 });
    for (const [name, width, height] of [['desktop',1100,850],['ipad',820,1180],['iphone',390,844]]) {
      await page.setViewportSize({ width, height });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`${name} overflow`);
      const board = await page.locator('.board').boundingBox();
      if (board.width < 270 || Math.abs(board.width - board.height) > 2) throw Error(`${name} board size`);
      await page.screenshot({ path: `stroke-${name}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: '下一筆', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#step').disabled);
    if (!(await page.locator('#status').textContent()).includes('第 1 筆')) throw Error('step did not restart');
    await page.getByRole('button', { name: '描寫', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#replay').disabled);
    if (!(await page.locator('#outline').isChecked())) throw Error('trace outline');
    await page.getByRole('button', { name: '自己寫', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#replay').disabled);
    if (await page.locator('#outline').isChecked()) throw Error('practice outline');
    await page.locator('#query').fill('生');
    await page.getByRole('button', { name: '查字', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('共 5 筆'));
    // Draw the actual five median paths to exercise touch-style stroke grading and persistence.
    const data = await page.evaluate(() => bundledStrokeData['生']);
    const box = await page.locator('#writer').boundingBox();
    const scale = (box.width - 44) / 1024;
    for (const median of data.medians) {
      const points = median.map(([x,y]) => [box.x + 22 + x * scale, box.y + 22 + (900-y) * scale]);
      await page.mouse.move(...points[0]); await page.mouse.down();
      for (const point of points.slice(1)) await page.mouse.move(...point, { steps: 6 });
      await page.mouse.up(); await page.waitForTimeout(300);
      const count = data.medians.indexOf(median) + 1;
      if (await page.locator('#acceptedInk path').count() !== count) throw Error('original ink not retained');
      if (count === 1) {
        const firstInk = await page.locator('#acceptedInk path').getAttribute('d');
        if (firstInk.split('L').length <= median.length) throw Error('ink replaced by standard median');
        await page.mouse.move(box.x + 12, box.y + 12); await page.mouse.down();
        await page.mouse.move(box.x + box.width - 12, box.y + 12, { steps: 12 }); await page.mouse.up();
        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('再試一次，第 2 筆'));
        if (await page.locator('#acceptedInk path').count() !== 1 || await page.locator('#acceptedInk path').getAttribute('d') !== firstInk) throw Error('wrong stroke erased or changed accepted ink');
      }
    }
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('完成！'), { timeout: 5000 });
    if (!await page.evaluate(() => JSON.parse(localStorage.getItem('kangxuan-stroke-practice-v1')).some(r => r.char === '生'))) throw Error('missing record');
    const paths = await page.locator('#acceptedInk path').evaluateAll(nodes => nodes.map(n => n.getAttribute('d')));
    const transform = await page.locator('#acceptedInk').getAttribute('transform');
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForFunction(old => document.querySelector('#acceptedInk').getAttribute('transform') !== old, transform);
    if (JSON.stringify(await page.locator('#acceptedInk path').evaluateAll(nodes => nodes.map(n => n.getAttribute('d')))) !== JSON.stringify(paths)) throw Error('resize changed ink');
    await page.screenshot({path:'stroke-original-ink.png',fullPage:true});
    await page.getByRole('button', {name:'重寫',exact:true}).click();
    if (await page.locator('#acceptedInk path').count() !== 0) throw Error('restart left previous ink');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#recordSummary').textContent.includes('完成 1 次'));
    await page.locator('#book').selectOption('二上');
    if (await page.locator('#lesson option').count() !== 3) throw Error('lesson list');
    await page.locator('#lesson').selectOption('3');
    if (await page.locator('#characters button').count() !== 20) throw Error('character list');
    await page.route('**/zh-stroke-data/master/json/*.json', r => r.abort());
    await page.locator('#query').fill('龍'); await page.getByRole('button', { name:'查字', exact:true }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('無法載入'));
    if (!(await page.locator('#replay').isDisabled())) throw Error('failed load still enabled');
    if (errors.length) throw Error(errors.join('\n'));
    console.log('PASS: original ink retained, incorrect stroke rolled back, resize and restart, desktop/iPad/iPhone layout, animation, modes, records, lessons, network failure');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
