(function startApp() {
  const data = window.CONTE_GAME_DATA;
  const Engine = window.ConteGameEngine;
  const storageKey = 'explicam-un-conte:v1';
  const screen = document.querySelector('#screen');
  const scorePill = document.querySelector('#score-pill');
  const scoreValue = document.querySelector('#score-value');
  const homeButton = document.querySelector('#home-button');
  const flash = document.querySelector('#screen-flash');
  const body = document.body;
  const correctAnswerDuration = 2000;
  const flashDurations = Object.freeze({ correct: 630, wrong: 840 });

  let transitionTimer = null;
  let flashTimer = null;
  let interactionLocked = false;
  let activeView = 'home';
  let store = loadStore();

  const engine = new Engine({
    data,
    usage: store.usedVariants,
    onUsageChange(usage) {
      store.usedVariants = usage;
      saveStore();
    },
  });

  function blankAggregate() {
    return {
      plays: 0,
      completed: 0,
      totalCorrect: 0,
      totalWrong: 0,
      stories: {},
      members: Object.fromEntries(data.members.map((member) => [member.id, { rounds: 0, turns: 0, wrong: 0 }])),
    };
  }

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey));
      if (parsed?.version === 1) return parsed;
    } catch (error) {
      console.warn('No s’han pogut carregar les estadístiques.', error);
    }
    return { version: 1, usedVariants: {}, aggregate: blankAggregate() };
  }

  function saveStore() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(store));
    } catch (error) {
      console.warn('No s’han pogut desar les estadístiques.', error);
    }
  }

  function setTheme(theme) {
    body.dataset.theme = theme;
  }

  function showScore(value) {
    scoreValue.textContent = String(value);
    scorePill.classList.remove('is-hidden');
  }

  function hideScore() {
    scorePill.classList.add('is-hidden');
  }

  function focusScreen() {
    window.requestAnimationFrame(() => screen.focus({ preventScroll: true }));
  }

  function memberById(id) {
    return data.members.find((member) => member.id === id);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[character]);
  }

  function iconMarkup(story) {
    if (story.theme === 'porquets') {
      return `
        <div class="story-illustration pigs-art" aria-hidden="true">
          <span class="little-house little-house--straw"></span>
          <span class="pig-face pig-face--one">•ᴗ•</span>
          <span class="pig-face pig-face--two">•ᴗ•</span>
          <span class="pig-face pig-face--three">•ᴗ•</span>
          <span class="little-house little-house--brick"></span>
        </div>`;
    }
    return `
      <div class="story-illustration space-art" aria-hidden="true">
        <span class="space-star space-star--one">✦</span>
        <span class="space-star space-star--two">·</span>
        <span class="space-planet"><i></i></span>
        <span class="space-orbit"></span>
      </div>`;
  }

  function renderHome() {
    clearTimeout(transitionTimer);
    activeView = 'home';
    body.dataset.view = 'home';
    interactionLocked = false;
    setTheme('home');
    hideScore();
    screen.innerHTML = `
      <section class="home-view view-enter" aria-labelledby="home-title">
        <div class="home-copy">
          <p class="eyebrow">Endevina qui parla</p>
          <h1 id="home-title"><span class="home-title-sortit">Sortit</span><span>Explica'm</span><em>un conte</em></h1>
          <p class="home-intro">Cada frase té una veu. Reconeix-la i fes avançar la història.</p>
        </div>
        <div class="story-picker" aria-label="Tria una història">
          ${data.stories.map((story, index) => `
            <button class="story-card story-card--${story.theme}" type="button" data-story-id="${story.id}">
              <span class="story-number">0${index + 1}</span>
              ${iconMarkup(story)}
              <span class="story-card-copy">
                <small>${story.eyebrow}</small>
                <strong>${story.title}</strong>
                <span class="story-cta">Comença <b aria-hidden="true">↗</b></span>
              </span>
            </button>`).join('')}
          <button class="statistics-button" type="button" id="statistics-button">
            <span class="statistics-icon" aria-hidden="true"><i></i><i></i><i></i></span>
            <span><strong>Estadístiques</strong><small>Partides i veus més difícils</small></span>
            <b aria-hidden="true">→</b>
          </button>
        </div>
      </section>`;

    screen.querySelectorAll('[data-story-id]').forEach((button) => {
      button.addEventListener('click', () => startStory(button.dataset.storyId));
    });
    screen.querySelector('#statistics-button').addEventListener('click', renderStatistics);
    focusScreen();
  }

  function startStory(storyId) {
    const aggregate = store.aggregate ??= blankAggregate();
    aggregate.plays += 1;
    aggregate.stories[storyId] ??= { plays: 0, completed: 0, correct: 0, wrong: 0 };
    aggregate.stories[storyId].plays += 1;
    saveStore();
    engine.start(storyId);
    renderGame();
  }

  function renderGame({ feedback = '', feedbackType = '' } = {}) {
    const state = engine.snapshot();
    activeView = 'game';
    body.dataset.view = 'game';
    setTheme(state.story.theme);
    showScore(state.score);
    const progress = ((state.sentenceIndex + 1) / state.sentenceCount) * 100;

    screen.innerHTML = `
      <section class="game-view view-enter" aria-labelledby="story-heading">
        <div class="game-toolbar">
          <button class="round-back" id="round-back" type="button" aria-label="Abandona la partida i torna a l'inici">←</button>
          <div class="story-position">
            <span id="story-heading">${state.story.title}</span>
            <strong>${String(state.sentenceIndex + 1).padStart(2, '0')} <i>/</i> ${state.sentenceCount}</strong>
          </div>
        </div>
        <div class="progress-track" aria-label="Progrés del conte" aria-valuemin="1" aria-valuemax="${state.sentenceCount}" aria-valuenow="${state.sentenceIndex + 1}" role="progressbar">
          <span style="width:${progress}%"></span>
        </div>

        <div class="sentence-stage">
          <p class="sentence-kicker">Qui ho ha escrit?</p>
          <article class="sentence-card" id="sentence-card">
            <span class="quote-mark" aria-hidden="true">“</span>
            <p>${escapeHtml(state.current.text)}</p>
            <span class="message-tail" aria-hidden="true"></span>
          </article>
        </div>

        <div class="guess-area">
          <p class="guess-label">Tria una persona</p>
          <div class="member-grid" id="member-grid">
            ${data.members.map((member) => {
              const disabled = state.disabledMemberIds.includes(member.id);
              return `
                <button class="member-button${disabled ? ' is-wrong' : ''}" type="button" data-member-id="${member.id}" ${disabled ? 'disabled' : ''} style="--member-color:${member.color}">
                  <span class="member-avatar">${member.initials}<i aria-hidden="true">×</i></span>
                  <strong>${member.name}</strong>
                  <small>${disabled ? 'No és' : 'Pot ser'}</small>
                </button>`;
            }).join('')}
          </div>
          <p class="round-feedback ${feedbackType ? `feedback--${feedbackType}` : ''}" id="round-feedback" aria-live="assertive">${feedback}</p>
        </div>
      </section>`;

    screen.querySelector('#round-back').addEventListener('click', confirmExit);
    screen.querySelectorAll('[data-member-id]').forEach((button) => {
      button.addEventListener('click', () => makeGuess(button.dataset.memberId));
    });
    focusScreen();
  }

  function confirmExit() {
    if (window.confirm('Vols abandonar aquesta partida? El progrés del conte es perdrà.')) renderHome();
  }

  function flashResult(type) {
    const duration = flashDurations[type];
    window.clearTimeout(flashTimer);
    flash.className = `screen-flash flash--${type}`;
    window.requestAnimationFrame(() => flash.classList.add('is-active'));
    flashTimer = window.setTimeout(() => flash.classList.remove('is-active'), duration);
  }

  function showCorrectAnswer(member) {
    const guessArea = screen.querySelector('.guess-area');
    const currentHeight = Math.ceil(guessArea.getBoundingClientRect().height);
    guessArea.style.minHeight = `${currentHeight}px`;
    guessArea.classList.add('guess-area--correct');
    guessArea.innerHTML = `
      <div class="correct-answer" role="status" aria-live="assertive">
        <strong>Correcte!</strong>
        <span>${escapeHtml(member.name)}</span>
      </div>`;
  }

  function makeGuess(memberId) {
    if (interactionLocked) return;
    const result = engine.guess(memberId);
    if (result.type === 'ignored') return;

    if (result.type === 'wrong') {
      const guessed = memberById(memberId);
      flashResult('wrong');
      const feedback = `No és ${guessed.name}. La història avança amb la mateixa veu…`;
      renderGame({ feedback, feedbackType: 'wrong' });
      return;
    }

    if (result.type === 'wrong-finished') {
      interactionLocked = true;
      const guessed = memberById(memberId);
      flashResult('wrong');
      const buttons = screen.querySelectorAll('.member-button');
      buttons.forEach((button) => { button.disabled = true; });
      const wrongButton = screen.querySelector(`[data-member-id="${memberId}"]`);
      wrongButton?.classList.add('is-wrong');
      const feedback = screen.querySelector('#round-feedback');
      feedback.textContent = `No era ${guessed.name}. Final del conte.`;
      feedback.className = 'round-feedback feedback--wrong';
      transitionTimer = window.setTimeout(() => {
        interactionLocked = false;
        finishGame(result.snapshot);
      }, 900);
      return;
    }

    interactionLocked = true;
    const correct = memberById(memberId);
    flashResult('correct');
    showScore(result.score);
    showCorrectAnswer(correct);

    transitionTimer = window.setTimeout(() => {
      const next = engine.advance();
      interactionLocked = false;
      if (next.type === 'finished') finishGame(next.snapshot);
      else renderGame();
    }, correctAnswerDuration);
  }

  function finishGame(snapshot) {
    const aggregate = store.aggregate ??= blankAggregate();
    const totalWrong = Object.values(snapshot.metrics).reduce((sum, metric) => sum + metric.wrong, 0);
    aggregate.completed += 1;
    aggregate.totalCorrect += snapshot.score;
    aggregate.totalWrong += totalWrong;
    aggregate.stories[snapshot.storyId] ??= { plays: 1, completed: 0, correct: 0, wrong: 0 };
    aggregate.stories[snapshot.storyId].completed += 1;
    aggregate.stories[snapshot.storyId].correct += snapshot.score;
    aggregate.stories[snapshot.storyId].wrong += totalWrong;
    for (const member of data.members) {
      const target = aggregate.members[member.id] ??= { rounds: 0, turns: 0, wrong: 0 };
      target.rounds += snapshot.metrics[member.id].rounds;
      target.turns += snapshot.metrics[member.id].turns;
      target.wrong += snapshot.metrics[member.id].wrong;
    }
    saveStore();
    renderResults(snapshot);
  }

  function difficultyRows(metrics) {
    return data.members.map((member) => {
      const metric = metrics[member.id] ?? { rounds: 0, turns: 0, wrong: 0 };
      const average = metric.rounds ? metric.turns / metric.rounds : 0;
      return { member, ...metric, average };
    }).filter((row) => row.rounds > 0).sort((a, b) => b.average - a.average || b.wrong - a.wrong);
  }

  function chartMarkup(rows) {
    if (!rows.length) return '<p class="empty-state">Encara no hi ha prou dades.</p>';
    const max = Math.max(...rows.map((row) => row.average), 1);
    return rows.map((row, index) => `
      <div class="chart-row">
        <div class="chart-name">
          <span style="--member-color:${row.member.color}">${row.member.initials}</span>
          <strong>${row.member.name}</strong>
          ${index === 0 && rows.length > 1 ? '<small>Més difícil</small>' : ''}
          ${index === rows.length - 1 && rows.length > 1 ? '<small>Més fàcil</small>' : ''}
        </div>
        <div class="chart-measure">
          <span class="chart-bar"><i style="width:${Math.max(8, (row.average / max) * 100)}%;--member-color:${row.member.color}"></i></span>
          <strong>${formatNumber(row.average)}</strong>
          <small>intents / frase</small>
        </div>
      </div>`).join('');
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 1, minimumFractionDigits: value % 1 ? 1 : 0 }).format(value);
  }

  function renderResults(snapshot) {
    activeView = 'results';
    body.dataset.view = 'results';
    setTheme(snapshot.story.theme);
    showScore(snapshot.score);
    const rows = difficultyRows(snapshot.metrics);
    const totalWrong = rows.reduce((sum, row) => sum + row.wrong, 0);
    screen.innerHTML = `
      <section class="results-view view-enter" aria-labelledby="results-title">
        <div class="results-heading">
          <p class="eyebrow">Conte completat</p>
          <h1 id="results-title">Final feliç<em>—o gairebé.</em></h1>
          <p>${snapshot.story.title}</p>
        </div>
        <div class="score-result">
          <span><strong>${snapshot.score}</strong><i>/ ${snapshot.sentenceCount}</i></span>
          <p>Punts aconseguits</p>
          <small>${totalWrong === 0 ? 'Partida perfecta. Ni un sol dubte.' : `${totalWrong} ${totalWrong === 1 ? 'error' : 'errors'} abans de trobar les veus.`}</small>
        </div>
        <section class="difficulty-card" aria-labelledby="difficulty-title">
          <div class="section-heading">
            <div><p class="eyebrow">Radiografia de la partida</p><h2 id="difficulty-title">Qui t'ha costat més?</h2></div>
            <span>Menys intents = més fàcil</span>
          </div>
          <div class="difficulty-chart">${chartMarkup(rows)}</div>
        </section>
        <div class="result-actions">
          <button class="primary-action" id="play-again" type="button">Torna-hi <span aria-hidden="true">↻</span></button>
          <button class="secondary-action" id="result-home" type="button">Tria un altre conte</button>
        </div>
      </section>`;
    screen.querySelector('#play-again').addEventListener('click', () => startStory(snapshot.storyId));
    screen.querySelector('#result-home').addEventListener('click', renderHome);
    focusScreen();
  }

  function renderStatistics() {
    activeView = 'statistics';
    body.dataset.view = 'statistics';
    setTheme('statistics');
    hideScore();
    const aggregate = store.aggregate ?? blankAggregate();
    const rows = difficultyRows(aggregate.members);
    const accuracyDenominator = aggregate.totalCorrect + aggregate.totalWrong;
    const accuracy = accuracyDenominator ? Math.round((aggregate.totalCorrect / accuracyDenominator) * 100) : 0;

    screen.innerHTML = `
      <section class="statistics-view view-enter" aria-labelledby="statistics-title">
        <button class="text-back" id="stats-back" type="button">← Torna</button>
        <div class="statistics-heading">
          <p class="eyebrow">Historial d'aquest navegador</p>
          <h1 id="statistics-title">Estadístiques</h1>
          <p>Les versions vistes i els resultats es guarden només en aquest dispositiu.</p>
        </div>
        <div class="stat-grid">
          <article><small>Partides</small><strong>${aggregate.plays}</strong><span>${aggregate.completed} completades</span></article>
          <article><small>Encerts</small><strong>${aggregate.totalCorrect}</strong><span>${accuracy}% dels intents</span></article>
          <article><small>Errors</small><strong>${aggregate.totalWrong}</strong><span>abans d'encertar</span></article>
        </div>
        <section class="difficulty-card">
          <div class="section-heading">
            <div><p class="eyebrow">Totes les partides</p><h2>Veus més difícils</h2></div>
          </div>
          <div class="difficulty-chart">${chartMarkup(rows)}</div>
        </section>
        <div class="story-stat-list">
          ${data.stories.map((story) => {
            const stat = aggregate.stories[story.id] ?? { plays: 0, completed: 0, wrong: 0 };
            return `<article><span>${story.icon}</span><div><strong>${story.title}</strong><small>${stat.completed} acabades · ${stat.wrong} errors</small></div><b>${stat.plays}</b></article>`;
          }).join('')}
        </div>
        <button class="reset-button" id="reset-statistics" type="button">Esborra estadístiques i memòria de frases</button>
      </section>`;
    screen.querySelector('#stats-back').addEventListener('click', renderHome);
    screen.querySelector('#reset-statistics').addEventListener('click', resetStatistics);
    focusScreen();
  }

  function resetStatistics() {
    if (!window.confirm('Vols esborrar totes les estadístiques i permetre que tornin a sortir totes les versions?')) return;
    store = { version: 1, usedVariants: {}, aggregate: blankAggregate() };
    engine.usage = store.usedVariants;
    saveStore();
    renderStatistics();
  }

  homeButton.addEventListener('click', () => {
    if (activeView !== 'game' || window.confirm('Vols abandonar aquesta partida?')) renderHome();
  });
  document.querySelector('#data-version').textContent = `v${data.version}`;
  renderHome();
})();
