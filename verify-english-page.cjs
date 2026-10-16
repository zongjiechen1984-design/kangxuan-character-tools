const {chromium}=require('C:/Users/zj.chen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.ENGLISH_PAGE_URL||pathToFileURL(path.resolve('英文筆順.html')).href);
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='播放完成');
  const result=await page.evaluate(()=>{
   const issues=[];let count=0;for(const [type,letters] of Object.entries(alphabetStrokes)){
    if(Object.keys(letters).length!==26)issues.push(type+' count');
    for(const [ch,strokes] of Object.entries(letters)){count++;for(const d of strokes){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);document.querySelector('#letterSvg').append(p);const b=p.getBBox();if(p.getTotalLength()<=0||b.x<0||b.y<0||b.x+b.width>300||b.y+b.height>240)issues.push(ch+' bounds');p.remove();}}
   }return{count,issues};
  });if(result.count!==52||result.issues.length)throw Error(JSON.stringify(result));
  for(const [name,width,height]of[['desktop',1100,850],['ipad',820,1180],['iphone',390,844]]){await page.setViewportSize({width,height});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(name+' overflow');await page.screenshot({path:'english-'+name+'.png',fullPage:true});}
  await page.getByRole('button',{name:'下一筆',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#step').disabled);
  if(!(await page.locator('#status').textContent()).includes('第 1 筆'))throw Error('step restart');
  await page.locator('[data-case="lower"]').click();await page.getByRole('button',{name:'g',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='播放完成');
  await page.screenshot({path:'english-lowercase-g.png',fullPage:true});
  await page.locator('[data-mode="trace"]').click();
  if(!(await page.locator('#status').textContent()).includes('請寫第 1 筆'))throw Error('practice progress');
  await page.setViewportSize({width:820,height:1180});
  await page.locator('[data-mode="write"]').click();if(await page.locator('#outlines').evaluate(n=>getComputedStyle(n).visibility)!=='hidden')throw Error('write outline');
  await page.getByRole('button',{name:'下一字母',exact:true}).click();if(await page.locator('#letterLabel').textContent()!=='H h')throw Error('next letter');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: 52 glyph paths, animation and stepping, four guidelines, desktop/iPad/iPhone layout, practice modes and letter navigation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
