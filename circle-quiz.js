const element = id => document.getElementById(id);
const lessonSelect = element('lesson');
const answerInput = element('answer');
const checkButton = element('check');
const keyboard = element('keyboard');
const feedback = element('feedback');
const board = element('drawing-board');
const ink = board.getContext('2d');
ink.strokeStyle = ink.fillStyle = '#172024';
ink.lineWidth = 12;
ink.lineCap = ink.lineJoin = 'round';
const undoButton = element('undo');
const clearButton = element('clear');
const lessons = newSecondGradeLessons.filter(lesson => Object.hasOwn(circleWords, lesson.lesson));
const pool = lessons.flatMap(({ lesson, title }) =>
  circleWords[lesson].map(([word, sounds, targets, page]) => ({
    lesson, title, word, letters: [...word], sounds, targets, page
  }))
);

for (const { lesson, title } of lessons) {
  lessonSelect.add(new Option(`L${lesson} ${title}`, lesson));
}

let questions = [];
let position = 0;
let correct = 0;
let misses = [];
let checked = false;
let typing = false;
let activePointer = null;
const strokes = [];

function pickQuestions(items, count, mode) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const firstMode = Math.floor(Math.random() * 2);
  return shuffled.slice(0, count).map((item, index) => {
    const type = mode === 'mixed' ? ['han', 'sound'][(index + firstMode) % 2] : mode;
    const target = item.targets[Math.floor(Math.random() * item.targets.length)];
    const targetIndex = item.letters.indexOf(target);
    const answer = type === 'han' ? target : item.sounds[targetIndex];
    return { ...item, type, targetIndex, answer };
  });
}

function normalizeSound(value) {
  const compact = value.trim().replace(/\s/g, '').replace(/ˉ$/, '');
  return compact.replace(/^([ㄅ-ㄩ]+)˙$/, '˙$1');
}

function showSound(cell, value) {
  const display = document.createElement('span');
  display.className = 'bpmf';
  display.setAttribute('role', 'img');
  display.setAttribute('aria-label', value);
  const tone = value.match(/[ˊˇˋ˙]/)?.[0];
  if (tone) {
    const mark = document.createElement('span');
    mark.className = tone === '˙' ? 'bpmf-neutral' : 'bpmf-tone';
    mark.textContent = tone;
    display.append(mark);
  }
  for (const symbol of value.replace(/[ˊˇˋ˙]/g, '')) {
    const part = document.createElement('span');
    part.textContent = symbol;
    display.append(part);
  }
  cell.append(display);
}

function showWord(question, reveal = false) {
  element('word').replaceChildren(...question.letters.map((letter, index) => {
    const syllable = document.createElement('div');
    syllable.className = 'syllable';
    const sound = document.createElement('span');
    sound.className = 'sound';
    const han = document.createElement('span');
    han.className = 'han';
    const soundValue = question.sounds[index];
    // A repeated character with the same answer must not give away the blank.
    const blank = !reveal && letter === question.letters[question.targetIndex] &&
      (question.type === 'han' || soundValue === question.answer);
    showSound(sound, soundValue);
    han.textContent = letter;
    if (blank) {
      const cell = question.type === 'han' ? han : sound;
      cell.classList.add('blank');
      cell.textContent = '□';
      cell.setAttribute('aria-label', question.type === 'han' ? '國字空格' : '注音空格');
    }
    syllable.append(han, sound);
    return syllable;
  }));
}

function drawDot({ x, y }) {
  ink.beginPath();
  ink.arc(x, y, ink.lineWidth / 2, 0, Math.PI * 2);
  ink.fill();
}

function drawLine(from, to) {
  ink.beginPath();
  ink.moveTo(from.x, from.y);
  ink.lineTo(to.x, to.y);
  ink.stroke();
}

function redrawBoard() {
  ink.clearRect(0, 0, board.width, board.height);
  for (const stroke of strokes) {
    drawDot(stroke[0]);
    for (let index = 1; index < stroke.length; index++) drawLine(stroke[index - 1], stroke[index]);
  }
  undoButton.disabled = clearButton.disabled = strokes.length === 0;
}

function boardPoint(event) {
  const bounds = board.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * board.width / bounds.width,
    y: (event.clientY - bounds.top) * board.height / bounds.height
  };
}

board.addEventListener('pointerdown', event => {
  if (checked || activePointer !== null || event.button !== 0) return;
  activePointer = event.pointerId;
  board.setPointerCapture(activePointer);
  const point = boardPoint(event);
  strokes.push([point]);
  drawDot(point);
  undoButton.disabled = clearButton.disabled = false;
});

board.addEventListener('pointermove', event => {
  if (event.pointerId !== activePointer) return;
  const stroke = strokes.at(-1);
  const point = boardPoint(event);
  drawLine(stroke.at(-1), point);
  stroke.push(point);
});

for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  board.addEventListener(eventName, event => {
    if (event.pointerId === activePointer) activePointer = null;
  });
}

undoButton.addEventListener('click', () => {
  activePointer = null;
  strokes.pop();
  redrawBoard();
});
clearButton.addEventListener('click', () => {
  activePointer = null;
  strokes.length = 0;
  redrawBoard();
});

