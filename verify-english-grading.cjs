const {chromium}=require('C:/Users/zj.chen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');const path=require('node:path');
(async()=>{const b=await chromium.launch({headless:true,channel:'msedge'});try{
 const p=await b.newPage({viewport:{width:390,height:844},hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.ENGLISH_PAGE_URL||pathToFileURL(path.resolve('英文筆順.html')).href);
 await p.locator('[data-mode="trace"]').click();
 async function points(i){return p.evaluate(i=>{const p=document.querySelector('#outlines').children[i],length=p.getTotalLength(),steps=Math.max(2,Math.ceil(length/6));return Array.from({length:steps+1},(_,k)=>{const a=p.getPointAtLength(length*k/steps);return[a.x,a.y];});},i);}
 async function draw(points){const r=await p.locator('#grader').boundingBox();await p.mouse.move(r.x+points[0][0]*r.width/300,r.y+points[0][1]*r.height/240);await p.mouse.down();for(const [x,y]of points.slice(1))await p.mouse.move(r.x+x*r.width/300,r.y+y*r.height/240);await p.mouse.up();await p.waitForTimeout(30);}
 await draw([[30,30],[30,150]]);if(await p.evaluate(()=>ink.length)!==0)throw Error('wrong position accepted');
 await draw((await points(0)).reverse());if(await p.evaluate(()=>ink.length)!==0)throw Error('backwards accepted');
 await draw((await points(0)).map(([x,y])=>[x+35,y]));if(await p.evaluate(()=>ink.length)!==0)throw Error('shifted stroke accepted');
 await draw(await points(0));await p.waitForFunction(()=>ink.length===1);
 const saved=await p.evaluate(()=>JSON.stringify(ink));
 await draw([[20,20],[280,20]]);if(await p.evaluate(()=>JSON.stringify(ink))!==saved)throw Error('wrong stroke changed previous ink');
 await draw(await points(1));await draw(await points(2));await p.waitForFunction(()=>ink.length===3);
 if(!(await p.locator('#status').textContent()).includes('完成！'))throw Error('completion');
 await p.screenshot({path:'english-graded.png',fullPage:true});
 await p.locator('#undo').click();if(await p.evaluate(()=>ink.length)!==2)throw Error('undo progress');
 await draw(await points(2));await p.waitForFunction(()=>ink.length===3);
 // Exercise every supplied capital/lowercase reference path through the actual matcher.
 for(const type of ['upper','lower']){await p.locator(`[data-case="${type}"]`).click();
  for(const ch of type==='upper'?'ABCDEFGHIJKLMNOPQRSTUVWXYZ':'abcdefghijklmnopqrstuvwxyz'){
   await p.locator('#alphabet button').getByText(ch,{exact:true}).click();
   const count=await p.locator('#outlines path').count();
   for(let i=0;i<count;i++){
    const pts=await points(i);
    await p.evaluate(({pts})=>{const r=document.querySelector('#grader svg').getBoundingClientRect(),svg=document.querySelector('#grader svg');const send=(name,q,node=svg)=>node.dispatchEvent(new MouseEvent(name,{bubbles:true,clientX:r.x+q[0]*r.width/300,clientY:r.y+q[1]*r.height/240,buttons:name==='mouseup'?0:1}));send('mousedown',pts[0]);pts.slice(1).forEach(q=>send('mousemove',q));send('mouseup',pts.at(-1),document);},{pts});
    await p.waitForFunction(n=>ink.length===n,i+1,{timeout:3000}).catch(()=>{throw Error(`reference rejected: ${ch} stroke ${i+1}`);});
   }
  }
 }
 await p.locator('#alphabet button').getByText('i',{exact:true}).click();await draw(await points(0));await p.waitForFunction(()=>ink.length===1);
 const dot=(await points(1))[0],r=await p.locator('#grader').boundingBox();await p.touchscreen.tap(r.x+dot[0]*r.width/300,r.y+dot[1]*r.height/240);await p.waitForFunction(()=>ink.length===2);
 await p.locator('[data-mode="write"]').click();if(await p.locator('#hint path').count())throw Error('write hint');await draw(await points(0));await p.waitForFunction(()=>ink.length===1);
 await p.setViewportSize({width:820,height:1180});await p.waitForTimeout(100);if(await p.evaluate(()=>ink.length)!==1)throw Error('resize lost ink');
 await p.locator('#clear').click();if(await p.evaluate(()=>ink.length)!==0)throw Error('clear');
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS: all 52 reference glyphs, position/direction rejection, accepted original ink, progress, undo, dot tap, write mode, resize');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
