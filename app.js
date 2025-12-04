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
  'Click "Login with Spotify" to connect your account, then pick a starting rank and click "Update filter" to refresh the vinyl display.'
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
const startRange = el("input", {
  type: "range",
  id: "start-range",
  min: 1,
  max: 1,
  value: 1,
  disabled: true,
});
const SONG_DISPLAY_LIMIT = 15;

const colorCache = new Map();
const DEFAULT_SWATCH_COLOR = "#555";
const applyRangeBtn = el(
  "button",
  { id: "apply-range", onclick: applyCurrentRange },
  "Update filter"
);
const MAX_TOP_TRACKS = 100;

startRange.addEventListener("input", () => {
  startLabel.textContent = `From rank: ${startRange.value}`;
});

const filterSection = el(
  "section",
  { id: "date-filter" },
  el("h3", {}, "Filter top tracks by rank"),
  el(
    "p",
    { class: "filter-hint" },
    `Pick the starting rank (up to ${MAX_TOP_TRACKS - SONG_DISPLAY_LIMIT + 1}), then press "Update filter" to fetch 10 tracks from there.`
  ),
  el(
    "div",
    { class: "slider-control" },
    el("label", { for: "start-range" }, "From"),
    startLabel,
    startRange
  ),
  applyRangeBtn
);
const rangeStatus = el(
  "p",
  { id: "range-status" },
  "Load top tracks to enable the rank filter."
);

root.appendChild(header);
root.appendChild(info);
root.appendChild(loginBtn);
root.appendChild(logoutBtn);
root.appendChild(list);
root.insertBefore(filterSection, list);
root.insertBefore(rangeStatus, list);

function applyCurrentRange() {
  const startRank = Number(startRange.value);
  const offsetRank = Math.max(1, Math.min(startRank, MAX_TOP_TRACKS - SONG_DISPLAY_LIMIT + 1));
  list.innerHTML = "Loading top tracks...";
  rangeStatus.textContent = "Fetching top tracks from Spotify...";
  fetch(`/top_tracks?offset=${offsetRank}`, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      return response.json();
    })
    .then((data) => {
      const items = (data?.items || []);
      const shown = Math.min(items.length, SONG_DISPLAY_LIMIT);
      renderVinylScene(items.slice(0, shown));
      const total = items.length;
      rangeStatus.textContent = total
        ? `Showing ${shown} tracks starting from rank ${offsetRank}.`
        : `No tracks found starting at rank ${offsetRank}.`;
      startLabel.textContent = `From rank: ${offsetRank}`;
    })
    .catch((err) => {
      list.innerHTML = "Failed to load top tracks: " + err;
      rangeStatus.textContent = err.message || "Unable to load top tracks.";
    });
}

// ------------ SPIRAL (Path2D + hover) ------------
// ------------ VINYL DISPLAY ------------
const VINYL_CANVAS_SIZE = 520;
const VINYL_COUNT = 15;
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
  initializeVinylScene(
    container,
    selected,
    selected.map(() => DEFAULT_SWATCH_COLOR)
  );

  const colorPromises = selected.map((item) =>
    getProminentColor(item.album_image).then(
      (color) => color || DEFAULT_SWATCH_COLOR
    )
  );

  Promise.all(colorPromises).then((colors) => {
    updateVinylColors(colors);
  });
}

function initializeVinylScene(container, tracks, colors) {
  stopVinylAnimation();
  vinylObjects.length = 0;
  if (vinylCanvas && vinylCanvas.parentNode === container) {
    container.removeChild(vinylCanvas);
  }
  vinylCanvas = null;
  vinylCtx = null;
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

function updateVinylColors(colors) {
  if (!vinylObjects.length) return;
  colors.forEach((color, index) => {
    if (vinylObjects[index]) {
      vinylObjects[index].labelColor = color;
    }
  });
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
  const maxStart = MAX_TOP_TRACKS - SONG_DISPLAY_LIMIT + 1;
  startRange.max = Math.max(maxStart, 1);
  startRange.step = 1;
  startRange.value = 1;
  startRange.disabled = false;
  startLabel.textContent = "From rank: 1";
}

document.addEventListener("DOMContentLoaded", () => {
  resetRankControls();
  rangeStatus.textContent =
    'Rank range ready. Choose a window and click "Update filter".';
});
