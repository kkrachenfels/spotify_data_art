// Frontend for Spotify Top Tracks (rank-based). Keeps your Path2D + isPointInStroke spiral.

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "onclick") e.addEventListener("click", v);
    else e.setAttribute(k, v);
  });
  children.flat().forEach((c) => {
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  });
  return e;
}

const root =
  document.getElementById("app") ||
  (() => {
    const d = document.createElement("div");
    d.id = "app";
    document.body.appendChild(d);
    return d;
  })();

const header = el("h2", {}, "Spotify: Your Top Tracks");
const info = el(
  "p",
  {},
  'Click "Login with Spotify" to connect your account, then use the rank slider and "Update filter" button to refresh the spiral.'
);
const loginBtn = el(
  "button",
  { onclick: () => (window.location = "/login") },
  "Login with Spotify"
);
const logoutBtn = el(
  "button",
  { onclick: () => (window.location = "/logout") },
  "Logout"
);

const list = el("div", { id: "liked-list" });

// Rank-based UI (no dates)
const startLabel = el("span", { class: "date-value" }, "From rank: —");
const endLabel = el("span", { class: "date-value" }, "To rank: —");
const startRange = el("input", {
  type: "range",
  id: "start-range",
  min: 1,
  max: 1,
  value: 1,
  disabled: true,
});
const endRange = el("input", {
  type: "range",
  id: "end-range",
  min: 1,
  max: 1,
  value: 1,
  disabled: true,
});

const colorCache = new Map();
const DEFAULT_SWATCH_COLOR = "#555";
const applyRangeBtn = el(
  "button",
  { id: "apply-range", onclick: applyCurrentRange },
  "Update filter"
);
const MAX_TOP_TRACKS = 100;
const DEFAULT_SONG_DISPLAY_LIMIT = 10;
let songDisplayLimit = DEFAULT_SONG_DISPLAY_LIMIT;
const songCountInput = el("input", {
  type: "number",
  id: "song-count-input",
  min: 1,
  max: MAX_TOP_TRACKS,
  value: DEFAULT_SONG_DISPLAY_LIMIT,
  step: 1,
});
const songCountBtn = el(
  "button",
  { id: "set-song-count", onclick: applySongCount },
  "Set song count"
);

startRange.addEventListener("input", () => ensureRangeOrder(true));
endRange.addEventListener("input", () => ensureRangeOrder(false));
function ensureRangeOrder(isStart) {
  const s = Number(startRange.value);
  const e = Number(endRange.value);
  if (isStart && s > e) endRange.value = s;
  else if (!isStart && e < s) startRange.value = e;
}

const filterSection = el(
  "section",
  { id: "date-filter" },
  el("h3", {}, "Filter top tracks by rank"),
  el(
    "p",
    { class: "filter-hint" },
    `Choose a rank range, then click "Update filter" to load the top ${MAX_TOP_TRACKS} tracks for that window and re-draw.`
  ),
  el(
    "div",
    { class: "slider-control" },
    el("label", { for: "start-range" }, "From"),
    startLabel,
    startRange
  ),
  el(
    "div",
    { class: "slider-control" },
    el("label", { for: "end-range" }, "To"),
    endLabel,
    endRange
  ),
  el(
    "div",
    { class: "song-count-control" },
    el("label", { for: "song-count-input" }, "Songs to show"),
    songCountInput,
    songCountBtn
  ),
  applyRangeBtn
);
const rangeStatus = el(
  "p",
  { id: "range-status" },
  "Load top tracks to enable the rank filter."
);

const SPIRAL_SIZE = 420;
let spiralInstance = null;
let spiralSegments = [];
let spiralTooltip = null;
let spiralDrawingCtx = null; // used for isPointInStroke
let hoveredIndex = -1;
const BASE_STROKE = 36;

root.appendChild(header);
root.appendChild(info);
root.appendChild(loginBtn);
root.appendChild(logoutBtn);
root.appendChild(list);
root.insertBefore(filterSection, list);
root.insertBefore(rangeStatus, list);

