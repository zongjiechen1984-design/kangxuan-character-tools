(() => {
  const get = (id) => document.getElementById(id);
  const game = get('game');
  const landscape = get('landscape');
  const runner = get('runner');
  const obstacle = get('obstacle');
  const firefly = get('firefly');
  const answers = get('answers');
  const jumpButton = get('jump');
  const hint = get('hint');
  const groups = get('groups');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const route = [
    { kind: 'door', title: '第一站｜森林木門', icon: '🔒', cleared: '木門打開了！' },
    { kind: 'bridge', title: '第二站｜河谷吊橋', icon: '⚙', cleared: '吊橋放下來了！' },
    { kind: 'lantern', title: '第三站｜螢火燈塔', icon: '✦', cleared: '燈塔亮起來了！' }
  ];
  const segmentDuration = 3950;
  const fireflyTime = 2100;
  const jumpDuration = 720;
  let stage = 0;
  let gems = 0;
  let bonusGems = 0;
  let questions = [];
  let progress = 0;
  let jumpTime = 0;
  let lastFrame = 0;
  let collected = false;
  let sound = null;
  let muted = true;

  function shuffle(items) {
    for (let index = items.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [items[index], items[other]] = [items[other], items[index]];
    }
    return items;
  }

  function setState(state) {
    game.dataset.state = state;
    for (const panel of ['welcome', 'question', 'finish']) get(panel).hidden = state !== panel;
    get('hud').hidden = state === 'welcome';
    get('controls').hidden = state !== 'running' && state !== 'clearing';
    jumpButton.disabled = state !== 'running';
  }

  function say(message) {
    get('route-message').textContent = message;
  }

  function addGem() {
    gems++;
    get('gems').textContent = '✦ ' + gems;
    get('gems').setAttribute('aria-label', '已收集 ' + gems + ' 顆螢火');
  }

  function playNotes(notes) {
    if (muted || !sound || sound.state !== 'running') return;
    notes.forEach((note, index) => {
      const tone = sound.createOscillator();
      const envelope = sound.createGain();
      const when = sound.currentTime + .085 * index;
      tone.frequency.value = note;
      envelope.gain.setValueAtTime(.001, when);
      envelope.gain.exponentialRampToValueAtTime(.08, when + .018);
      envelope.gain.exponentialRampToValueAtTime(.001, when + .17);
      tone.connect(envelope).connect(sound.destination);
      tone.start(when);
      tone.stop(when + .18);
    });
  }

  get('sound').addEventListener('click', async () => {
    if (!muted) {
      muted = true;
      get('sound').setAttribute('aria-pressed', 'false');
      get('sound').textContent = '音效關閉';
      return;
    }
    try {
      sound ??= new AudioContext();
      await sound.resume();
      muted = false;
      get('sound').setAttribute('aria-pressed', 'true');
      get('sound').textContent = '音效開啟';
      playNotes([523, 659]);
    } catch {
      get('sound').textContent = '此瀏覽器沒有音效';
    }
  });

  function start() {
    const factors = get('tables').value.split(',').map(Number);
    const counts = factors.length === 4 && factors[0] === 2 ? [2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    questions = shuffle(factors.flatMap((size) => counts.map((count) => [size, count]))).slice(0, route.length);
    gems = 0;
    bonusGems = 0;
    stage = 0;
    get('gems').textContent = '✦ 0';
    get('gems').setAttribute('aria-label', '已收集 0 顆螢火');
    run();
  }

  function run() {
    const stop = route[stage];
    progress = 0;
    jumpTime = 0;
    lastFrame = 0;
    collected = false;
    obstacle.dataset.kind = stop.kind;
    obstacle.style.left = '115%';
    get('gate-art').textContent = stop.icon;
    firefly.hidden = false;
    firefly.style.left = '115%';
    runner.style.setProperty('--jump-offset', '0px');
    get('distance').textContent = '關卡 ' + (stage + 1) + '／' + route.length;
    setState('running');
    say('看到螢火靠近時，按跳躍就能收集。');
    jumpButton.focus({ preventScroll: true });
    requestAnimationFrame(frame);
  }

  function jump() {
    if (game.dataset.state !== 'running' || jumpTime > 0) return;
    jumpTime = jumpDuration;
    playNotes([392, 523]);
  }

  function frame(time) {
    if (game.dataset.state !== 'running') return;
    const delta = lastFrame ? Math.min(time - lastFrame, 42) : 0;
    lastFrame = time;
    progress += delta;
    jumpTime = Math.max(0, jumpTime - delta);
    const step = Math.min(progress / segmentDuration, 1);
    if (motion.matches) {
      obstacle.style.left = '64%';
      firefly.style.left = '50%';
    } else {
      obstacle.style.left = (115 - 54 * step) + '%';
      firefly.style.left = (28 + 77 * (1 - progress / fireflyTime)) + '%';
      landscape.style.backgroundPosition = (42 + 17 * step) + '% 62%';
      landscape.style.setProperty('--ground-offset', (-progress / 8) + 'px');
      const height = Math.min(116, Math.max(76, game.clientHeight * .2));
      runner.style.setProperty('--jump-offset', (-Math.sin(Math.PI * jumpTime / jumpDuration) * height) + 'px');
    }
    const canCollect = motion.matches ? !firefly.hidden : Math.abs(progress - fireflyTime) <= 380;
    if (!collected && canCollect && jumpTime > 100) {
      collected = true;
      firefly.hidden = true;
      bonusGems++;
      addGem();
      say('抓到一顆額外的螢火！');
      playNotes([659, 880]);
    }
    if (progress > fireflyTime + 450) firefly.hidden = true;
    if (step < 1) requestAnimationFrame(frame);
    else openQuestion();
  }

  function setHint(open) {
    groups.hidden = !open;
    hint.setAttribute('aria-expanded', String(open));
    hint.textContent = open ? '收起提示' : '看圖提示';
  }

  function openQuestion() {
    const [size, count] = questions[stage];
    const total = size * count;
    const candidates = [total, total - size, total + size, total + 1, total + size * 2, total + size * 3];
    const choices = [...new Set(candidates.filter((value) => value > 0))].slice(0, 4);
    get('gate-name').textContent = route[stage].title;
    get('equation').textContent = size + ' × ' + count + ' = ?';
    get('feedback').textContent = '';
    setHint(false);
    groups.replaceChildren(...Array.from({ length: count }, () => {
      const row = document.createElement('div');
      for (let index = 0; index < size; index++) {
        const dot = document.createElement('span');
        dot.textContent = '✦';
        dot.setAttribute('aria-hidden', 'true');
        row.append(dot);
      }
      return row;
    }));
    groups.setAttribute('role', 'img');
    groups.setAttribute('aria-label', count + ' 組螢火，每組 ' + size + ' 顆');
    answers.replaceChildren(...shuffle(choices).map((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice;
      button.addEventListener('click', () => {
        if (game.dataset.state !== 'question') return;
        if (choice === total) clearGate(size, count);
        else {
          button.disabled = true;
          get('feedback').textContent = '再試一個，或打開提示數一數。';
          answers.querySelector('button:not(:disabled)').focus();
        }
      });
      return button;
    }));
    setState('question');
    answers.firstElementChild.focus({ preventScroll: true });
  }

  function clearGate(size, count) {
    addGem();
    setState('clearing');
    say(size + ' × ' + count + '＝' + (size * count) + '。' + route[stage].cleared);
    playNotes([523, 659, 784]);
    setTimeout(() => {
      stage++;
      if (stage < route.length) run();
      else {
        get('result').textContent = '闖過 ' + route.length + ' 道關卡，收集 ' + gems + ' 顆螢火（跳躍加碼 ' + bonusGems + ' 顆）。';
        setState('finish');
        get('replay').focus({ preventScroll: true });
        playNotes([523, 659, 784, 1047]);
      }
    }, 1000);
  }

  get('start').addEventListener('click', start);
  get('replay').addEventListener('click', start);
  get('menu').addEventListener('click', () => {
    setState('welcome');
    get('tables').focus();
  });
  jumpButton.addEventListener('click', jump);
  hint.addEventListener('click', () => setHint(groups.hidden));
  window.addEventListener('keydown', (event) => {
    if (game.dataset.state !== 'running' || ![' ', 'ArrowUp'].includes(event.key)) return;
    if (event.target !== jumpButton && event.target.closest?.('button, select, a')) return;
    event.preventDefault();
    if (!event.repeat) jump();
  });
})();
