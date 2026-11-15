const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ assert, console });
for (const file of ['stroke-data.js', 'circle-words.js', 'bopomofo-strokes.js',
  'circle-similar-strokes.js', 'circle-handwriting.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
}

vm.runInContext(`
  const words = Object.values(circleWords).flat();
  const chars = new Set(words.flatMap(word => word[2]));
  const syllables = new Set(words.flatMap(([word, sounds, targets]) =>
    [...word].flatMap((char, index) => targets.includes(char) ? [sounds[index]] : [])));
  const toInk = (tracks, left, top, scale, jitter = 0) => tracks.map((stroke, row) =>
    stroke.map(([x, y], col) => ({
      x: left + x * scale + jitter * Math.sin(col + row),
      y: top + y * scale + jitter * Math.cos(col - row)
    })));
  const hanInk = (char, jitter) => toInk(
    bundledStrokeData[char].medians.map(stroke => stroke.map(([x, y]) => [x, 900 - y])),
    165, 140, 0.6, jitter);
  const toneTracks = {
    'ˊ': [[[775, 540], [860, 460]]],
    'ˇ': [[[775, 460], [820, 515], [860, 460]]],
    'ˋ': [[[775, 460], [860, 540]]],
    '˙': [[[810, 480]]]
  };
  const soundInk = (answer, jitter) => {
    const tone = answer.match(/[ˊˇˋ˙]/)?.[0];
    const letters = [...answer.replace(/[ˊˇˋ˙]/g, '')];
    const strokes = letters.flatMap((letter, index) =>
      toInk(bopomofoStrokes[letter], 180, 65 + index * 320, 0.18, jitter));
    return tone ? strokes.concat(toInk(toneTracks[tone], 0, 0, 1)) : strokes;
  };

  for (const char of chars) {
    assert.equal(circleHandwriting.read(hanInk(char), 'han', char, 960), char);
    const perturbed = circleHandwriting.read(hanInk(char, 11).reverse(), 'han', char, 960);
    assert(perturbed === char || perturbed === null, char + ' was misread as ' + perturbed);
  }
  for (const answer of syllables) {
    assert.equal(circleHandwriting.read(soundInk(answer), 'sound', answer, 960), answer);
    const perturbed = circleHandwriting.read(soundInk(answer, 4).reverse(), 'sound', answer, 960);
    assert(perturbed === answer || perturbed === null, answer + ' was misread as ' + perturbed);
  }
  assert.equal(circleHandwriting.read(toInk(circleSimilarStrokes.牛, 60, 60, 0.6), 'han', '午', 960), '牛');
  assert.equal(circleHandwriting.read(toInk(circleSimilarStrokes.未, 60, 60, 0.6), 'han', '末', 960), '未');
  assert.equal(circleHandwriting.read(soundInk('ㄇㄧㄥˊ'), 'sound', 'ㄇㄧㄥˇ', 960), 'ㄇㄧㄥˊ');
  assert.equal(circleHandwriting.read(soundInk('˙ㄒㄧ'), 'sound', 'ㄒㄧ', 960), '˙ㄒㄧ');
  assert.equal(circleHandwriting.read(soundInk('ㄒㄧ'), 'sound', '˙ㄒㄧ', 960), 'ㄒㄧ');
  assert.equal(circleHandwriting.read([[{ x: 90, y: 90 }]], 'han', '衣', 960), null);
  console.log('PASS: ' + chars.size + ' characters, ' + syllables.size +
    ' syllables, stroke order tolerance, look-alike characters, tone and unclear ink.');
`, context);
