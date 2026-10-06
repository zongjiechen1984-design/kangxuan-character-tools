const fs = require('node:fs');
const vm = require('node:vm');
const convert = require('./stroke-converter.js');
const src = fs.readFileSync('生字查詢.html', 'utf8');
const block = src.slice(src.indexOf('const lessons ='), src.indexOf('const termHints ='));
const lessons = vm.runInNewContext(block + ';lessons');
const words = [...new Map(lessons.flatMap(l => l.words).map(w => [w[0], w])).values()];
const data = {}, issues = [];
let index = 0;
async function worker() {
  while (index < words.length) {
    const [char, phon, radical, count] = words[index++];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const hex = char.codePointAt(0).toString(16);
        const response = await fetch(`https://raw.githubusercontent.com/g0v/zh-stroke-data/master/json/${hex}.json`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Error('HTTP ' + response.status);
        const converted = convert(await response.json(), char);
        // Dictionary radical counts differ from written strokes for 祝; 貓 has 16 strokes.
        const expected = char === '祝' ? 9 : char === '貓' ? 16 : count;
        if (converted.strokes.length !== expected || converted.strokes.length !== converted.medians.length || converted.medians.some(m => m.length < 2)) throw Error('stroke count or median mismatch');
        data[char] = converted;
        break;
      } catch (e) { if (attempt === 2) issues.push(char + ': ' + e.message); }
    }
  }
}
Promise.all(Array.from({ length: 6 }, worker)).then(() => {
  if (issues.length) throw Error(issues.join('\n'));
  lessons.forEach(l => l.words.forEach(w => { if (w[0] === '貓') { w[2] = '豸'; w[3] = 16; } }));
  fs.writeFileSync('stroke-lessons.js', '// Generated from 生字查詢.html by build-stroke-data.cjs.\nconst strokeLessons = ' + JSON.stringify(lessons) + ';\n');
  const sorted = Object.fromEntries(Object.entries(data).sort(([a],[b]) => a.localeCompare(b)));
  fs.writeFileSync('stroke-data.js', '// Source: https://github.com/g0v/zh-stroke-data (MOE standard stroke order).\n// Educational, noncommercial use; attribution: Ministry of Education, Taiwan.\nconst bundledStrokeData = ' + JSON.stringify(sorted) + ';\n');
  console.log(`Verified and bundled ${words.length} characters; checked written stroke counts and normalized 年 duplicate.`);
}).catch(e => { console.error(e); process.exitCode = 1; });