function showInputMethod() {
  element('handwriting').hidden = typing;
  element('typing').hidden = !typing;
  element('drawing-actions').hidden = typing || checked;
  element('input-toggle').hidden = checked;
  element('input-toggle').textContent = typing ? '改用手寫' : '改用打字';
  checkButton.hidden = checked && !typing;
  keyboard.hidden = checked || questions[position].type !== 'sound';
  element('writing-label').hidden = typing || checked;
  checkButton.textContent = typing ? '檢查答案' : '顯示正解';
}

element('input-toggle').addEventListener('click', () => {
  typing = !typing;
  feedback.textContent = '';
  showInputMethod();
});

function showQuestion(moveFocus) {
  const question = questions[position];
  const isSound = question.type === 'sound';
  checked = false;
  element('progress').textContent = `第 ${position + 1}／${questions.length} 題 · 答對 ${correct} 題`;
  element('source').textContent = `L${question.lesson} ${question.title}`;
  element('prompt').textContent = isSound ? '看國字填注音' : '看注音填國字';
  showWord(question);
  board.dataset.type = question.type;
  element('writing-label').textContent = isSound ? '在大格裡直寫注音和聲調' : '在大格裡寫一個國字';
  activePointer = null;
  strokes.length = 0;
  redrawBoard();
  element('answer-label').textContent = isSound ? '填入一個音節' : '填入一個國字';
  answerInput.value = '';
  answerInput.readOnly = false;
  answerInput.inputMode = isSound ? 'none' : 'text';
  feedback.textContent = '';
  delete feedback.dataset.result;
  element('self-check').hidden = true;
  showInputMethod();
  if (moveFocus) element('prompt').focus();
}

function startRound(moveFocus) {
  const scope = lessonSelect.value;
  const available = scope === 'all' ? pool : pool.filter(item => item.lesson === Number(scope));
  questions = pickQuestions(available, Number(element('count').value), element('mode').value);
  position = 0;
  correct = 0;
  misses = [];
  element('quiz').hidden = false;
  element('result').hidden = true;
  showQuestion(moveFocus);
}

function showResults() {
  element('quiz').hidden = true;
  element('result').hidden = false;
  element('score').textContent = `答對 ${correct}／${questions.length} 題。`;
  const resultList = element('result-list');
  resultList.hidden = misses.length === 0;
  resultList.replaceChildren(...misses.map(question => {
    const item = document.createElement('li');
    item.textContent = `${question.word} · 正解 ${question.answer} · L${question.lesson} 第 ${question.page} 頁`;
    return item;
  }));
  element('result-title').focus();
}

function addKey(label, apply, controlLabel) {
  const key = document.createElement('button');
  key.type = 'button';
  key.textContent = label;
  if (controlLabel) {
    key.className = 'control';
    key.setAttribute('aria-label', controlLabel);
  }
  key.addEventListener('click', () => { answerInput.value = apply(answerInput.value); });
  keyboard.append(key);
}

for (const symbol of 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦˊˇˋ˙') {
  addKey(symbol, value => value.length < 4 ? value + symbol : value);
}
addKey('退格', value => value.slice(0, -1), '刪除最後一個符號');
addKey('清除', () => '', '清除注音答案');

element('settings').addEventListener('submit', event => {
  event.preventDefault();
  startRound(true);
});
element('again').addEventListener('click', () => startRound(true));

function advanceQuestion() {
  position++;
  if (position === questions.length) showResults();
  else showQuestion(true);
}

function recordAnswer(isCorrect) {
  if (isCorrect) correct++;
  else misses.push(questions[position]);
}

for (const [id, isCorrect] of [['mark-wrong', false], ['mark-correct', true]]) {
  element(id).addEventListener('click', () => {
    if (!checked || typing || element('quiz').hidden) return;
    recordAnswer(isCorrect);
    advanceQuestion();
  });
}

element('answer-form').addEventListener('submit', event => {
  event.preventDefault();
  if (checked) {
    if (typing) advanceQuestion();
    return;
  }

  const question = questions[position];
  if (!typing) {
    if (!strokes.length) {
      feedback.textContent = '請先在大格裡手寫。';
      return;
    }
    checked = true;
    activePointer = null;
    showInputMethod();
    showWord(question, true);
    feedback.textContent = `正解是「${question.answer}」。${question.word} · 課本第 ${question.page} 頁`;
    element('self-check').hidden = false;
    element('mark-correct').focus({ preventScroll: true });
    return;
  }

  const value = question.type === 'sound' ? normalizeSound(answerInput.value) : answerInput.value.trim();
  if (!value) {
    feedback.textContent = '請先填入答案。';
    return;
  }

  checked = true;
  const isCorrect = value === question.answer;
  recordAnswer(isCorrect);
  showInputMethod();
  answerInput.readOnly = true;
  showWord(question, true);
  element('progress').textContent = `第 ${position + 1}／${questions.length} 題 · 答對 ${correct} 題`;
  feedback.dataset.result = isCorrect ? 'correct' : 'wrong';
  feedback.textContent = `${isCorrect ? '答對了！' : `正解是「${question.answer}」。`}${question.word} · 課本第 ${question.page} 頁`;
  checkButton.textContent = position + 1 === questions.length ? '看結果' : '下一題';
  checkButton.focus();
});

startRound(false);
