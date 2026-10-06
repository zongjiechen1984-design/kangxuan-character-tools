/* Convert g0v/zh-stroke-data's MOE coordinates (2048 square) to Hanzi Writer. */
function convertMoeStrokes(source, char) {
  // The upstream 年 file repeats its final vertical stroke in entries 6 and 7.
  if (char === '年' && source.length === 7) source = source.filter((_, i) => i !== 5);
  const point = p => [Number((p.x / 2).toFixed(2)), Number((900 - p.y / 2).toFixed(2))];
  const pair = p => point(p).join(' ');
  return {
    strokes: source.map(s => s.outline.map(p => {
      if (p.type === 'M' || p.type === 'L') return p.type + pair(p);
      if (p.type === 'Q') return 'Q' + pair(p.begin) + ' ' + pair(p.end);
      if (p.type === 'C') return 'C' + pair(p.begin) + ' ' + pair(p.mid) + ' ' + pair(p.end);
      throw new Error('Unknown outline command: ' + p.type);
    }).join(' ') + ' Z'),
    medians: source.map(s => s.track.map(point))
  };
}
if (typeof module !== 'undefined') module.exports = convertMoeStrokes;
