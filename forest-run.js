(() => {
  const get = (id) => document.getElementById(id);
  const game = get('game');
  const landscape = get('landscape');
  const runner = get('runner');
  const sprites = [...runner.querySelectorAll('[data-costume]')];
  const heroNotice = get('hero-notice');
  const heroGoal = get('hero-goal');
  const obstacle = get('obstacle');
  const firefly = get('firefly');
  const answers = get('answers');
  const jumpButton = get('jump');
  const hint = get('hint');
  const groups = get('groups');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const route = [
    { kind: 'door', title: '森林木門', icon: '🔒', cleared: '木門打開了！', duration: 7800 },
    { kind: 'vines', title: '藤蔓小徑', icon: '🌿', cleared: '藤蔓捲起來，路通了！', duration: 8300 },
    { kind: 'bridge', title: '河谷吊橋', icon: '⚙', cleared: '吊橋放下來了！', duration: 8600 },
    { kind: 'stones', title: '溪邊踏石', icon: '💧', cleared: '踏石浮起來，可以過溪了！', duration: 8000 },
    { kind: 'wheel', title: '水車工坊', icon: '✿', cleared: '水車轉動，閘門升起來了！', duration: 8900 },
    { kind: 'cave', title: '水晶洞口', icon: '◆', cleared: '水晶發光，洞口打開了！', duration: 9200 },
    { kind: 'cloud', title: '雲端升降台', icon: '☁', cleared: '雲朵升起，載你上山了！', duration: 8700 },
    { kind: 'lantern', title: '螢火燈塔', icon: '✦', cleared: '燈塔亮起來了！', duration: 9600 }
  ];
  const totalDuration = route.reduce((total, stop) => total + stop.duration, 0);
  const fireflyStops = [.29, .68];
  const heroEvery = 10;
  const heroes = [
    { costume: 'spark', name: '赤焰超人' },
    { costume: 'moon', name: '月光騎士' }
  ];
  const jumpDuration = 720;
  const fireflyWindow = 460;
  let stage = 0;
  let gems = 0;
  let bonusGems = 0;
  let questions = [];
  let progress = 0;
  let jumpTime = 0;
  let lastFrame = 0;
  let fireflyIndex = 0;
  let fireflyTimes = [];
  let trailTime = 0;
  let activeHero = null;
  let heroTimer;
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

  function updateGemMeter() {
    get('gems').textContent = '✦ ' + gems;
    get('gems').setAttribute('aria-label', '已收集 ' + gems + ' 顆螢火');
    const goal = (Math.floor(gems / heroEvery) + 1) * heroEvery;
    heroGoal.hidden = goal > route.length * (1 + fireflyStops.length);
    heroGoal.textContent = '／' + goal;
    heroGoal.setAttribute('aria-label', '下次變身目標 ' + goal + ' 顆');
  }

  function showCostume(costume) {
    runner.dataset.costume = costume;
    sprites.forEach((sprite) => { sprite.hidden = sprite.dataset.costume !== costume; });
  }

  function stopHeroEffect() {
    clearTimeout(heroTimer);
    heroNotice.hidden = true;
    delete runner.dataset.transforming;
  }

  function resetHero() {
    stopHeroEffect();
    activeHero = null;
    showCostume('scout');
  }

  function addGem() {
    gems++;
    updateGemMeter();
    if (gems % heroEvery !== 0) return false;
    activeHero = heroes[(gems / heroEvery - 1) % heroes.length];
    stopHeroEffect();
    showCostume(activeHero.costume);
    runner.dataset.transforming = 'true';
    heroNotice.textContent = '✦ ' + gems + ' 顆！變身成' + activeHero.name + '！';
    heroNotice.hidden = false;
    heroTimer = setTimeout(stopHeroEffect, 2000);
    playNotes([523, 659, 784, 1047, 1319]);
    return true;
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
    trailTime = 0;
    resetHero();
    updateGemMeter();
    run();
  }

  function run() {
    const stop = route[stage];
    progress = 0;
    jumpTime = 0;
    lastFrame = 0;
    fireflyIndex = 0;
    fireflyTimes = fireflyStops.map((fraction) => stop.duration * fraction);
    game.dataset.stop = stop.kind;
    obstacle.dataset.kind = stop.kind;
    obstacle.style.left = '115%';
    get('gate-art').textContent = stop.icon;
    firefly.hidden = false;
    firefly.style.left = '115%';
    runner.style.setProperty('--jump-offset', '0px');
    get('distance').textContent = '關卡 ' + (stage + 1) + '／' + route.length;
    setState('running');
    say('前往' + stop.title + '。看到螢火靠近時，按跳躍收集。');
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
    const step = Math.min(progress / route[stage].duration, 1);
    if (motion.matches) {
      obstacle.style.left = '64%';
    } else {
      obstacle.style.left = (174 - 113 * step) + '%';
      const distance = trailTime + progress;
      landscape.style.backgroundPosition = (18 + 68 * distance / totalDuration) + '% 62%';
      landscape.style.setProperty('--ground-offset', (-distance / 8) + 'px');
      const height = Math.min(116, Math.max(76, game.clientHeight * .2));
      runner.style.setProperty('--jump-offset', (-Math.sin(Math.PI * jumpTime / jumpDuration) * height) + 'px');
    }
    updateFirefly();
    if (step < 1) requestAnimationFrame(frame);
    else openQuestion();
  }

  function updateFirefly() {
    const arrival = fireflyTimes[fireflyIndex];
    if (arrival === undefined) {
      firefly.hidden = true;
      return;
    }
    const untilArrival = arrival - progress;
    const reduced = motion.matches;
    const visible = reduced ? untilArrival <= 1000 : untilArrival <= 1550;
    firefly.style.left = reduced ? '42%' : (28 + untilArrival * .054) + '%';
    const close = reduced ? visible : Math.abs(untilArrival) <= fireflyWindow;
    const caught = close && untilArrival >= -fireflyWindow && jumpTime > 100;
    if (caught) {
      bonusGems++;
      const transformed = addGem();
      say('抓到一顆額外的螢火！');
      if (!transformed) playNotes([659, 880]);
    }
    const passed = caught || untilArrival < -fireflyWindow;
    if (passed) fireflyIndex++;
    firefly.hidden = !visible || passed;
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
    get('gate-name').textContent = '第 ' + (stage + 1) + ' 關｜' + route[stage].title;
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
    const transformed = addGem();
    setState('clearing');
    say(size + ' × ' + count + '＝' + (size * count) + '。' + route[stage].cleared);
    if (!transformed) playNotes([523, 659, 784]);
    setTimeout(() => {
      trailTime += route[stage].duration;
      stage++;
      if (stage < route.length) run();
      else {
        get('result').textContent = '闖過 ' + route.length + ' 道關卡，收集 ' + gems + ' 顆螢火（跳躍加碼 ' + bonusGems + ' 顆）。';
        const heroResult = get('hero-result');
        heroResult.hidden = !activeHero;
        heroResult.textContent = activeHero ? '以「' + activeHero.name + '」的模樣抵達終點。' : '';
        setState('finish');
        get('replay').focus({ preventScroll: true });
        playNotes([523, 659, 784, 1047]);
      }
    }, 1000);
  }

  get('start').addEventListener('click', start);
  get('replay').addEventListener('click', start);
  get('menu').addEventListener('click', () => {
    resetHero();
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