function applyCurrentRange() {
  ensureRangeOrder(true);
  const lo = Math.min(Number(startRange.value), Number(endRange.value));
  const hi = Math.max(Number(startRange.value), Number(endRange.value));
  list.innerHTML = "Loading top tracks...";
  rangeStatus.textContent = "Fetching top tracks from Spotify...";
  fetch(`/top_tracks?start=${lo}&end=${hi}`, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      return response.json();
    })
    .then((data) => {
      const items = (data?.items || []);
      const shown = Math.min(items.length, songDisplayLimit);
      renderVinylScene(items.slice(0, shown));
      const total = items.length;
      rangeStatus.textContent = total
        ? `Showing ${shown} of ${total} tracks between ranks ${lo} and ${hi}.`
        : `No tracks found between ranks ${lo} and ${hi}.`;
      startLabel.textContent = `From rank: ${lo}`;
      endLabel.textContent = `To rank: ${hi}`;
    })
    .catch((err) => {
      list.innerHTML = "Failed to load top tracks: " + err;
      rangeStatus.textContent = err.message || "Unable to load top tracks.";
    });
}

function applySongCount() {
  const parsed = Number(songCountInput.value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    rangeStatus.textContent = "Please enter a positive number of songs.";
    return;
  }
  songDisplayLimit = Math.min(MAX_TOP_TRACKS, Math.round(parsed));
  songCountInput.value = songDisplayLimit;
  applyCurrentRange();
}

// ------------ SPIRAL (Path2D + hover) ------------
// ------------ VINYL DISPLAY ------------
const VINYL_CANVAS_SIZE = 520;
const VINYL_COUNT = 10;
const VINYL_OUTER_RADIUS = 58;
const VINYL_INNER_RADIUS = 26;
let vinylCanvas = null;
let vinylCtx = null;
let vinylAnimationId = null;
let vinylObjects = [];
let lastVinylTimestamp = null;

function renderVinylScene(tracks) {
  list.innerHTML = "";
  const container = el("div", { class: "vinyl-canvas-container" });
  container.style.position = "relative";
  container.style.width = `${VINYL_CANVAS_SIZE}px`;
  container.style.height = `${VINYL_CANVAS_SIZE}px`;
  container.style.margin = "16px auto";
  container.style.border = "1px solid #eee";
  container.style.borderRadius = "12px";
  container.style.backgroundColor = "#fff";
  list.appendChild(container);

  if (!tracks.length) {
    list.innerHTML = "No tracks in that rank range.";
    return;
  }

  const selected = tracks.slice(0, VINYL_COUNT);
  const colorPromises = selected.map((item) =>
    getProminentColor(item.album_image).then(
      (color) => color || DEFAULT_SWATCH_COLOR
    )
  );

  Promise.all(colorPromises).then((colors) => {
    initializeVinylScene(container, selected, colors);
  });
}

function initializeVinylScene(container, tracks, colors) {
  stopVinylAnimation();
  vinylObjects.length = 0;
  if (vinylCanvas) {
    container.removeChild(vinylCanvas);
    vinylCanvas = null;
    vinylCtx = null;
  }
  vinylCanvas = document.createElement("canvas");
  vinylCanvas.width = VINYL_CANVAS_SIZE;
  vinylCanvas.height = VINYL_CANVAS_SIZE;
  vinylCanvas.style.display = "block";
  vinylCanvas.style.position = "absolute";
  vinylCanvas.style.top = "0";
  vinylCanvas.style.left = "0";
  container.appendChild(vinylCanvas);
  vinylCtx = vinylCanvas.getContext("2d");

  const center = VINYL_CANVAS_SIZE / 2;
  const radius = center - VINYL_OUTER_RADIUS - 16;
  const count = tracks.length;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    const vinyl = new Vinyl(
      x,
      y,
      VINYL_OUTER_RADIUS,
      VINYL_INNER_RADIUS,
      colors[i] || DEFAULT_SWATCH_COLOR
    );
    vinyl.setAngularVelocity(0.6 + (i % 3) * 0.15);
    vinylObjects.push(vinyl);
  }

  lastVinylTimestamp = null;
  vinylAnimationId = requestAnimationFrame(animateVinyls);
}

