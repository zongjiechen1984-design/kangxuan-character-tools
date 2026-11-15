const { chromium } = require('C:/Users/zj.chen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const base = process.env.TOOLS_BASE_URL;
const url = name => base ? new URL(name, base).href : pathToFileURL(path.resolve(name)).href;
(async () => {
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url('生字查詢.html'));
    const expected = await page.evaluate(() => newSecondGradeLessons);
    if (expected.map(l => l.lesson).join(',') !== '4,5,6,7,8,9,10,11,12' ||
        expected.some(l => l.words.length !== 18)) throw Error('expected 18 words per lesson');
    for (const l of expected) {
      for (const w of l.words) {
        await page.locator('#query').fill(w[0]);
        const card = page.locator('#results .card').filter({ has: page.locator('.lesson').filter({ hasText: l.title }) });
        const cards = await card.allInnerTexts();
        if (cards.length !== 1 || !cards[0].includes(`二上 L${l.lesson}\n`) ||
            !cards[0].includes(w[2]) || (w[4] && !cards[0].includes(w[4]))) {
          throw Error(`lookup missing L${l.lesson} ${w[0]}`);
        }
      }
    }
    await page.locator('#query').fill('哇');
    if (await page.locator('.card .bpmf-main').textContent() !== '˙ㄨㄚ') throw Error('neutral tone');
    await page.screenshot({path:'new-lessons-lookup.png',fullPage:true});
    await page.goto(url('生字小遊戲.html'));
    await page.locator('#bookFilter').selectOption('二上');
    const results = await page.evaluate(() => {
      const added = allItems.filter(i => i.book === '二上' && i.lesson >= 4);
      const failures = [];
      for (const item of added) {
        if ([...item.term].length > 3 || [...item.term].length < 2 || !item.term.includes(item.char)) failures.push('term '+item.char);
        for (const mode of ['char','zhuyin']) {
          const field = mode === 'char' ? 'char' : 'zhuyin';
          const choices = choicesFor(item, mode);
          if (choices.length !== 4 || new Set(choices.map(c=>c[field])).size !== 4 || !choices.some(c=>c[field] === item[field])) failures.push('choices '+item.char);
        }
        if (!pool().some(p=>p.key === item.key)) failures.push('pool '+item.char);
      }
      return {count:added.length,failures};
    });
    if (results.count !== 162 || results.failures.length) throw Error(JSON.stringify(results));
    for (const {lesson} of expected) {
      await page.locator('#bookFilter').selectOption(`二上-${lesson}`);
      const scope = await page.evaluate(() => ({
        lessons: [...new Set(pool().map(i => i.lesson))],
        count: pool().length,
        question: state.current?.lesson
      }));
      if (scope.count !== 18 || scope.lessons.join(',') !== String(lesson) || scope.question !== lesson) throw Error('game lesson scope');
      for (const mode of ['char','zhuyin']) {
        await page.locator('#mode').selectOption(mode);
        const answer = await page.evaluate(mode=>state.current[mode === 'char' ? 'char':'zhuyin'],mode);
        const button = page.locator('#choices button').filter({hasText:mode === 'char' ? answer : ''});
        if (mode === 'char') await button.first().click();
        else await page.locator(`#choices button[data-value="${answer}"]`).click();
        if (await page.locator('#feedbackMark').getAttribute('aria-label') !== '答對') throw Error('answer grading');
      }
    }
    await page.screenshot({path:'new-lessons-game.png',fullPage:true});
    await page.goto(url('生字筆順.html'));
    await page.route('**/zh-stroke-data/master/json/*.json', request => request.abort());
    await page.locator('[data-mode="trace"]').click();
    await page.locator('#book').selectOption('二上');
    for (const l of expected) {
      await page.locator('#lesson').selectOption(String(l.lesson));
      const actual = await page.locator('#characters button').allTextContents();
      if (actual.join('') !== l.words.map(w => w[0]).join('')) throw Error('stroke lesson order');
      for (const w of l.words) {
        await page.locator('#characters button').getByText(w[0],{exact:true}).click();
        await page.waitForFunction(() => !document.querySelector('#replay').disabled);
        if (!(await page.locator('#meta').textContent()).includes(`二上 L${l.lesson}`)) throw Error('stroke lesson wrong');
        if (!(await page.locator('#writer svg path').count())) throw Error('stroke SVG missing '+w[0]);
        if (!(await page.locator('#status').textContent()).includes(`共 ${w[3]} 筆`)) throw Error('stroke count for '+w[0]);
      }
    }
    if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('mobile overflow');
    await page.screenshot({path:'new-lessons-strokes.png',fullPage:true});
    if (errors.length) throw Error(errors.join('\n'));
    console.log('PASS: 162 lesson words in lookup, game choices and grading, and bundled stroke rendering; mobile layout and neutral tone');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
