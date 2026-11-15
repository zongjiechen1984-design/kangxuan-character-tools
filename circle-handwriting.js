// Compare handwriting locally with stroke tracks. Coordinates are scaled as a group
// so placement and writing size do not affect the result.
const circleHandwriting = (() => {
  const sampleCount = 12;

  function bounds(strokes) {
    const result = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const stroke of strokes) {
      for (const [x, y] of stroke) {
        result.left = Math.min(result.left, x);
        result.right = Math.max(result.right, x);
        result.top = Math.min(result.top, y);
        result.bottom = Math.max(result.bottom, y);
      }
    }
    return result;
  }

  function sample(stroke) {
    const distances = [0];
    for (let i = 1; i < stroke.length; i++) {
      distances.push(distances[i - 1] + Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]));
    }
    const length = distances.at(-1);
    if (length === 0) return Array(sampleCount).fill(stroke[0]);
    let segment = 1;
    return Array.from({ length: sampleCount }, (_, i) => {
      const distance = i * length / (sampleCount - 1);
      while (segment < distances.length - 1 && distances[segment] <= distance) segment++;
      const start = stroke[segment - 1];
      const end = stroke[segment];
      const span = distances[segment] - distances[segment - 1];
      const ratio = span ? (distance - distances[segment - 1]) / span : 0;
      return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
    });
  }

  function normalize(strokes, minimumSize = 1) {
    const { left, right, top, bottom } = bounds(strokes);
    const size = Math.max(right - left, bottom - top);
    if (!(size >= minimumSize)) return null;
    const midX = (left + right) / 2;
    const midY = (top + bottom) / 2;
    return strokes.map(stroke => sample(stroke).map(([x, y]) => [(x - midX) / size, (y - midY) / size]));
  }

  function strokeDistance(first, second) {
    let forward = 0;
    let backward = 0;
    const squared = ([x, y], [a, b]) => (x - a) ** 2 + (y - b) ** 2;
    for (let i = 0; i < sampleCount; i++) {
      forward += squared(first[i], second[i]);
      backward += squared(first[i], second[sampleCount - 1 - i]);
    }
    return Math.min(forward, backward) / sampleCount;
  }

  function glyphDistance(written, template) {
    // Match each stroke to a distinct reference stroke without requiring the same writing order.
    const pairs = written.flatMap((stroke, i) => template.map((reference, j) => ({
      i, j, distance: strokeDistance(stroke, reference)
    }))).sort((a, b) => a.distance - b.distance);
    const matched = new Set();
    const used = new Set();
    let total = 0;
    let worst = 0;
    for (const { i, j, distance } of pairs) {
      if (matched.has(i) || used.has(j)) continue;
      matched.add(i);
      used.add(j);
      total += distance;
      worst = Math.max(worst, distance);
      if (matched.size === written.length) break;
    }
    return Math.sqrt(total / written.length) + 0.3 * Math.sqrt(worst);
  }

  function prepare(entries) {
    const byCount = new Map();
    for (const [symbol, strokes] of entries) {
      const template = normalize(strokes);
      if (!template) continue;
      const candidates = byCount.get(strokes.length) || [];
      candidates.push({ symbol, template });
      byCount.set(strokes.length, candidates);
    }
    return byCount;
  }

  function identify(strokes, candidates, expected, minimumSize, limit) {
    const eligible = candidates.get(strokes.length);
    if (!eligible) return null;
    const written = normalize(strokes, minimumSize);
    if (!written) return null;
    const scores = eligible.map(({ symbol, template }) => ({
      symbol, distance: glyphDistance(written, template)
    })).sort((a, b) => a.distance - b.distance);
    const best = scores[0];
    if (best.distance > limit) return null;
    const competing = scores.find(candidate => candidate.symbol !== best.symbol);
    if (competing && best.distance > 0.02 && competing.distance - best.distance < 0.025 &&
        (best.symbol === expected || competing.symbol === expected)) return null;
    return best.symbol;
  }

  const hanTemplates = Object.entries(bundledStrokeData).map(([char, { medians }]) => [
    char, medians.map(stroke => stroke.map(([x, y]) => [x, -y]))
  ]);
  const han = prepare([...hanTemplates, ...Object.entries(circleSimilarStrokes)]);
  const sounds = prepare([...Object.entries(bopomofoStrokes), ['ㄧ', [[[0, 0], [0, 100]]]]]);
  const tones = prepare([
    ['ˊ', [[[0, 100], [100, 0]]]],
    ['ˇ', [[[0, 0], [50, 55], [100, 0]]]],
    ['ˋ', [[[0, 0], [100, 100]]]]
  ]);
  const toneSplit = 0.74;

  function readSound(strokes, expected, size) {
    const slots = [[], [], []];
    const toneStrokes = [];
    for (const stroke of strokes) {
      const { left, right, top, bottom } = bounds([stroke]);
      if ((left + right) / 2 >= size * toneSplit) {
        toneStrokes.push(stroke);
      } else {
        const row = Math.max(0, Math.min(2, Math.floor((top + bottom) / 2 / size * 3)));
        slots[row].push(stroke);
      }
    }
    while (slots.length && slots.at(-1).length === 0) slots.pop();
    if (!slots.length || slots.some(slot => slot.length === 0)) return null;
    const expectedTone = expected.match(/[ˊˇˋ˙]/)?.[0] || '';
    const expectedSounds = expected.replace(/[ˊˇˋ˙]/g, '');
    const letters = slots.map((slot, index) => identify(slot, sounds, expectedSounds[index], size * 0.028, 0.22));
    if (letters.includes(null)) return null;

    let tone = '';
    if (toneStrokes.length) {
      const { left, right, top, bottom } = bounds(toneStrokes);
      const extent = Math.max(right - left, bottom - top);
      tone = toneStrokes.length === 1 && extent < size * 0.033
        ? '˙'
        : identify(toneStrokes, tones, expectedTone, 1, 0.39);
      if (!tone) return null;
    }
    return tone === '˙' ? tone + letters.join('') : letters.join('') + tone;
  }

  return {
    read(strokes, type, expected, size) {
      const points = strokes.map(stroke => stroke.map(({ x, y }) => [x, y]));
      if (type === 'sound') return readSound(points, expected, size);
      return identify(points, han, expected, size * 0.075, 0.19);
    }
  };
})();
