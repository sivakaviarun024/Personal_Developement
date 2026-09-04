/* ============================================================
   LIFECOUNT — script.js
   Vanilla JS. No dependencies. No network calls.
============================================================ */

(function () {
  "use strict";

  /* ----------------------------------------------------------
     Constants / storage keys
  ---------------------------------------------------------- */
  const KEYS = {
    profile: "lifecountProfile",
    goals: "lifecountGoals",
    milestones: "lifecountMilestones",
    theme: "lifecountTheme",
  };

  const DAY_MS = 86400000;
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  let profile = null;
  let currentView = "dashboard";
  let editingGoalId = null; // reserved for future edit support

  /* ----------------------------------------------------------
     Small DOM helpers
  ---------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(Math.max(0, n)).padStart(2, "0");

  /* ----------------------------------------------------------
     Storage helpers
  ---------------------------------------------------------- */
  function loadProfile() {
    try {
      const raw = localStorage.getItem(KEYS.profile);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveProfile(p) {
    localStorage.setItem(KEYS.profile, JSON.stringify(p));
  }
  function loadGoals() {
    try { return JSON.parse(localStorage.getItem(KEYS.goals)) || []; }
    catch (e) { return []; }
  }
  function saveGoals(goals) {
    localStorage.setItem(KEYS.goals, JSON.stringify(goals));
  }
  function loadMilestones() {
    try { return JSON.parse(localStorage.getItem(KEYS.milestones)) || []; }
    catch (e) { return []; }
  }
  function saveMilestones(ms) {
    localStorage.setItem(KEYS.milestones, JSON.stringify(ms));
  }
  function loadTheme() {
    return localStorage.getItem(KEYS.theme) || "dark";
  }
  function saveTheme(t) {
    localStorage.setItem(KEYS.theme, t);
  }

  /* ----------------------------------------------------------
     DATE CALCULATION ENGINE
     All "calendar" math is done with year/month/day components,
     never with fixed-length assumptions (no "1 month = 30 days").
     All "exact" math is done with true millisecond timestamps.
  ---------------------------------------------------------- */

  // Parse a "YYYY-MM-DD" input value into a local-midnight Date.
  function parseDateOnly(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  function dateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  // Add `years` to a date, safely handling month-length overflow
  // (most importantly Feb 29 birthdays landing on a non-leap year).
  function addYearsSafe(date, years) {
    const targetYear = date.getFullYear() + years;
    const month = date.getMonth();
    const daysInTargetMonth = new Date(targetYear, month + 1, 0).getDate();
    const day = Math.min(date.getDate(), daysInTargetMonth);
    return new Date(targetYear, month, day, date.getHours(), date.getMinutes(), date.getSeconds());
  }

  // Same idea, but for finding "this date's month/day in a given year"
  // (used for next-birthday lookups).
  function dateInYear(date, year) {
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const day = Math.min(date.getDate(), daysInMonth);
    return new Date(year, month, day);
  }

  // Calendar-aware age/duration between two dates -> {years, months, days}.
  // Does not assume fixed month lengths; borrows from the actual
  // preceding calendar month when the day count goes negative.
  function calendarDiff(start, end) {
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonthLastDay = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
      days += prevMonthLastDay;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 0) { years = 0; months = 0; days = 0; }
    return { years, months, days };
  }

  // Exact millisecond difference, floored at zero.
  function exactDiffMs(fromDate, toDate) {
    return Math.max(0, toDate.getTime() - fromDate.getTime());
  }

  // Convert a millisecond duration into whole days/hours/minutes/seconds.
  function msToUnits(ms) {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { days, hours, minutes, seconds, totalSeconds };
  }

  function formatDate(date) {
    return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  function formatMonthDay(date) {
    return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
  }

  function formatNumber(n) {
    return Math.round(n).toLocaleString("en-US");
  }

  /* ----------------------------------------------------------
     Core life-data calculator — the single source of truth
     every view renders from.
  ---------------------------------------------------------- */
  function getLifeData(prof, now) {
    const dob = parseDateOnly(prof.dob);
    const horizonYears = prof.horizonYears;
    const horizon = addYearsSafe(dob, horizonYears);

    const totalHorizonMs = Math.max(0, horizon.getTime() - dob.getTime());
    const livedMs = exactDiffMs(dob, now);
    const remainingMs = exactDiffMs(now, horizon);

    const cappedLivedMs = Math.min(livedMs, totalHorizonMs);
    const percentLived = totalHorizonMs > 0 ? Math.min(100, (cappedLivedMs / totalHorizonMs) * 100) : 100;

    const age = calendarDiff(dob, now);
    const livedUnits = msToUnits(livedMs);
    const remainingUnits = msToUnits(remainingMs);
    const totalHorizonUnits = msToUnits(totalHorizonMs);

    const livedCalendar = calendarDiff(dob, now); // years/months/days lived
    const remainingCalendar = now < horizon ? calendarDiff(now, horizon) : { years: 0, months: 0, days: 0 };
    const totalCalendar = { years: horizonYears, months: horizonYears * 12, days: totalHorizonUnits.days };

    // This year
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
    const daysInYear = Math.round((yearEnd - yearStart) / DAY_MS);
    const daysPassedThisYear = Math.floor((dateOnly(now) - yearStart) / DAY_MS) + 1;
    const yearPercent = Math.min(100, (daysPassedThisYear / daysInYear) * 100);

    // Today
    const todayStart = dateOnly(now);
    const todayPercent = ((now - todayStart) / DAY_MS) * 100;

    // Next birthday
    const nowDateOnly = dateOnly(now);
    let birthdayCandidate = dateInYear(dob, now.getFullYear());
    if (birthdayCandidate < nowDateOnly) {
      birthdayCandidate = dateInYear(dob, now.getFullYear() + 1);
    }
    const daysUntilBirthday = Math.round((birthdayCandidate - nowDateOnly) / DAY_MS);

    // Life compressed into one year (non-leap reference year, 365 days)
    const fraction = totalHorizonMs > 0 ? Math.min(1, cappedLivedMs / totalHorizonMs) : 1;
    const compressedIndex = Math.min(364, Math.floor(fraction * 365));
    const compressedDate = new Date(2001, 0, 1 + compressedIndex);

    return {
      dob, horizon, now,
      totalHorizonMs, livedMs, remainingMs,
      percentLived,
      age,
      livedUnits, remainingUnits, totalHorizonUnits,
      livedCalendar, remainingCalendar, totalCalendar,
      daysInYear, daysPassedThisYear, yearPercent,
      todayPercent,
      birthdayCandidate, daysUntilBirthday,
      fraction, compressedDate,
      isPastHorizon: now >= horizon,
    };
  }

  /* ----------------------------------------------------------
     Toasts
  ---------------------------------------------------------- */
  function showToast(message, type) {
    const container = $("toast-container");
    const el = document.createElement("div");
    el.className = "toast" + (type === "error" ? " toast--error" : "");
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, 3200);
  }

  /* ----------------------------------------------------------
     Validation
  ---------------------------------------------------------- */
  function resolveHorizonYears(selectValue, customValue) {
    if (selectValue === "custom") {
      const n = parseInt(customValue, 10);
      return Number.isFinite(n) ? n : NaN;
    }
    return parseInt(selectValue, 10);
  }

  function validateProfileInput(dobStr, horizonYears) {
    if (!dobStr) return "Please enter a date of birth.";
    const dob = parseDateOnly(dobStr);
    const now = new Date();
    if (dob > now) return "Date of birth cannot be in the future.";
    if (!Number.isFinite(horizonYears) || horizonYears < 1 || horizonYears > 120) {
      return "Life horizon must be between 1 and 120 years.";
    }
    const currentAge = calendarDiff(dob, now).years;
    if (horizonYears <= currentAge) {
      return "Life horizon must be greater than your current age.";
    }
    return null;
  }

  /* ----------------------------------------------------------
     ONBOARDING
  ---------------------------------------------------------- */
  function initOnboarding() {
    const form = $("onboarding-form");
    const horizonSelect = $("ob-horizon");
    const customField = $("ob-custom-field");
    const customInput = $("ob-custom");
    const dobInput = $("ob-dob");
    const nameInput = $("ob-name");
    const preview = $("ob-preview");
    const errorEl = $("ob-error");

    dobInput.max = new Date().toISOString().slice(0, 10);

    function updatePreview() {
      const dobStr = dobInput.value;
      const horizonYears = resolveHorizonYears(horizonSelect.value, customInput.value);
      if (!dobStr || !Number.isFinite(horizonYears) || horizonYears < 1) {
        preview.hidden = true;
        return;
      }
      const dob = parseDateOnly(dobStr);
      const now = new Date();
      if (dob > now) { preview.hidden = true; return; }
      const horizon = addYearsSafe(dob, horizonYears);
      const age = calendarDiff(dob, now);
      $("ob-preview-horizon").textContent = formatDate(horizon);
      $("ob-preview-age").textContent = `${age.years} years ${age.months} months ${age.days} days`;
      preview.hidden = false;
    }

    horizonSelect.addEventListener("change", () => {
      customField.hidden = horizonSelect.value !== "custom";
      updatePreview();
    });
    dobInput.addEventListener("input", updatePreview);
    customInput.addEventListener("input", updatePreview);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const horizonYears = resolveHorizonYears(horizonSelect.value, customInput.value);
      const err = validateProfileInput(dobInput.value, horizonYears);
      if (err) {
        errorEl.textContent = err;
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;

      profile = {
        name: nameInput.value.trim(),
        dob: dobInput.value,
        horizonMode: horizonSelect.value,
        horizonYears,
      };
      saveProfile(profile);
      enterApp();
    });
  }

  /* ----------------------------------------------------------
     THEME
  ---------------------------------------------------------- */
  function applyTheme(theme) {
    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    const label = $("theme-label");
    if (label) label.textContent = theme === "light" ? "Light" : "Dark";
    saveTheme(theme);
  }

  function toggleTheme() {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    applyTheme(isLight ? "dark" : "light");
  }

  /* ----------------------------------------------------------
     NAVIGATION
  ---------------------------------------------------------- */
  function showView(name) {
    currentView = name;
    document.querySelectorAll(".view").forEach((v) => {
      v.hidden = v.id !== `view-${name}`;
    });
    document.querySelectorAll(".nav-link").forEach((btn) => {
      const active = btn.dataset.view === name;
      btn.classList.toggle("is-active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    closeSidebar();
    renderCurrentView();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function openSidebar() {
    $("sidebar").classList.add("is-open");
    $("sidebar-overlay").hidden = false;
    $("menu-toggle").setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    $("sidebar").classList.remove("is-open");
    $("sidebar-overlay").hidden = true;
    $("menu-toggle").setAttribute("aria-expanded", "false");
  }

  /* ----------------------------------------------------------
     RENDER: Dashboard
  ---------------------------------------------------------- */
  function renderDashboard(life) {
    const greeting = $("dash-greeting");
    const hour = life.now.getHours();
    const timeOfDay = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    greeting.textContent = profile.name ? `${timeOfDay}, ${profile.name}.` : `${timeOfDay}.`;

    $("dash-age-years").textContent = life.age.years;
    $("dash-age-months").textContent = life.age.months;
    $("dash-age-days").textContent = life.age.days;
    $("dash-born-on").textContent = `Born ${formatDate(life.dob)}`;

    const percent = life.percentLived;
    $("dash-ring-percent").textContent = `${percent.toFixed(1)}%`;
    const circumference = 2 * Math.PI * 70;
    const offset = circumference * (1 - percent / 100);
    $("dash-ring-progress").style.strokeDashoffset = offset.toFixed(2);

    $("dash-horizon-years").textContent = profile.horizonYears;
    $("dash-horizon-date").textContent = formatDate(life.horizon);
    $("dash-days-lived").textContent = formatNumber(life.livedUnits.days);
    $("dash-days-remaining").textContent = formatNumber(life.remainingUnits.days);

    $("cd-days").textContent = formatNumber(life.remainingUnits.days);
    $("cd-hours").textContent = pad2(life.remainingUnits.hours);
    $("cd-minutes").textContent = pad2(life.remainingUnits.minutes);
    $("cd-seconds").textContent = pad2(life.remainingUnits.seconds);
    $("cd-total-seconds").textContent = formatNumber(life.remainingUnits.totalSeconds);

    $("stat-days-lived").textContent = formatNumber(life.livedUnits.days);
    $("stat-seconds-lived").textContent = formatNumber(life.livedUnits.totalSeconds);

    $("stat-year-percent").textContent = `${life.yearPercent.toFixed(1)}%`;
    $("stat-year-days-passed").textContent = formatNumber(life.daysPassedThisYear);
    $("stat-year-days-remaining").textContent = formatNumber(life.daysInYear - life.daysPassedThisYear);

    $("stat-today-percent").textContent = `${life.todayPercent.toFixed(1)}%`;
    $("stat-today-time").textContent = life.now.toLocaleTimeString();

    $("stat-birthday-days").textContent = formatNumber(life.daysUntilBirthday);
    $("stat-birthday-date").textContent = `Next birthday · ${formatDate(life.birthdayCandidate)}`;

    $("dash-progress-fill").style.width = `${Math.min(100, life.percentLived)}%`;
    $("dash-progress-percent").textContent = `${life.percentLived.toFixed(1)}% lived`;
    $("dash-progress-horizon").textContent = `${profile.horizonYears}-year horizon`;
    $("dash-progress-remaining").textContent = `${(100 - life.percentLived).toFixed(1)}% remaining`;
  }

  /* ----------------------------------------------------------
     RENDER: Life Clock
  ---------------------------------------------------------- */
  function renderClock(life) {
    $("clock-days").textContent = formatNumber(life.remainingUnits.days);
    $("clock-hours").textContent = pad2(life.remainingUnits.hours);
    $("clock-minutes").textContent = pad2(life.remainingUnits.minutes);
    $("clock-seconds").textContent = pad2(life.remainingUnits.seconds);
    $("clock-horizon-text").textContent = `Your ${profile.horizonYears}-year horizon ends ${formatDate(life.horizon)}.`;

    $("clock-seconds-lived").textContent = formatNumber(life.livedUnits.totalSeconds);
    $("clock-seconds-remaining").textContent = formatNumber(life.remainingUnits.totalSeconds);
    $("clock-total-horizon").textContent = `${profile.horizonYears} years`;
    $("clock-progress").textContent = `${life.percentLived.toFixed(2)}%`;
  }

  /* ----------------------------------------------------------
     RENDER: Timeline
  ---------------------------------------------------------- */
  function renderTimeline(life) {
    const track = $("timeline-track");
    const cardsWrap = $("timeline-cards");
    track.innerHTML = "";
    cardsWrap.innerHTML = "";

    const ageMarks = [0, 18, 21, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]
      .filter((a) => a <= profile.horizonYears);

    const points = ageMarks.map((age) => {
      const date = addYearsSafe(life.dob, age);
      return { label: age === 0 ? "Birth" : `Age ${age}`, date, age };
    });

    // Insert "Now" at its chronological position.
    const nowPoint = { label: "Now", date: dateOnly(life.now), isNow: true };
    const merged = [...points, nowPoint].sort((a, b) => a.date - b.date);

    merged.forEach((p) => {
      const el = document.createElement("div");
      el.className = "timeline__point" + (p.isNow ? " is-now" : "");
      el.innerHTML = `
        <div class="timeline__point-label">${p.label}</div>
        <div class="timeline__point-date">${formatDate(p.date)}</div>
      `;
      track.appendChild(el);
    });

    points.forEach((p) => {
      const isPast = p.date <= life.now;
      const card = document.createElement("div");
      card.className = "milestone-card";
      card.innerHTML = `
        <p class="milestone-card__title">${p.label}</p>
        <p class="milestone-card__date">${formatDate(p.date)} ${isPast ? "· passed" : "· ahead"}</p>
      `;
      cardsWrap.appendChild(card);
    });
  }

  /* ----------------------------------------------------------
     RENDER: Perspective
  ---------------------------------------------------------- */
  function statRow(label, value) {
    return `<div class="stat-list__row"><dt>${label}</dt><dd>${value}</dd></div>`;
  }

  function renderPerspective(life) {
    const horizonWeeks = Math.floor(life.totalHorizonUnits.days / 7);
    $("persp-horizon").innerHTML =
      statRow("Years", profile.horizonYears) +
      statRow("Months", formatNumber(life.totalCalendar.months)) +
      statRow("Weeks", formatNumber(horizonWeeks)) +
      statRow("Days", formatNumber(life.totalHorizonUnits.days)) +
      statRow("Hours", formatNumber(Math.floor(life.totalHorizonMs / 3600000))) +
      statRow("Minutes", formatNumber(Math.floor(life.totalHorizonMs / 60000))) +
      statRow("Seconds", formatNumber(Math.floor(life.totalHorizonMs / 1000)));

    const livedWeeks = Math.floor(life.livedUnits.days / 7);
    $("persp-lived").innerHTML =
      statRow("Calendar age", `${life.age.years}y ${life.age.months}m ${life.age.days}d`) +
      statRow("Months", formatNumber(life.livedCalendar.years * 12 + life.livedCalendar.months)) +
      statRow("Weeks", formatNumber(livedWeeks)) +
      statRow("Days", formatNumber(life.livedUnits.days)) +
      statRow("Hours", formatNumber(Math.floor(life.livedMs / 3600000))) +
      statRow("Minutes", formatNumber(Math.floor(life.livedMs / 60000))) +
      statRow("Seconds", formatNumber(life.livedUnits.totalSeconds));

    const remainingWeeks = Math.floor(life.remainingUnits.days / 7);
    $("persp-remaining").innerHTML =
      statRow("Months", formatNumber(life.remainingCalendar.years * 12 + life.remainingCalendar.months)) +
      statRow("Weeks", formatNumber(remainingWeeks)) +
      statRow("Days", formatNumber(life.remainingUnits.days)) +
      statRow("Hours", formatNumber(Math.floor(life.remainingMs / 3600000))) +
      statRow("Minutes", formatNumber(Math.floor(life.remainingMs / 60000))) +
      statRow("Seconds", formatNumber(life.remainingUnits.totalSeconds));

    $("year-bar-marker").style.left = `${(life.fraction * 100).toFixed(2)}%`;
    $("year-compress-date").textContent = formatMonthDay(life.compressedDate);
  }

  /* ----------------------------------------------------------
     RENDER: Goals
  ---------------------------------------------------------- */
  function renderGoals() {
    const goals = loadGoals();
    const list = $("goals-list");
    const empty = $("goals-empty");
    list.innerHTML = "";

    if (goals.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    goals.forEach((g) => {
      const card = document.createElement("article");
      card.className = "goal-card";
      const targetText = g.target ? `Target · ${formatDate(parseDateOnly(g.target))}` : "No target date";
      card.innerHTML = `
        <p class="goal-card__title">${escapeHtml(g.title)}</p>
        <div class="goal-card__progress-row"><span>Progress</span><span>${g.progress}%</span></div>
        <div class="goal-card__bar"><div class="goal-card__bar-fill" style="width:${g.progress}%"></div></div>
        <p class="goal-card__meta">${targetText}</p>
        <div class="card-actions">
          <button class="icon-btn" data-delete-goal="${g.id}" aria-label="Delete goal">🗑</button>
        </div>
      `;
      list.appendChild(card);
    });
  }

  /* ----------------------------------------------------------
     RENDER: Milestones
  ---------------------------------------------------------- */
  function renderMilestones(life) {
    const items = loadMilestones();
    const list = $("milestones-list");
    const empty = $("milestones-empty");
    list.innerHTML = "";

    if (items.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    items
      .slice()
      .sort((a, b) => parseDateOnly(a.date) - parseDateOnly(b.date))
      .forEach((m) => {
        const mDate = parseDateOnly(m.date);
        const isComplete = mDate <= life.now;
        const daysRemaining = Math.ceil((mDate - dateOnly(life.now)) / DAY_MS);
        const status = isComplete ? "COMPLETED" : `${formatNumber(daysRemaining)} DAYS REMAINING`;

        const card = document.createElement("article");
        card.className = "milestone-item-card";
        card.innerHTML = `
          <span class="milestone-item-card__status${isComplete ? " is-complete" : ""}">${status}</span>
          <p class="milestone-item-card__title">${escapeHtml(m.title)}</p>
          <p class="milestone-item-card__meta">${formatDate(mDate)}</p>
          ${m.description ? `<p class="milestone-item-card__desc">${escapeHtml(m.description)}</p>` : ""}
          <div class="card-actions">
            <button class="icon-btn" data-delete-milestone="${m.id}" aria-label="Delete milestone">🗑</button>
          </div>
        `;
        list.appendChild(card);
      });
  }

  /* ----------------------------------------------------------
     RENDER: Settings
  ---------------------------------------------------------- */
  function fillSettingsForm() {
    $("set-name").value = profile.name || "";
    $("set-dob").value = profile.dob;
    $("set-dob").max = new Date().toISOString().slice(0, 10);
    const isStandard = ["60", "70", "80", "90"].includes(String(profile.horizonYears));
    $("set-horizon").value = isStandard ? String(profile.horizonYears) : "custom";
    $("set-custom-field").hidden = isStandard;
    $("set-custom").value = isStandard ? "" : profile.horizonYears;
  }

  /* ----------------------------------------------------------
     Escaping
  ---------------------------------------------------------- */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ----------------------------------------------------------
     Central render dispatch
  ---------------------------------------------------------- */
  function renderCurrentView() {
    const life = getLifeData(profile, new Date());
    switch (currentView) {
      case "dashboard": renderDashboard(life); break;
      case "clock": renderClock(life); break;
      case "timeline": renderTimeline(life); break;
      case "perspective": renderPerspective(life); break;
      case "goals": renderGoals(); break;
      case "milestones": renderMilestones(life); break;
      case "settings": fillSettingsForm(); break;
    }
  }

  function tick() {
    if (!profile) return;
    if (currentView === "dashboard" || currentView === "clock") {
      renderCurrentView();
    }
  }

  /* ----------------------------------------------------------
     Modals
  ---------------------------------------------------------- */
  function openModal(id) {
    $("modal-overlay").hidden = false;
    document.querySelectorAll(".modal").forEach((m) => (m.hidden = m.id !== id));
  }
  function closeModal() {
    $("modal-overlay").hidden = true;
  }

  /* ----------------------------------------------------------
     Goal form / deletion
  ---------------------------------------------------------- */
  function initGoals() {
    $("add-goal-btn").addEventListener("click", () => {
      $("goal-form").reset();
      $("goal-progress-value").textContent = "0%";
      openModal("goal-modal");
    });

    $("goal-progress").addEventListener("input", (e) => {
      $("goal-progress-value").textContent = `${e.target.value}%`;
    });

    $("goal-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const title = $("goal-title").value.trim();
      if (!title) return;
      const goals = loadGoals();
      goals.push({
        id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title,
        progress: parseInt($("goal-progress").value, 10) || 0,
        target: $("goal-target").value || null,
      });
      saveGoals(goals);
      closeModal();
      renderGoals();
      showToast("Goal added.");
    });

    $("goals-list").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-delete-goal]");
      if (!btn) return;
      const id = btn.dataset.deleteGoal;
      const goals = loadGoals().filter((g) => g.id !== id);
      saveGoals(goals);
      renderGoals();
      showToast("Goal removed.");
    });
  }

  /* ----------------------------------------------------------
     Milestone form / deletion
  ---------------------------------------------------------- */
  function initMilestones() {
    $("add-milestone-btn").addEventListener("click", () => {
      $("milestone-form").reset();
      $("milestone-date").max = "";
      openModal("milestone-modal");
    });

    $("milestone-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const title = $("milestone-title").value.trim();
      const date = $("milestone-date").value;
      if (!title || !date) return;
      const items = loadMilestones();
      items.push({
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title,
        date,
        description: $("milestone-desc").value.trim(),
      });
      saveMilestones(items);
      closeModal();
      renderCurrentView();
      showToast("Milestone added.");
    });

    $("milestones-list").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-delete-milestone]");
      if (!btn) return;
      const id = btn.dataset.deleteMilestone;
      const items = loadMilestones().filter((m) => m.id !== id);
      saveMilestones(items);
      renderCurrentView();
      showToast("Milestone removed.");
    });
  }

  /* ----------------------------------------------------------
     Settings
  ---------------------------------------------------------- */
  function initSettings() {
    const horizonSelect = $("set-horizon");
    horizonSelect.addEventListener("change", () => {
      $("set-custom-field").hidden = horizonSelect.value !== "custom";
    });

    $("settings-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const dobStr = $("set-dob").value;
      const horizonYears = resolveHorizonYears(horizonSelect.value, $("set-custom").value);
      const err = validateProfileInput(dobStr, horizonYears);
      const errorEl = $("set-error");
      if (err) {
        errorEl.textContent = err;
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;

      profile = {
        name: $("set-name").value.trim(),
        dob: dobStr,
        horizonMode: horizonSelect.value,
        horizonYears,
      };
      saveProfile(profile);
      showToast("Profile updated.");
      showView("dashboard");
    });

    $("reset-btn").addEventListener("click", () => openModal("reset-modal"));
    $("reset-confirm-btn").addEventListener("click", () => {
      localStorage.removeItem(KEYS.profile);
      localStorage.removeItem(KEYS.goals);
      localStorage.removeItem(KEYS.milestones);
      closeModal();
      window.location.reload();
    });
  }

  /* ----------------------------------------------------------
     App bootstrap
  ---------------------------------------------------------- */
  function enterApp() {
    $("onboarding-screen").hidden = true;
    $("app").hidden = false;
    showView("dashboard");
  }

  function initNav() {
    document.querySelectorAll(".nav-link").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
    $("menu-toggle").addEventListener("click", openSidebar);
    $("sidebar-overlay").addEventListener("click", closeSidebar);
  }

  function initModals() {
    $("modal-overlay").addEventListener("click", (e) => {
      if (e.target === $("modal-overlay")) closeModal();
    });
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("modal-overlay").hidden) closeModal();
    });
  }

  function initTheme() {
    applyTheme(loadTheme());
    $("theme-toggle-desktop").addEventListener("click", toggleTheme);
    $("theme-toggle-mobile").addEventListener("click", toggleTheme);
  }

  function init() {
    initTheme();
    initOnboarding();
    initNav();
    initModals();
    initGoals();
    initMilestones();
    initSettings();

    profile = loadProfile();
    if (profile && profile.dob && profile.horizonYears) {
      enterApp();
    } else {
      $("onboarding-screen").hidden = false;
      $("app").hidden = true;
    }

    setInterval(tick, 1000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
