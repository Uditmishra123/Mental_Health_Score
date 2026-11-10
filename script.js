// Base URL of the FastAPI server (not the /docs page)
const API_BASE = "http://127.0.0.1:8000";
const TIMEOUT_MS = 15000;
const GAUGE_LENGTH = 251.33; // length of the semicircle path
const MAX_SCORE = 10;        // gauge scale; adjust if your model uses a different range

const form = document.getElementById("form");
const submitBtn = document.getElementById("submitBtn");
const states = {
  idle: document.getElementById("stateIdle"),
  loading: document.getElementById("stateLoading"),
  done: document.getElementById("stateDone"),
  error: document.getElementById("stateError"),
};

// Mirrors the Pydantic model: [field, type, min, max]
const NUMERIC = [
  ["Age", "int", 10, 100],
  ["Avg_Daily_Usage_Hours", "float", 0, 24],
  ["Daily_Unlocks", "int", 0, null],
  ["Study_Hours", "float", 0, null],
  ["Physical_Activity_Hours", "float", 0, null],
  ["Sleep_Hours_Per_Night", "float", 0, null],
];
const CHOICES = ["Gender", "Academic_Level", "Most_Used_Platform", "Purpose_Of_Use", "Stress_Level"];

function show(name) {
  Object.entries(states).forEach(([key, el]) => { el.hidden = key !== name; });
}

function setFieldError(name, message) {
  const slot = document.querySelector(`.err[data-for="${name}"]`);
  if (!slot) return false;
  slot.textContent = message;
  slot.closest(".field").classList.toggle("invalid", Boolean(message));
  return true;
}

function clearErrors() {
  document.querySelectorAll(".err").forEach((el) => setFieldError(el.dataset.for, ""));
}

// Client-side checks that match the backend rules
function validate(values) {
  let ok = true;
  const fail = (name, msg) => { setFieldError(name, msg); ok = false; };

  NUMERIC.forEach(([name, type, min, max]) => {
    const raw = values[name];
    if (raw === "" || raw === undefined) return fail(name, "This field is required.");
    const n = Number(raw);
    if (Number.isNaN(n)) return fail(name, "Enter a number.");
    if (type === "int" && !Number.isInteger(n)) return fail(name, "Enter a whole number.");
    if (min !== null && n < min) return fail(name, `Must be at least ${min}.`);
    if (max !== null && n > max) return fail(name, `Must be at most ${max}.`);
  });

  if (!values.Country.trim()) fail("Country", "This field is required.");
  CHOICES.forEach((name) => { if (!values[name]) fail(name, "Please choose an option."); });
  return ok;
}

function readForm() {
  const data = Object.fromEntries(new FormData(form).entries());
  CHOICES.forEach((name) => { data[name] = data[name] || ""; });
  data.Country = data.Country || "";
  return data;
}

function buildPayload(v) {
  const payload = { ...v, Country: v.Country.trim() };
  NUMERIC.forEach(([name, type]) => {
    payload[name] = type === "int" ? parseInt(v[name], 10) : parseFloat(v[name]);
  });
  return payload;
}

function showError(title, message) {
  document.getElementById("errorTitle").textContent = title;
  document.getElementById("errorMsg").textContent = message;
  show("error");
}

// FastAPI 422 -> show message under each field
function handleValidationError(detail) {
  const general = [];
  (Array.isArray(detail) ? detail : []).forEach((item) => {
    const field = item.loc && item.loc[item.loc.length - 1];
    if (!setFieldError(field, item.msg)) general.push(item.msg);
  });
  showError("Some inputs need fixing", general.length ? general.join(" ") : "Check the highlighted fields and try again.");
}

function bandFor(score) {
  const pct = score / MAX_SCORE;
  if (pct >= 0.75) return { label: "Healthy range", color: "var(--good)", note: "Habits point to good wellbeing." };
  if (pct >= 0.55) return { label: "Moderate", color: "var(--mid)", note: "Some habits may be worth adjusting." };
  return { label: "Needs attention", color: "var(--low)", note: "Consider support from a counsellor or doctor." };
}

function showResult(score) {
  const band = bandFor(score);
  const fill = document.getElementById("gaugeFill");
  document.getElementById("scoreBand").textContent = band.label;
  document.getElementById("scoreBand").style.color = band.color;
  document.getElementById("scoreNote").textContent = band.note + " This is a model estimate, not a diagnosis.";
  fill.style.stroke = band.color;
  fill.style.strokeDashoffset = GAUGE_LENGTH; // reset so animation replays
  show("done");

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const ratio = Math.min(Math.max(score / MAX_SCORE, 0), 1);
    fill.style.strokeDashoffset = GAUGE_LENGTH * (1 - ratio);
  }));

  // count-up animation for the number
  const el = document.getElementById("scoreValue");
  const start = performance.now();
  const duration = 1000;
  (function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = (score * (1 - Math.pow(1 - t, 3))).toFixed(1);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = score.toFixed(2);
  })(start);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const values = readForm();
  if (!validate(values)) {
    showError("Some inputs need fixing", "Check the highlighted fields and try again.");
    const first = document.querySelector(".invalid");
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  show("loading");
  submitBtn.disabled = true;
  submitBtn.textContent = "Predicting…";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(values)),
      signal: controller.signal,
    });

    let body = null;
    try { body = await res.json(); } catch (_) { /* non-JSON response */ }

    if (res.status === 422) return handleValidationError(body && body.detail);
    if (!res.ok) {
      const msg = body && typeof body.detail === "string" ? body.detail : "The server could not process this request.";
      return showError(`Server error (${res.status})`, msg);
    }
    if (!body || typeof body.predicted_score !== "number") {
      return showError("Unexpected response", "The server replied without a predicted_score.");
    }
    showResult(body.predicted_score);
  } catch (err) {
    if (err.name === "AbortError") {
      showError("Request timed out", "The server took too long to respond. Try again.");
    } else {
      showError("Can't reach the server", `Make sure the API is running at ${API_BASE} (uvicorn app:app --reload).`);
    }
  } finally {
    clearTimeout(timer);
    submitBtn.disabled = false;
    submitBtn.textContent = "Predict score";
  }
});

form.addEventListener("reset", () => {
  clearErrors();
  show("idle");
});

// Clear a field's error as soon as the person edits it
form.addEventListener("input", (event) => {
  if (event.target.name) setFieldError(event.target.name, "");
});