function animateVinyls(timestamp) {
  if (!vinylCtx) return;
  if (!lastVinylTimestamp) lastVinylTimestamp = timestamp;
  const delta = (timestamp - lastVinylTimestamp) / 1000;
  lastVinylTimestamp = timestamp;
  vinylCtx.clearRect(0, 0, VINYL_CANVAS_SIZE, VINYL_CANVAS_SIZE);
  vinylObjects.forEach((vinyl) => {
    vinyl.update(delta);
    vinyl.draw(vinylCtx);
  });
  vinylAnimationId = requestAnimationFrame(animateVinyls);
}

function stopVinylAnimation() {
  if (vinylAnimationId) {
    cancelAnimationFrame(vinylAnimationId);
    vinylAnimationId = null;
  }
}

// ------------ COLOR UTILS ------------
function getProminentColor(imageUrl) {
  if (!imageUrl) return Promise.resolve(null);
  if (colorCache.has(imageUrl))
    return Promise.resolve(colorCache.get(imageUrl));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    const size = 32;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        colorCache.set(imageUrl, null);
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const pixels = [];
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 30) continue;
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }
      const dominant = findDominantColor(pixels);
      colorCache.set(imageUrl, dominant);
      resolve(dominant);
    };
    img.onerror = () => {
      colorCache.set(imageUrl, null);
      resolve(null);
    };
    img.src = imageUrl;
  });
}

function findDominantColor(pixels, k = 3, iterations = 6) {
  if (!pixels.length) return DEFAULT_SWATCH_COLOR;
  const centers = [];
  for (let i = 0; i < k; i++) centers.push(pixels[(i * 3) % pixels.length]);
  let lastBuckets = [];
  for (let it = 0; it < iterations; it++) {
    const buckets = Array.from({ length: k }, () => []);
    pixels.forEach((px) => {
      let bi = 0,
        bd = Infinity;
      centers.forEach((c, idx) => {
        const d =
          (px[0] - c[0]) ** 2 + (px[1] - c[1]) ** 2 + (px[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = idx;
        }
      });
      buckets[bi].push(px);
    });
    buckets.forEach((bucket, idx) => {
      if (!bucket.length) {
        centers[idx] = pixels[Math.floor(Math.random() * pixels.length)];
        return;
      }
      const sum = bucket.reduce(
        (a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]],
        [0, 0, 0]
      );
      centers[idx] = [
        Math.round(sum[0] / bucket.length),
        Math.round(sum[1] / bucket.length),
        Math.round(sum[2] / bucket.length),
      ];
    });
    lastBuckets = buckets;
  }
  let best = 0,
    center = centers[0];
  lastBuckets.forEach((b, i) => {
    if (b.length > best) {
      best = b.length;
      center = centers[i];
    }
  });
  return `rgb(${center[0]}, ${center[1]}, ${center[2]})`;
}

function resetRankControls() {
  startRange.min = 1;
  startRange.max = MAX_TOP_TRACKS;
  startRange.step = 1;
  endRange.min = 1;
  endRange.max = MAX_TOP_TRACKS;
  endRange.step = 1;
  startRange.value = 1;
  endRange.value = MAX_TOP_TRACKS;
  startRange.disabled = false;
  endRange.disabled = false;
  startLabel.textContent = "From rank: 1";
  endLabel.textContent = `To rank: ${MAX_TOP_TRACKS}`;
}

document.addEventListener("DOMContentLoaded", () => {
  resetRankControls();
  rangeStatus.textContent =
    'Rank range ready. Choose a window and click "Update filter".';
});
