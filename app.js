(function () {
  "use strict";

  const DATA = window.SATSANG_DATA;
  const STORAGE_KEY = "satsang-punjabi-progress-v1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const LESSON_SIZE = 20;
  const PAGE_SIZE = 40;
  const main = document.getElementById("main-content");
  const lessonOverlay = document.getElementById("lesson-overlay");
  const modalRoot = document.getElementById("modal-root");
  const toastRoot = document.getElementById("toast-root");

  if (!DATA) {
    main.innerHTML = '<div class="empty-state">No se pudo cargar el vocabulario.</div>';
    return;
  }

  const stages = [
    { id: "core", number: 1, title: "Núcleo del satsang", subtitle: "Las formas que sostienen la mayoría de las frases", start: 1, end: 500, coverage: 86.37 },
    { id: "extension", number: 2, title: "Ampliación frecuente", subtitle: "Conectores, acciones y vocabulario recurrente", start: 501, end: 1000, coverage: 92.92 },
    { id: "high", number: 3, title: "Comprensión alta", subtitle: "Matices espirituales, narrativos y gramaticales", start: 1001, end: 2000, coverage: 97.32 },
    { id: "reference", number: 4, title: "Referencia completa", subtitle: "Formas raras y variantes del corpus procesado", start: 2001, end: 3698, coverage: 100 }
  ];

  const lessons = stages.flatMap((stage) => {
    const result = [];
    let local = 1;
    for (let start = stage.start; start <= stage.end; start += LESSON_SIZE) {
      result.push({
        id: `${stage.id}-${local}`,
        stageId: stage.id,
        number: local,
        start,
        end: Math.min(start + LESSON_SIZE - 1, stage.end)
      });
      local += 1;
    }
    return result;
  });

  let state = loadState();
  let session = null;
  let ui = {
    route: routeFromHash(),
    openStage: null,
    dictTab: "vocabulary",
    dictQuery: "",
    dictTier: "all",
    dictConfidence: "all",
    dictPage: 0,
    reviewMode: "mixed",
    reviewLength: 15
  };

  normalizeDailyState();
  bindGlobalEvents();
  registerServiceWorker();
  render();

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
        registration.update();
      } catch (error) {
        console.warn("No se pudo activar el modo sin conexión de Sisi.", error);
      }
    });
  }

  function defaultState() {
    return {
      xp: 0,
      streak: 0,
      lastStudy: null,
      dailyDate: dateKey(new Date()),
      dailyXp: 0,
      dailyGoal: 20,
      items: {},
      lessons: {},
      favorites: [],
      activity: {},
      settings: {
        transliteration: true,
        sound: true,
        includeLowConfidence: true
      }
    };
  }

  function loadState() {
    const fallback = defaultState();
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || typeof parsed !== "object") return fallback;
      return {
        ...fallback,
        ...parsed,
        items: parsed.items || {},
        lessons: parsed.lessons || {},
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        activity: parsed.activity || {},
        settings: { ...fallback.settings, ...(parsed.settings || {}) }
      };
    } catch (_error) {
      return fallback;
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateChrome();
  }

  function normalizeDailyState() {
    const today = dateKey(new Date());
    if (state.dailyDate !== today) {
      state.dailyDate = today;
      state.dailyXp = 0;
      saveState();
    }
  }

  function dateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function routeFromHash() {
    const route = location.hash.replace("#", "");
    return ["learn", "review", "dictionary", "progress"].includes(route) ? route : "learn";
  }

  function bindGlobalEvents() {
    document.addEventListener("click", (event) => {
      const routeButton = event.target.closest("[data-route]");
      if (routeButton) {
        navigate(routeButton.dataset.route);
        return;
      }

      if (event.target.closest("#settings-button") || event.target.closest("#mobile-settings-button")) {
        openSettings();
      }
    });

    window.addEventListener("hashchange", () => {
      ui.route = routeFromHash();
      window.scrollTo(0, 0);
      render();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!modalRoot.hidden) closeModal();
        else if (!lessonOverlay.hidden) requestCloseLesson();
      }
    });
  }

  function navigate(route) {
    if (location.hash === `#${route}`) {
      ui.route = route;
      window.scrollTo(0, 0);
      render();
    } else {
      location.hash = route;
    }
  }

  function render() {
    updateChrome();
    document.querySelectorAll("[data-route]").forEach((button) => {
      button.classList.toggle("active", button.dataset.route === ui.route);
    });

    if (ui.route === "review") renderReview();
    else if (ui.route === "dictionary") renderDictionary();
    else if (ui.route === "progress") renderProgress();
    else renderLearn();

    main.focus({ preventScroll: true });
  }

  function updateChrome() {
    const due = dueVocabulary().length;
    const badge = document.getElementById("review-badge");
    badge.textContent = String(due);
    badge.hidden = due === 0;
    document.getElementById("sidebar-goal").textContent = `${state.dailyXp} / ${state.dailyGoal} XP`;
    document.getElementById("sidebar-goal-bar").style.width = `${Math.min(100, state.dailyXp / state.dailyGoal * 100)}%`;
    document.getElementById("mobile-streak").textContent = String(state.streak);
    document.getElementById("mobile-xp").textContent = String(state.dailyXp);
  }

  function renderLearn() {
    const progress = progressStats();
    const nextLesson = lessons.find((lesson) => !state.lessons[lesson.id]?.completed) || lessons[lessons.length - 1];
    const nextStage = stages.find((stage) => stage.id === nextLesson.stageId);
    if (!ui.openStage) ui.openStage = nextStage.id;

    main.innerHTML = `
      <div class="content-wrap">
        <header class="page-header">
          <div>
            <p class="eyebrow">Tu camino</p>
            <h1>Punjabi para el satsang</h1>
            <p>Avanza por frecuencia: primero las palabras que más sostienen el discurso.</p>
          </div>
          <div class="header-stats">
            <span class="stat-chip"><b>${state.streak}</b> días</span>
            <span class="stat-chip"><b>${formatNumber(state.xp)}</b> XP</span>
          </div>
        </header>

        <section class="teacher-strip" aria-label="Lección recomendada">
          <div class="teacher-strip-copy">
            <p class="eyebrow">Siguiente: etapa ${nextStage.number}</p>
            <h2>${escapeHtml(nextStage.title)} · Lección ${nextLesson.number}</h2>
            <p>Formas ${nextLesson.start}–${nextLesson.end} por frecuencia</p>
            <button class="button gold" id="continue-learning" type="button">Continuar</button>
          </div>
        </section>

        <section class="overview-grid" aria-label="Resumen del curso">
          ${metric("Vocabulario visto", formatNumber(progress.learned), `de ${formatNumber(DATA.meta.full_vocabulary)}`)}
          ${metric("Dominadas", formatNumber(progress.mastered), `${formatPercent(progress.mastered / DATA.meta.full_vocabulary * 100)} del corpus`)}
          ${metric("Cobertura estimada", formatPercent(progress.tokenCoverage), "por frecuencia de apariciones")}
          ${metric("Repaso pendiente", formatNumber(dueVocabulary().length), "formas listas para hoy")}
        </section>

        <section>
          <div class="section-heading">
            <div>
              <h2>Práctica enfocada</h2>
              <p>Reconocimiento de las estructuras que conectan el vocabulario.</p>
            </div>
          </div>
          <div class="practice-grid">
            ${practiceCard("V", "Formas verbales", `${formatNumber(DATA.verbs.length)} conjugaciones`, "verbs")}
            ${practiceCard("P", "Partículas", `${formatNumber(DATA.particles.length)} conectores`, "particles")}
            ${practiceCard("F", "Frases", `${formatNumber(DATA.phrases.length)} expresiones`, "phrases")}
            ${practiceCard("+", "Combinaciones", `${formatNumber(DATA.collocations.length)} patrones`, "collocations")}
          </div>
        </section>

        <section>
          <div class="section-heading">
            <div>
              <h2>Ruta completa</h2>
              <p>${lessons.length} lecciones · ${formatNumber(DATA.meta.full_vocabulary)} formas</p>
            </div>
          </div>
          <div class="course-path">
            ${stages.map((stage) => stageTemplate(stage, nextLesson.id)).join("")}
          </div>
        </section>
      </div>`;

    document.getElementById("continue-learning").addEventListener("click", () => startLesson(nextLesson.id));
    main.querySelectorAll("[data-stage]").forEach((button) => {
      button.addEventListener("click", () => {
        ui.openStage = ui.openStage === button.dataset.stage ? null : button.dataset.stage;
        renderLearn();
      });
    });
    main.querySelectorAll("[data-lesson]").forEach((button) => {
      button.addEventListener("click", () => startLesson(button.dataset.lesson));
    });
    main.querySelectorAll("[data-practice]").forEach((button) => {
      button.addEventListener("click", () => startFocusedPractice(button.dataset.practice));
    });
  }

  function metric(label, value, detail) {
    return `<div class="metric"><span class="metric-label">${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
  }

  function practiceCard(icon, title, detail, mode) {
    return `
      <article class="practice-card">
        <span class="practice-icon" aria-hidden="true">${icon}</span>
        <strong>${title}</strong>
        <small>${detail}</small>
        <button class="button secondary small" type="button" data-practice="${mode}">Practicar</button>
      </article>`;
  }

  function stageTemplate(stage, nextLessonId) {
    const stageLessons = lessons.filter((lesson) => lesson.stageId === stage.id);
    const completed = stageLessons.filter((lesson) => state.lessons[lesson.id]?.completed).length;
    const percent = completed / stageLessons.length * 100;
    const open = ui.openStage === stage.id;
    return `
      <section class="stage ${open ? "open" : ""}">
        <button class="stage-summary" type="button" data-stage="${stage.id}" aria-expanded="${open}">
          <span class="stage-number">${stage.number}</span>
          <span class="stage-heading">
            <h3>${escapeHtml(stage.title)}</h3>
            <p>${escapeHtml(stage.subtitle)} · ${formatPercent(stage.coverage)} de cobertura acumulada</p>
          </span>
          <span class="stage-progress">
            <span>${completed} / ${stageLessons.length} lecciones</span>
            <span class="progress-track"><span style="width:${percent}%"></span></span>
          </span>
          <span class="stage-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="lesson-list">
          ${stageLessons.map((lesson) => lessonTemplate(lesson, lesson.id === nextLessonId)).join("")}
        </div>
      </section>`;
  }

  function lessonTemplate(lesson, recommended) {
    const record = state.lessons[lesson.id];
    const completed = Boolean(record?.completed);
    const className = completed ? "completed" : recommended ? "recommended" : "";
    const score = record ? `${record.best || 0}% mejor resultado` : `${lesson.end - lesson.start + 1} formas`;
    return `
      <div class="lesson-row ${className}">
        <span class="lesson-node" aria-hidden="true">${completed ? "✓" : lesson.number}</span>
        <span class="lesson-copy">
          <strong>Lección ${lesson.number}</strong>
          <small>Rangos ${lesson.start}–${lesson.end} · ${score}</small>
        </span>
        <button class="button ${recommended ? "gold" : "secondary"} small lesson-action" type="button" data-lesson="${lesson.id}">${completed ? "Repetir" : "Empezar"}</button>
      </div>`;
  }

  function renderReview() {
    const due = dueVocabulary();
    const weak = weakVocabulary(8);
    main.innerHTML = `
      <div class="content-wrap">
        <header class="page-header">
          <div>
            <p class="eyebrow">Memoria activa</p>
            <h1>Repaso</h1>
            <p>Las palabras vuelven cuando su recuerdo empieza a debilitarse.</p>
          </div>
          <div class="header-stats">
            <span class="stat-chip"><b>${due.length}</b> pendientes</span>
          </div>
        </header>

        <div class="review-layout">
          <div>
            <section class="panel review-hero">
              <div>
                <p class="eyebrow">Para hoy</p>
                <h2>${due.length ? "Tu repaso está listo" : "Memoria al día"}</h2>
                <p class="panel-copy">${due.length ? "Prioridad para errores recientes y recuerdos débiles." : "Puedes reforzar palabras débiles o adelantar vocabulario."}</p>
                <button class="button" id="smart-review" type="button">${due.length ? "Repasar ahora" : "Práctica inteligente"}</button>
              </div>
              <div class="review-number">${due.length}<small>formas pendientes</small></div>
            </section>

            <section class="panel">
              <h2>Sesión personalizada</h2>
              <div class="control-group">
                <label>Contenido</label>
                <div class="segmented" id="review-mode">
                  ${segmentButton("mixed", "Mixto")}
                  ${segmentButton("vocabulary", "Palabras")}
                  ${segmentButton("verbs", "Verbos")}
                  ${segmentButton("phrases", "Frases")}
                </div>
              </div>
              <div class="control-group">
                <label for="review-length">Preguntas</label>
                <div class="range-row">
                  <input id="review-length" type="range" min="5" max="30" step="5" value="${ui.reviewLength}">
                  <span class="range-value" id="review-length-value">${ui.reviewLength}</span>
                </div>
              </div>
              <button class="button secondary" id="custom-review" type="button">Iniciar sesión</button>
            </section>
          </div>

          <aside class="panel">
            <h3>Más débiles</h3>
            <p class="panel-copy">Formas vistas con menor fuerza de recuerdo.</p>
            ${weak.length ? `<ul class="weak-list">${weak.map(weakTemplate).join("")}</ul>` : '<div class="empty-state">Aún no hay palabras estudiadas.</div>'}
          </aside>
        </div>
      </div>`;

    document.getElementById("smart-review").addEventListener("click", startSmartReview);
    document.getElementById("custom-review").addEventListener("click", () => startCustomReview(ui.reviewMode, ui.reviewLength));
    document.querySelectorAll("#review-mode button").forEach((button) => {
      button.addEventListener("click", () => {
        ui.reviewMode = button.dataset.value;
        document.querySelectorAll("#review-mode button").forEach((item) => item.classList.toggle("active", item === button));
      });
    });
    document.getElementById("review-length").addEventListener("input", (event) => {
      ui.reviewLength = Number(event.target.value);
      document.getElementById("review-length-value").textContent = String(ui.reviewLength);
    });
  }

  function segmentButton(value, label) {
    return `<button class="${ui.reviewMode === value ? "active" : ""}" type="button" data-value="${value}">${label}</button>`;
  }

  function weakTemplate(item) {
    const strength = state.items[item.id]?.strength || 0;
    return `
      <li>
        <span class="weak-word"><span class="devanagari">${escapeHtml(item.d)}</span><small>${escapeHtml(firstMeaning(item.s))}</small></span>
        ${strengthDots(strength)}
      </li>`;
  }

  function strengthDots(strength) {
    return `<span class="strength-dots" aria-label="Fuerza ${strength} de 5">${[1, 2, 3, 4, 5].map((value) => `<i class="${value <= strength ? "on" : ""}"></i>`).join("")}</span>`;
  }

  function renderDictionary() {
    const tabs = [
      ["vocabulary", "Vocabulario", DATA.vocabulary.length],
      ["verbs", "Verbos", DATA.verbs.length],
      ["particles", "Partículas", DATA.particles.length],
      ["phrases", "Frases", DATA.phrases.length],
      ["collocations", "Combinaciones", DATA.collocations.length]
    ];
    main.innerHTML = `
      <div class="content-wrap">
        <header class="page-header">
          <div>
            <p class="eyebrow">Consulta completa</p>
            <h1>Diccionario</h1>
            <p>Busca en Devanagari, transliteración o español.</p>
          </div>
          <div class="header-stats">
            <span class="stat-chip"><b>${formatNumber(DATA.vocabulary.length)}</b> formas</span>
          </div>
        </header>

        <div class="dictionary-tabs" role="tablist">
          ${tabs.map(([id, label, count]) => `<button class="tab-button ${ui.dictTab === id ? "active" : ""}" type="button" data-dict-tab="${id}">${label} · ${formatNumber(count)}</button>`).join("")}
        </div>

        <div class="dictionary-tools">
          <label class="search-field">
            <span aria-hidden="true">⌕</span>
            <input class="text-input" id="dictionary-search" type="search" value="${escapeAttribute(ui.dictQuery)}" placeholder="Buscar palabra o significado" autocomplete="off">
          </label>
          <select class="select-input" id="dictionary-tier" aria-label="Filtrar por etapa" ${ui.dictTab !== "vocabulary" ? "disabled" : ""}>
            <option value="all">Todas las etapas</option>
            <option value="A" ${ui.dictTier === "A" ? "selected" : ""}>Núcleo 1–500</option>
            <option value="B" ${ui.dictTier === "B" ? "selected" : ""}>Ampliación 501–1000</option>
            <option value="C" ${ui.dictTier === "C" ? "selected" : ""}>Alta 1001–2000</option>
            <option value="D" ${ui.dictTier === "D" ? "selected" : ""}>Referencia 2001–3698</option>
          </select>
          <select class="select-input" id="dictionary-confidence" aria-label="Filtrar por confianza" ${!["vocabulary", "collocations"].includes(ui.dictTab) ? "disabled" : ""}>
            <option value="all">Toda confianza</option>
            <option value="Alta" ${ui.dictConfidence === "Alta" ? "selected" : ""}>Alta</option>
            <option value="Media" ${ui.dictConfidence === "Media" ? "selected" : ""}>Media</option>
            <option value="Baja" ${ui.dictConfidence === "Baja" ? "selected" : ""}>Baja</option>
          </select>
        </div>

        <div id="dictionary-results"></div>
      </div>`;

    main.querySelectorAll("[data-dict-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        ui.dictTab = button.dataset.dictTab;
        ui.dictPage = 0;
        renderDictionary();
      });
    });
    document.getElementById("dictionary-search").addEventListener("input", (event) => {
      ui.dictQuery = event.target.value;
      ui.dictPage = 0;
      renderDictionaryResults();
    });
    document.getElementById("dictionary-tier").addEventListener("change", (event) => {
      ui.dictTier = event.target.value;
      ui.dictPage = 0;
      renderDictionaryResults();
    });
    document.getElementById("dictionary-confidence").addEventListener("change", (event) => {
      ui.dictConfidence = event.target.value;
      ui.dictPage = 0;
      renderDictionaryResults();
    });
    renderDictionaryResults();
  }

  function renderDictionaryResults() {
    const container = document.getElementById("dictionary-results");
    if (!container) return;
    const rows = filteredDictionaryRows();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (ui.dictPage >= pages) ui.dictPage = pages - 1;
    const start = ui.dictPage * PAGE_SIZE;
    const visible = rows.slice(start, start + PAGE_SIZE);
    container.innerHTML = `
      <div class="dictionary-meta">
        <span>${formatNumber(rows.length)} resultados</span>
        <span>${rows.length ? `${formatNumber(start + 1)}–${formatNumber(Math.min(start + PAGE_SIZE, rows.length))}` : ""}</span>
      </div>
      ${visible.length ? `<div class="dictionary-list">${visible.map(dictionaryRowTemplate).join("")}</div>` : '<div class="empty-state">No hay coincidencias con estos filtros.</div>'}
      ${pages > 1 ? `<div class="pagination"><button class="button secondary small" id="page-prev" type="button" ${ui.dictPage === 0 ? "disabled" : ""}>Anterior</button><span>Página ${ui.dictPage + 1} de ${pages}</span><button class="button secondary small" id="page-next" type="button" ${ui.dictPage >= pages - 1 ? "disabled" : ""}>Siguiente</button></div>` : ""}`;

    container.querySelectorAll("[data-speak]").forEach((button) => button.addEventListener("click", () => speak(button.dataset.speak)));
    container.querySelectorAll("[data-favorite]").forEach((button) => button.addEventListener("click", () => toggleFavorite(button.dataset.favorite, button)));
    container.querySelectorAll("[data-known]").forEach((button) => button.addEventListener("click", () => markKnown(button.dataset.known, button)));
    document.getElementById("page-prev")?.addEventListener("click", () => { ui.dictPage -= 1; renderDictionaryResults(); scrollDictionaryTop(); });
    document.getElementById("page-next")?.addEventListener("click", () => { ui.dictPage += 1; renderDictionaryResults(); scrollDictionaryTop(); });
  }

  function filteredDictionaryRows() {
    const source = DATA[ui.dictTab];
    const query = normalizeText(ui.dictQuery);
    const consonantQuery = latinSkeleton(query);
    return source.filter((row) => {
      const d = row.d || row.form || "";
      const t = row.t || row.formT || "";
      const s = row.s || "";
      const extra = row.cat || row.type || row.use || row.lemma || "";
      const searchable = normalizeText(`${d} ${t} ${s} ${extra}`);
      const fuzzyTransliteration = consonantQuery.length >= 3 && latinSkeleton(normalizeText(t)).includes(consonantQuery);
      const matchesQuery = !query || searchable.includes(query) || fuzzyTransliteration;
      const matchesTier = ui.dictTab !== "vocabulary" || ui.dictTier === "all" || row.tier.startsWith(ui.dictTier);
      const matchesConfidence = !["vocabulary", "collocations"].includes(ui.dictTab) || ui.dictConfidence === "all" || row.conf === ui.dictConfidence;
      return matchesQuery && matchesTier && matchesConfidence;
    });
  }

  function dictionaryRowTemplate(row) {
    const isVerb = ui.dictTab === "verbs";
    const word = isVerb ? row.form : row.d;
    const transliteration = isVerb ? row.formT : row.t;
    const meaning = row.s;
    const meta = isVerb ? `${row.type} · ${row.lemma}` : row.cat || row.type || row.use || `${row.size} palabras`;
    const rank = row.rank ? `N.º ${formatNumber(row.rank)} · ${formatNumber(row.n)} apariciones` : typeof row.n === "number" ? `${formatNumber(row.n)} apariciones` : meta;
    const confidence = row.conf ? `<span class="confidence ${row.conf.toLowerCase()}">${row.conf}</span>` : "";
    const favorite = state.favorites.includes(row.id);
    const known = (state.items[row.id]?.strength || 0) >= 5;
    return `
      <div class="dictionary-row">
        <div class="word-primary">
          <strong class="devanagari">${escapeHtml(word)}</strong>
          ${state.settings.transliteration ? `<small>${escapeHtml(transliteration || "")}</small>` : ""}
        </div>
        <div class="word-meaning">${escapeHtml(meaning)}${isVerb ? `<small style="display:block;color:var(--muted);margin-top:4px">${escapeHtml(meta)}</small>` : ""}</div>
        <div class="word-meta">${confidence}<span>${escapeHtml(rank)}</span></div>
        <div class="row-actions">
          <button class="icon-button" type="button" data-speak="${escapeAttribute(word)}" aria-label="Escuchar ${escapeAttribute(word)}" title="Escuchar">🔊</button>
          <button class="icon-button favorite ${favorite ? "active" : ""}" type="button" data-favorite="${row.id}" aria-label="${favorite ? "Quitar de favoritos" : "Añadir a favoritos"}" title="Favorito">${favorite ? "★" : "☆"}</button>
          <button class="icon-button ${known ? "active" : ""}" type="button" data-known="${row.id}" aria-label="Marcar como conocida" title="Marcar como conocida">${known ? "✓" : "+"}</button>
        </div>
      </div>`;
  }

  function scrollDictionaryTop() {
    document.querySelector(".dictionary-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleFavorite(id, button) {
    const index = state.favorites.indexOf(id);
    if (index >= 0) state.favorites.splice(index, 1);
    else state.favorites.push(id);
    saveState();
    button.classList.toggle("active", index < 0);
    button.textContent = index < 0 ? "★" : "☆";
    button.setAttribute("aria-label", index < 0 ? "Quitar de favoritos" : "Añadir a favoritos");
  }

  function markKnown(id, button) {
    const record = itemRecord(id);
    record.seen = Math.max(1, record.seen);
    record.strength = 5;
    record.interval = 30;
    record.due = Date.now() + 30 * DAY_MS;
    saveState();
    button.textContent = "✓";
    toast("Marcada como conocida");
  }

  function renderProgress() {
    const progress = progressStats();
    const weekly = lastSevenDays();
    const maxXp = Math.max(20, ...weekly.map((day) => day.xp));
    main.innerHTML = `
      <div class="content-wrap">
        <header class="page-header">
          <div>
            <p class="eyebrow">Tu avance</p>
            <h1>Progreso</h1>
            <p>La cobertura sube más rápido al principio porque el curso sigue la frecuencia real.</p>
          </div>
        </header>

        <section class="progress-hero" aria-label="Estadísticas principales">
          ${bigStat("Experiencia total", formatNumber(state.xp), "XP acumulados")}
          ${bigStat("Racha actual", formatNumber(state.streak), "días de estudio")}
          ${bigStat("Cobertura estimada", formatPercent(progress.tokenCoverage), "del corpus procesado")}
        </section>

        <div class="progress-layout">
          <div>
            <section class="panel">
              <h2>Dominio por etapa</h2>
              <p class="panel-copy">Una forma cuenta como dominada al alcanzar fuerza 4 o 5.</p>
              ${stages.map((stage) => coverageTemplate(stage)).join("")}
            </section>

            <section class="panel">
              <h2>Actividad semanal</h2>
              <div class="weekly-chart" aria-label="XP de los últimos siete días">
                ${weekly.map((day) => `<div class="day-bar"><i style="height:${Math.max(4, day.xp / maxXp * 100)}%" title="${day.xp} XP"></i><span>${day.label}</span></div>`).join("")}
              </div>
            </section>
          </div>

          <aside>
            <section class="panel">
              <h3>Estado del vocabulario</h3>
              <ul class="activity-list">
                <li><span>Sin ver</span><strong>${formatNumber(DATA.vocabulary.length - progress.learned)}</strong></li>
                <li><span>En aprendizaje</span><strong>${formatNumber(Math.max(0, progress.learned - progress.mastered))}</strong></li>
                <li><span>Dominadas</span><strong>${formatNumber(progress.mastered)}</strong></li>
                <li><span>Favoritas</span><strong>${formatNumber(state.favorites.length)}</strong></li>
              </ul>
            </section>
            <section class="panel">
              <h3>Datos del curso</h3>
              <ul class="activity-list">
                <li><span>Formas</span><strong>${formatNumber(DATA.meta.full_vocabulary)}</strong></li>
                <li><span>Verbos</span><strong>${formatNumber(DATA.meta.verb_forms)}</strong></li>
                <li><span>Combinaciones</span><strong>${formatNumber(DATA.meta.collocations)}</strong></li>
                <li><span>Apariciones</span><strong>${formatNumber(DATA.meta.reference_tokens)}</strong></li>
              </ul>
            </section>
          </aside>
        </div>
      </div>`;
  }

  function bigStat(label, value, detail) {
    return `<div class="progress-big-stat"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
  }

  function coverageTemplate(stage) {
    const stageWords = DATA.vocabulary.slice(stage.start - 1, stage.end);
    const mastered = stageWords.filter((item) => (state.items[item.id]?.strength || 0) >= 4).length;
    const percent = mastered / stageWords.length * 100;
    return `<div class="coverage-row"><span>${stage.number}. ${escapeHtml(stage.title)}</span><span class="progress-track"><span style="width:${percent}%"></span></span><b>${formatPercent(percent)}</b></div>`;
  }

  function startLesson(lessonId) {
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    const words = DATA.vocabulary.slice(lesson.start - 1, lesson.end);
    const ordered = [...words].sort((a, b) => {
      const aSeen = state.items[a.id]?.seen || 0;
      const bSeen = state.items[b.id]?.seen || 0;
      return aSeen - bSeen || a.rank - b.rank;
    });
    startSession({
      title: `Lección ${lesson.number}`,
      subtitle: `Formas ${lesson.start}–${lesson.end}`,
      source: "lesson",
      lessonId,
      questions: ordered.map((item, index) => createVocabularyQuestion(item, index))
    });
  }

  function startFocusedPractice(mode) {
    const length = 15;
    if (mode === "verbs") {
      const rows = weightedSample(DATA.verbs, length, (row) => row.n || 1);
      startSession({ title: "Formas verbales", subtitle: "Conjugaciones", source: "practice", questions: rows.map(createVerbQuestion) });
    } else if (mode === "particles") {
      const rows = sample(DATA.particles, length);
      startSession({ title: "Partículas", subtitle: "Conectores esenciales", source: "practice", questions: rows.map(createParticleQuestion) });
    } else if (mode === "phrases") {
      const rows = sample(DATA.phrases, Math.min(length, DATA.phrases.length));
      startSession({ title: "Frases", subtitle: "Expresiones del satsang", source: "practice", questions: rows.map(createPhraseQuestion) });
    } else {
      const rows = weightedSample(DATA.collocations, length, (row) => row.n || 1);
      startSession({ title: "Combinaciones", subtitle: "Patrones frecuentes", source: "practice", questions: rows.map(createCollocationQuestion) });
    }
  }

  function startSmartReview() {
    let rows = dueVocabulary();
    if (!rows.length) rows = weakVocabulary(20);
    if (!rows.length) rows = DATA.vocabulary.slice(0, 20);
    rows = rows.slice(0, 20);
    startSession({ title: "Repaso inteligente", subtitle: `${rows.length} formas`, source: "review", questions: rows.map((item, index) => createVocabularyQuestion(item, index)) });
  }

  function startCustomReview(mode, length) {
    if (mode === "verbs") {
      const rows = sample(DATA.verbs, length);
      startSession({ title: "Repaso de verbos", subtitle: `${rows.length} preguntas`, source: "review", questions: rows.map(createVerbQuestion) });
    } else if (mode === "phrases") {
      const pool = [...DATA.phrases, ...DATA.collocations];
      const rows = sample(pool, length);
      startSession({ title: "Repaso de frases", subtitle: `${rows.length} preguntas`, source: "review", questions: rows.map((row) => row.id.startsWith("f") ? createPhraseQuestion(row) : createCollocationQuestion(row)) });
    } else if (mode === "vocabulary") {
      const seen = DATA.vocabulary.filter((item) => state.items[item.id]?.seen);
      const pool = seen.length >= length ? seen : DATA.vocabulary.slice(0, Math.max(500, length));
      const rows = sample(pool, length);
      startSession({ title: "Repaso de palabras", subtitle: `${rows.length} preguntas`, source: "review", questions: rows.map((item, index) => createVocabularyQuestion(item, index)) });
    } else {
      const questions = [];
      const vocabularyCount = Math.ceil(length * 0.55);
      sample(DATA.vocabulary.slice(0, 1000), vocabularyCount).forEach((item, index) => questions.push(createVocabularyQuestion(item, index)));
      sample(DATA.verbs, Math.ceil(length * 0.2)).forEach((row) => questions.push(createVerbQuestion(row)));
      sample(DATA.particles, Math.ceil(length * 0.1)).forEach((row) => questions.push(createParticleQuestion(row)));
      sample([...DATA.phrases, ...DATA.collocations], Math.max(1, length - questions.length)).forEach((row) => questions.push(row.id.startsWith("f") ? createPhraseQuestion(row) : createCollocationQuestion(row)));
      startSession({ title: "Repaso mixto", subtitle: `${length} preguntas`, source: "review", questions: shuffle(questions).slice(0, length) });
    }
  }

  function startSession(config) {
    if (!config.questions.length) {
      toast("No hay elementos disponibles para esta sesión");
      return;
    }
    session = {
      ...config,
      index: 0,
      selected: null,
      typed: "",
      checked: false,
      correct: 0,
      xp: 0,
      hearts: 5,
      mistakes: [],
      finished: false,
      passed: false
    };
    lessonOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    renderSession();
  }

  function createVocabularyQuestion(item, index) {
    const mode = ["meaning", "reverse", "meaning", "transliteration", "typing"][index % 5];
    if (mode === "reverse") {
      const choices = makeChoices(item, DATA.vocabulary, "d", (row) => row.d, (row) => Math.abs(row.rank - item.rank) < 220);
      return {
        itemId: item.id,
        kind: "choice",
        kicker: `Vocabulario · n.º ${item.rank}`,
        title: "Elige la forma en punjabi",
        promptText: firstMeaning(item.s),
        promptAsMeaning: true,
        speak: item.d,
        expected: item.d,
        choices
      };
    }
    if (mode === "transliteration") {
      const choices = makeChoices(item, DATA.vocabulary, "t", (row) => row.t, (row) => Math.abs(row.rank - item.rank) < 250);
      return {
        itemId: item.id,
        kind: "choice",
        kicker: `Pronunciación · n.º ${item.rank}`,
        title: "Elige la transliteración",
        promptWord: item.d,
        speak: item.d,
        expected: item.t,
        choices
      };
    }
    if (mode === "typing") {
      return {
        itemId: item.id,
        kind: "typing",
        kicker: `Producción · n.º ${item.rank}`,
        title: "Escribe un significado en español",
        promptWord: item.d,
        promptTransliteration: item.t,
        speak: item.d,
        expected: item.s
      };
    }
    const choices = makeChoices(item, DATA.vocabulary, "s", (row) => firstMeaning(row.s), (row) => Math.abs(row.rank - item.rank) < 220);
    return {
      itemId: item.id,
      kind: "choice",
      kicker: `Vocabulario · n.º ${item.rank}`,
      title: "¿Qué significa?",
      promptWord: item.d,
      promptTransliteration: item.t,
      speak: item.d,
      expected: firstMeaning(item.s),
      choices
    };
  }

  function createVerbQuestion(row) {
    const pool = DATA.verbs.filter((item) => item.type === row.type && item.form !== row.form);
    const choices = makeChoices(row, pool.length >= 3 ? pool : DATA.verbs, "form", (item) => item.form);
    return {
      itemId: row.id,
      kind: "choice",
      kicker: "Forma verbal",
      title: `Elige: ${row.type}`,
      promptWord: row.lemma,
      promptTransliteration: `${row.lemmaT} · ${row.s}`,
      speak: row.form,
      expected: row.form,
      choices
    };
  }

  function createParticleQuestion(row) {
    const choices = makeChoices(row, DATA.particles, "s", (item) => item.s);
    return {
      itemId: row.id,
      kind: "choice",
      kicker: row.type,
      title: "¿Qué función tiene esta partícula?",
      promptWord: row.d,
      promptTransliteration: row.t,
      speak: row.d,
      expected: row.s,
      choices
    };
  }

  function createPhraseQuestion(row) {
    const choices = makeChoices(row, DATA.phrases, "s", (item) => item.s);
    return {
      itemId: row.id,
      kind: "choice",
      kicker: row.use || "Frase",
      title: "Elige el sentido de la frase",
      promptWord: row.d,
      promptTransliteration: row.t,
      speak: row.d,
      expected: row.s,
      choices
    };
  }

  function createCollocationQuestion(row) {
    const choices = makeChoices(row, DATA.collocations, "s", (item) => item.s, (item) => item.size === row.size);
    return {
      itemId: row.id,
      kind: "choice",
      kicker: "Combinación frecuente",
      title: "Elige el sentido del patrón",
      promptWord: row.d,
      promptTransliteration: row.t,
      speak: row.d,
      expected: row.s,
      choices
    };
  }

  function makeChoices(correct, source, key, label, nearby) {
    let candidates = source.filter((item) => item.id !== correct.id && item[key] && item[key] !== correct[key] && (!nearby || nearby(item)));
    if (candidates.length < 3) candidates = source.filter((item) => item.id !== correct.id && item[key] && item[key] !== correct[key]);
    const distractors = sampleUniqueBy(candidates, 3, (item) => normalizeText(label(item)));
    return shuffle([
      { value: correct[key], label: label(correct), correct: true },
      ...distractors.map((item) => ({ value: item[key], label: label(item), correct: false }))
    ]);
  }

  function renderSession() {
    if (!session) return;
    if (session.finished) {
      renderSessionSummary();
      return;
    }
    const question = session.questions[session.index];
    const percent = session.index / session.questions.length * 100;
    lessonOverlay.innerHTML = `
      <div class="lesson-shell">
        <header class="lesson-topbar">
          <button class="icon-button" id="close-lesson" type="button" aria-label="Cerrar lección" title="Cerrar">×</button>
          <span class="progress-track"><span style="width:${percent}%"></span></span>
          <span class="hearts">${"♥".repeat(session.hearts)}${"♡".repeat(5 - session.hearts)}</span>
        </header>

        <section class="question-stage">
          <p class="question-kicker">${escapeHtml(question.kicker)}</p>
          <h1 class="question-title">${escapeHtml(question.title)}</h1>
          ${questionPromptTemplate(question)}
          ${question.kind === "typing" ? typingTemplate() : choicesTemplate(question)}
        </section>
      </div>
      ${lessonFooterTemplate(question)}`;

    document.getElementById("close-lesson").addEventListener("click", requestCloseLesson);
    if (question.speak) document.getElementById("question-speak")?.addEventListener("click", () => speak(question.speak));

    if (question.kind === "typing") {
      const input = document.getElementById("typed-answer");
      input.value = session.typed;
      input.addEventListener("input", (event) => {
        session.typed = event.target.value;
        document.getElementById("check-answer").disabled = !session.typed.trim();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && session.typed.trim() && !session.checked) checkCurrentAnswer();
      });
      setTimeout(() => input.focus(), 0);
    } else {
      lessonOverlay.querySelectorAll("[data-choice]").forEach((button) => {
        button.addEventListener("click", () => {
          if (session.checked) return;
          session.selected = Number(button.dataset.choice);
          lessonOverlay.querySelectorAll("[data-choice]").forEach((item) => item.classList.toggle("selected", item === button));
          document.getElementById("check-answer").disabled = false;
        });
      });
    }

    document.getElementById("check-answer")?.addEventListener("click", checkCurrentAnswer);
    document.getElementById("next-question")?.addEventListener("click", advanceSession);
  }

  function questionPromptTemplate(question) {
    if (question.promptAsMeaning) {
      return `<div class="prompt-word-wrap"><div class="prompt-word"><span style="font-size:25px;font-weight:800;line-height:1.35">${escapeHtml(question.promptText)}</span></div><button class="icon-button speak-button" id="question-speak" type="button" aria-label="Escuchar respuesta" title="Escuchar">🔊</button></div>`;
    }
    return `
      <div class="prompt-word-wrap">
        <div class="prompt-word">
          <span class="devanagari">${escapeHtml(question.promptWord)}</span>
          ${state.settings.transliteration && question.promptTransliteration ? `<span class="transliteration">${escapeHtml(question.promptTransliteration)}</span>` : ""}
        </div>
        <button class="icon-button speak-button" id="question-speak" type="button" aria-label="Escuchar" title="Escuchar">🔊</button>
      </div>`;
  }

  function choicesTemplate(question) {
    return `<div class="choices">${question.choices.map((choice, index) => {
      let resultClass = "";
      if (session.checked && choice.correct) resultClass = "correct";
      else if (session.checked && session.selected === index && !choice.correct) resultClass = "wrong";
      else if (!session.checked && session.selected === index) resultClass = "selected";
      const devanagariClass = /[\u0900-\u097f]/.test(choice.label) ? "devanagari" : "";
      return `<button class="choice ${resultClass}" type="button" data-choice="${index}" ${session.checked ? "disabled" : ""}><span class="choice-index">${index + 1}</span><span class="choice-text ${devanagariClass}">${escapeHtml(choice.label)}</span></button>`;
    }).join("")}</div>`;
  }

  function typingTemplate() {
    return `<form class="answer-form" onsubmit="return false"><label class="field-label" for="typed-answer">Traducción</label><input class="answer-input" id="typed-answer" type="text" autocomplete="off" autocapitalize="none" ${session.checked ? "disabled" : ""}></form>`;
  }

  function lessonFooterTemplate(question) {
    if (!session.checked) {
      const disabled = question.kind === "typing" ? !session.typed.trim() : session.selected === null;
      return `<footer class="lesson-footer"><div class="lesson-footer-inner"><span></span><button class="button" id="check-answer" type="button" ${disabled ? "disabled" : ""}>Comprobar</button></div></footer>`;
    }
    const correct = currentAnswerIsCorrect(question);
    const title = correct ? "¡Correcto!" : "Respuesta correcta";
    return `<footer class="lesson-footer ${correct ? "correct" : "wrong"}"><div class="lesson-footer-inner"><div class="feedback-copy"><strong>${title}</strong><span>${escapeHtml(question.expected)}</span></div><button class="button ${correct ? "" : "danger"}" id="next-question" type="button">${session.hearts === 0 || session.index === session.questions.length - 1 ? "Ver resultado" : "Continuar"}</button></div></footer>`;
  }

  function checkCurrentAnswer() {
    if (!session || session.checked) return;
    const question = session.questions[session.index];
    const correct = currentAnswerIsCorrect(question);
    session.checked = true;
    updateItemMemory(question.itemId, correct);
    registerStudy(correct ? 10 : 0);
    if (correct) {
      session.correct += 1;
      session.xp += 10;
      if (state.settings.sound) playTone(560, 0.08);
    } else {
      session.hearts = Math.max(0, session.hearts - 1);
      session.mistakes.push(question.itemId);
      if (state.settings.sound) playTone(210, 0.12);
    }
    saveState();
    renderSession();
  }

  function currentAnswerIsCorrect(question) {
    if (question.kind === "typing") return typedAnswerMatches(session.typed, question.expected);
    return session.selected !== null && Boolean(question.choices[session.selected]?.correct);
  }

  function typedAnswerMatches(answer, expected) {
    const normalized = normalizeText(answer);
    const accepted = expected.split(/[;\/]|\bo\b/gi).map((part) => normalizeText(part)).filter((part) => part.length >= 2);
    return accepted.some((part) => normalized === part || (part.length >= 5 && (normalized.includes(part) || part.includes(normalized))));
  }

  function advanceSession() {
    if (!session) return;
    if (session.hearts === 0) {
      finishSession(false);
      return;
    }
    if (session.index >= session.questions.length - 1) {
      finishSession(true);
      return;
    }
    session.index += 1;
    session.selected = null;
    session.typed = "";
    session.checked = false;
    renderSession();
  }

  function finishSession(passed) {
    session.finished = true;
    session.passed = passed;
    if (passed && session.source === "lesson") {
      const score = Math.round(session.correct / session.questions.length * 100);
      const current = state.lessons[session.lessonId] || {};
      state.lessons[session.lessonId] = {
        completed: true,
        best: Math.max(current.best || 0, score),
        completedAt: new Date().toISOString()
      };
      state.xp += 20;
      state.dailyXp += 20;
      state.activity[dateKey(new Date())] = (state.activity[dateKey(new Date())] || 0) + 20;
      session.xp += 20;
    }
    saveState();
    renderSessionSummary();
  }

  function renderSessionSummary() {
    const accuracy = Math.round(session.correct / Math.max(1, session.index + (session.passed ? 1 : 1)) * 100);
    lessonOverlay.innerHTML = `
      <div class="lesson-shell">
        <div class="lesson-summary">
          <div class="summary-seal">${session.passed ? "✓" : "↻"}</div>
          <h2>${session.passed ? "Sesión completada" : "Toca reforzar"}</h2>
          <p>${escapeHtml(session.title)} · ${escapeHtml(session.subtitle)}</p>
          <div class="summary-stats">
            <div><strong>${session.xp}</strong><span>XP</span></div>
            <div><strong>${accuracy}%</strong><span>Acierto</span></div>
            <div><strong>${session.mistakes.length}</strong><span>Errores</span></div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
            ${session.mistakes.length ? '<button class="button secondary" id="retry-mistakes" type="button">Repetir errores</button>' : ""}
            <button class="button" id="finish-session" type="button">Volver al curso</button>
          </div>
        </div>
      </div>`;
    document.getElementById("finish-session").addEventListener("click", closeLesson);
    document.getElementById("retry-mistakes")?.addEventListener("click", retryMistakes);
  }

  function retryMistakes() {
    const mistakeIds = new Set(session.mistakes);
    const questions = session.questions.filter((question) => mistakeIds.has(question.itemId));
    startSession({ title: "Errores recientes", subtitle: `${questions.length} preguntas`, source: "review", questions: shuffle(questions) });
  }

  function requestCloseLesson() {
    if (!session || session.finished || session.index === 0 && !session.checked) {
      closeLesson();
      return;
    }
    openConfirm({
      title: "¿Salir de la sesión?",
      message: "Tu memoria sí se guarda, pero esta sesión quedará incompleta.",
      confirmLabel: "Salir",
      danger: true,
      onConfirm: closeLesson
    });
  }

  function closeLesson() {
    session = null;
    lessonOverlay.hidden = true;
    lessonOverlay.innerHTML = "";
    document.body.style.overflow = "";
    render();
  }

  function updateItemMemory(id, correct) {
    const record = itemRecord(id);
    record.seen += 1;
    if (correct) {
      record.correct += 1;
      record.strength = Math.min(5, record.strength + 1);
      record.ease = Math.min(3, record.ease + 0.05);
      if (record.interval === 0) record.interval = 1;
      else if (record.interval === 1) record.interval = 3;
      else record.interval = Math.max(4, Math.round(record.interval * record.ease));
      record.due = Date.now() + record.interval * DAY_MS;
    } else {
      record.wrong += 1;
      record.strength = Math.max(0, record.strength - 1);
      record.ease = Math.max(1.3, record.ease - 0.2);
      record.interval = 0;
      record.due = Date.now() + 10 * 60 * 1000;
    }
  }

  function itemRecord(id) {
    if (!state.items[id]) {
      state.items[id] = { seen: 0, correct: 0, wrong: 0, strength: 0, ease: 2.3, interval: 0, due: 0 };
    }
    return state.items[id];
  }

  function registerStudy(xp) {
    const today = dateKey(new Date());
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    if (state.lastStudy !== today) {
      state.streak = state.lastStudy === yesterday ? state.streak + 1 : 1;
      state.lastStudy = today;
    }
    if (xp) {
      state.xp += xp;
      state.dailyXp += xp;
      state.activity[today] = (state.activity[today] || 0) + xp;
    }
  }

  function dueVocabulary() {
    const now = Date.now();
    return DATA.vocabulary
      .filter((item) => state.items[item.id]?.seen && state.items[item.id].due <= now)
      .sort((a, b) => (state.items[a.id].strength - state.items[b.id].strength) || (state.items[a.id].due - state.items[b.id].due));
  }

  function weakVocabulary(limit) {
    return DATA.vocabulary
      .filter((item) => state.items[item.id]?.seen)
      .sort((a, b) => (state.items[a.id].strength - state.items[b.id].strength) || (state.items[a.id].correct - state.items[b.id].correct))
      .slice(0, limit);
  }

  function progressStats() {
    let learned = 0;
    let mastered = 0;
    let coveredTokens = 0;
    for (const item of DATA.vocabulary) {
      const strength = state.items[item.id]?.strength || 0;
      if (state.items[item.id]?.seen) learned += 1;
      if (strength >= 4) mastered += 1;
      if (strength > 0) coveredTokens += item.n;
    }
    return { learned, mastered, tokenCoverage: coveredTokens / DATA.meta.reference_tokens * 100 };
  }

  function openSettings() {
    modalRoot.hidden = false;
    modalRoot.innerHTML = `
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="modal-header">
          <h2 id="settings-title">Ajustes</h2>
          <button class="icon-button" id="close-settings" type="button" aria-label="Cerrar">×</button>
        </header>
        <div class="setting-row">
          <div><strong>Mostrar transliteración</strong><small>Ayuda de lectura bajo el Devanagari.</small></div>
          <label class="switch"><input id="setting-transliteration" type="checkbox" ${state.settings.transliteration ? "checked" : ""}><span></span></label>
        </div>
        <div class="setting-row">
          <div><strong>Sonido de respuesta</strong><small>Tonos breves al comprobar.</small></div>
          <label class="switch"><input id="setting-sound" type="checkbox" ${state.settings.sound ? "checked" : ""}><span></span></label>
        </div>
        <div class="setting-row">
          <div><strong>Meta diaria</strong><small>Experiencia objetivo para cada día.</small></div>
          <select class="select-input" id="setting-goal" style="width:110px">
            ${[10, 20, 30, 50].map((value) => `<option value="${value}" ${state.dailyGoal === value ? "selected" : ""}>${value} XP</option>`).join("")}
          </select>
        </div>
        <div class="modal-actions">
          <button class="button secondary" id="export-progress" type="button">Exportar progreso</button>
          <button class="button secondary" id="import-progress" type="button">Importar progreso</button>
          <input id="import-file" type="file" accept="application/json" hidden>
          <button class="button danger" id="reset-progress" type="button">Reiniciar</button>
        </div>
      </section>`;

    document.getElementById("close-settings").addEventListener("click", closeModal);
    document.getElementById("setting-transliteration").addEventListener("change", (event) => { state.settings.transliteration = event.target.checked; saveState(); });
    document.getElementById("setting-sound").addEventListener("change", (event) => { state.settings.sound = event.target.checked; saveState(); });
    document.getElementById("setting-goal").addEventListener("change", (event) => { state.dailyGoal = Number(event.target.value); saveState(); });
    document.getElementById("export-progress").addEventListener("click", exportProgress);
    document.getElementById("import-progress").addEventListener("click", () => document.getElementById("import-file").click());
    document.getElementById("import-file").addEventListener("change", importProgress);
    document.getElementById("reset-progress").addEventListener("click", confirmReset);
    modalRoot.onclick = (event) => { if (event.target === modalRoot) closeModal(); };
  }

  function closeModal() {
    modalRoot.hidden = true;
    modalRoot.innerHTML = "";
    modalRoot.onclick = null;
  }

  function openConfirm({ title, message, confirmLabel, danger, onConfirm }) {
    modalRoot.hidden = false;
    modalRoot.innerHTML = `
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <header class="modal-header"><h2 id="confirm-title">${escapeHtml(title)}</h2><button class="icon-button" id="cancel-confirm-x" type="button" aria-label="Cerrar">×</button></header>
        <p class="panel-copy">${escapeHtml(message)}</p>
        <div class="modal-actions"><button class="button secondary" id="cancel-confirm" type="button">Cancelar</button><button class="button ${danger ? "danger" : ""}" id="accept-confirm" type="button">${escapeHtml(confirmLabel)}</button></div>
      </section>`;
    document.getElementById("cancel-confirm-x").addEventListener("click", closeModal);
    document.getElementById("cancel-confirm").addEventListener("click", closeModal);
    document.getElementById("accept-confirm").addEventListener("click", () => { closeModal(); onConfirm(); });
  }

  function confirmReset() {
    openConfirm({
      title: "Reiniciar progreso",
      message: "Se borrarán XP, racha, lecciones, favoritos y memoria de repaso.",
      confirmLabel: "Borrar progreso",
      danger: true,
      onConfirm: () => {
        state = defaultState();
        saveState();
        closeModal();
        render();
        toast("Progreso reiniciado");
      }
    });
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), state }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sisi-progreso-${dateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast("Progreso exportado");
  }

  function importProgress(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const imported = parsed.state || parsed;
        if (!imported.items || !imported.settings) throw new Error("Formato no válido");
        state = { ...defaultState(), ...imported, settings: { ...defaultState().settings, ...imported.settings } };
        saveState();
        closeModal();
        render();
        toast("Progreso importado");
      } catch (_error) {
        toast("El archivo de progreso no es válido");
      }
    };
    reader.readAsText(file);
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      toast("La voz no está disponible en este navegador");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const punjabi = voices.find((voice) => voice.lang.toLowerCase().startsWith("pa"));
    const hindi = voices.find((voice) => voice.lang.toLowerCase().startsWith("hi"));
    utterance.voice = punjabi || hindi || null;
    utterance.lang = punjabi?.lang || hindi?.lang || "pa-IN";
    utterance.rate = 0.72;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  function playTone(frequency, duration) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch (_error) {
      // Sound feedback is optional.
    }
  }

  function toast(message) {
    const element = document.createElement("div");
    element.className = "toast";
    element.textContent = message;
    toastRoot.appendChild(element);
    setTimeout(() => element.remove(), 2600);
  }

  function lastSevenDays() {
    const labels = ["D", "L", "M", "X", "J", "V", "S"];
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.now() - (6 - index) * DAY_MS);
      return { key: dateKey(date), label: labels[date.getDay()], xp: state.activity[dateKey(date)] || 0 };
    });
  }

  function sample(source, count) {
    return shuffle([...source]).slice(0, Math.min(count, source.length));
  }

  function weightedSample(source, count, weight) {
    const pool = source.map((item) => ({ item, score: Math.random() ** (1 / Math.max(1, Math.log2(weight(item) + 2))) }));
    return pool.sort((a, b) => b.score - a.score).slice(0, Math.min(count, pool.length)).map((entry) => entry.item);
  }

  function sampleUniqueBy(source, count, key) {
    const values = new Set();
    const result = [];
    for (const item of shuffle([...source])) {
      const value = key(item);
      if (!value || values.has(value)) continue;
      values.add(value);
      result.push(item);
      if (result.length === count) break;
    }
    return result;
  }

  function shuffle(array) {
    for (let index = array.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [array[index], array[swap]] = [array[swap], array[index]];
    }
    return array;
  }

  function firstMeaning(value) {
    return String(value || "").split(";")[0].trim();
  }

  function normalizeText(value) {
    return String(value || "")
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function latinSkeleton(value) {
    return String(value || "").replace(/[^a-zñ]/g, "").replace(/[aeiou]/g, "");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("es-ES").format(value || 0);
  }

  function formatPercent(value) {
    const digits = value > 0 && value < 10 ? 1 : 0;
    return `${Number(value || 0).toLocaleString("es-ES", { maximumFractionDigits: digits })}%`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();
