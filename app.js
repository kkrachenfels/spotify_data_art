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
  {
    class: "compact-button auth-button",
    onclick: () => (window.location = "/login"),
  },
  "Login with Spotify"
);
const logoutBtn = el(
  "button",
  {
    class: "compact-button auth-button",
    onclick: () => (window.location = "/logout"),
  },
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
  { id: "apply-range", class: "compact-button", onclick: applyCurrentRange },
  "Update filter"
);
const MAX_TOP_TRACKS = 100;
const FRUIT_CANVAS_WIDTH = 280;
const FRUIT_CANVAS_HEIGHT = 360;
const FRUIT_SPAWN_INTERVAL = 2000;
const FRUIT_ASSETS = {
  apple: "assets/caterpillar_apple.png",
  pear: "assets/caterpillar_pear.png",
  orange: "assets/caterpillar_orange.png",
  grape: "assets/caterpillar_grape.png",
  strawberry: "assets/caterpillar_strawberry.png",
};
const fruitImageMap = {};
Object.entries(FRUIT_ASSETS).forEach(([name, src]) => {
  const img = new Image();
  img.src = src;
  fruitImageMap[name] = img;
});
const FRUIT_IMAGE_VALUES = Object.values(fruitImageMap);

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
    `Pick the starting rank (up to ${
      MAX_TOP_TRACKS - SONG_DISPLAY_LIMIT + 1
    }), then press "Update filter" to fetch 10 tracks from there.`
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
let vinylMouse = { x: -9999, y: -9999 };
const controlColumn = el(
  "div",
  { class: "control-column" },
  filterSection,
  rangeStatus
);
const fruitCanvas = document.createElement("canvas");
fruitCanvas.width = FRUIT_CANVAS_WIDTH;
fruitCanvas.height = FRUIT_CANVAS_HEIGHT;
const fruitCtx = fruitCanvas.getContext("2d");
const fruitCaption = el(
  "p",
  { class: "fruit-caption" },
  "Load top tracks to start the fruit preview."
);
const fruitPanel = el(
  "div",
  { class: "fruit-panel" },
  el("p", { class: "panel-title" }, "Song fruit preview"),
  fruitCanvas,
  fruitCaption
);
const vinylPanel = el("div", { class: "vinyl-panel" }, list);
const visualColumn = el(
  "div",
  { class: "visual-column" },
  fruitPanel,
  vinylPanel
);
const contentLayout = el(
  "div",
  { class: "content-layout" },
  controlColumn,
  visualColumn
);
let fruitQueue = [];
let fruitSpawnIndex = 0;
let fruitIntervalId = null;
let fruitObjects = [];
let fruitAnimationId = null;
let lastFruitTimestamp = null;

root.appendChild(header);
root.appendChild(info);
root.appendChild(loginBtn);
root.appendChild(logoutBtn);
root.appendChild(contentLayout);

function applyCurrentRange() {
  const startRank = Number(startRange.value);
  const offsetRank = Math.max(
    1,
    Math.min(startRank, MAX_TOP_TRACKS - SONG_DISPLAY_LIMIT + 1)
  );
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
      const items = data?.items || [];
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
const VINYL_CANVAS_SIZE = 970;
const VINYL_COUNT = 15;
const VINYL_OUTER_RADIUS = 72;
const VINYL_INNER_RADIUS = 32;
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
  container.style.margin = "16px 0 16px 0";
  container.style.alignSelf = "flex-start";
  container.style.paddingLeft = "16px";
  container.style.width = `${VINYL_CANVAS_SIZE + 40}px`;
  container.style.border = "1px solid #eee";
  container.style.borderRadius = "12px";
  container.style.backgroundColor = "#fff";
  list.appendChild(container);

  if (!tracks.length) {
    list.innerHTML = "No tracks in that rank range.";
    stopFruitSequence();
    return;
  }

  const selected = tracks.slice(0, VINYL_COUNT);
  resetFruitSequence(selected);
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
function getArtistNamesSafe(t) {
  const a = t?.artists;

  // Array of objects or strings
  if (Array.isArray(a)) {
    return a
      .map((x) => (x && typeof x === "object" ? x.name ?? "" : x ?? ""))
      .filter(Boolean)
      .join(", ");
  }

  if (a && typeof a === "string") {
    return a;
  }

  // Single object with name
  if (a && typeof a === "object" && typeof a.name === "string") {
    return a.name;
  }

  // Common alternate fields some APIs use
  return (
    t?.artist ||
    t?.artists ||
    t?.primary_artist ||
    t?.artists_name ||
    t?.owner ||
    ""
  );
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
  // map DOM mouse coords → canvas pixel coords (handles CSS scaling)
  function onMove(e) {
    const rect = vinylCanvas.getBoundingClientRect();
    const scaleX = vinylCanvas.width / rect.width;
    const scaleY = vinylCanvas.height / rect.height;
    vinylMouse.x = (e.clientX - rect.left) * scaleX;
    vinylMouse.y = (e.clientY - rect.top) * scaleY;
  }
  function onLeave() {
    vinylMouse.x = -9999;
    vinylMouse.y = -9999;
    vinylCanvas.style.cursor = "default";
  }

  vinylCanvas.addEventListener("mousemove", onMove);
  vinylCanvas.addEventListener("mouseleave", onLeave);
  const center = VINYL_CANVAS_SIZE / 2;
  const count = tracks.length;
  const padding = VINYL_OUTER_RADIUS + 20;
  const availableWidth = VINYL_CANVAS_SIZE - 2 * padding;
  const spreading = availableWidth / Math.max(count - 1, 1);
  const targetDist = VINYL_OUTER_RADIUS * 2.4;
  const baseSpacing = Math.max(spreading, VINYL_OUTER_RADIUS * 2.4);
  const spacingX = Math.min(baseSpacing, targetDist * 0.75);
  const frequency = (Math.PI * 1) / Math.max(count * 2, 1);
  const sinHalf = Math.sin(frequency / 2) || 1;
  const maxVerticalDiff = Math.sqrt(
    Math.max(targetDist * targetDist - spacingX * spacingX, 0)
  );
  const baseAmplitude = (maxVerticalDiff / (2 * sinHalf || 1)) * 1.2;
  let amplitude = Math.min(
    Math.max(baseAmplitude * 1, VINYL_OUTER_RADIUS * 1),
    VINYL_CANVAS_SIZE / 2 - VINYL_OUTER_RADIUS
  );

  let wavePath = buildSineArc(
    VINYL_CANVAS_SIZE,
    spacingX,
    amplitude,
    VINYL_OUTER_RADIUS
  );
  const requiredLength = (count - 1) * targetDist;
  if (wavePath.totalLength < requiredLength) {
    amplitude =
      (amplitude * requiredLength) / Math.max(wavePath.totalLength, 1);
    wavePath = buildSineArc(
      VINYL_CANVAS_SIZE,
      spacingX,
      amplitude,
      VINYL_OUTER_RADIUS
    );
  }
  for (let i = 0; i < count; i += 1) {
    const pathPoint = sampleSineArc(wavePath, i * targetDist);
    const vinyl = new Vinyl(
      pathPoint.x,
      pathPoint.y,
      VINYL_OUTER_RADIUS,
      VINYL_INNER_RADIUS,
      colors[i] || DEFAULT_SWATCH_COLOR
    );
    const rankStr = tracks[i].rank ? `#${tracks[i].rank} ` : "";
    const title = `${rankStr}${tracks[i].name || ""}`;
    const artist = getArtistNamesSafe(tracks[i]);
    const rawAlbum = tracks[i]?.album;
    const album =
      typeof rawAlbum === "string"
        ? rawAlbum
        : rawAlbum?.name || tracks[i]?.album_name || "";

    // If you don’t actually have BPM/tempo yet, keep it null
    // (your code was using popularity for speed earlier — leave that if you want)
    const bpm =
      (typeof tracks[i].bpm === "number" ? tracks[i].bpm : null) ??
      (typeof tracks[i].tempo === "number" ? tracks[i].tempo : null) ??
      null;

    const derivedBpm = Math.max(
      70,
      Math.round((tracks[i]?.popularity ?? 60) * 1.25 + 5)
    );

    // Set meta → title/artist/BPM (BPM also drives spin inside Vinyl)
    vinyl.setTrackMeta({
      title,
      artist,
      album,
      bpm,
      spinsPerBeat: 0.05,
      hoverBpm: bpm ?? derivedBpm,
    });

    // Fallback angular speed if no BPM present
    if (bpm == null) {
      vinyl.setAngularVelocity(0.6 + (i % 3) * 0.15);
    }
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

  let anyHover = false;

  vinylObjects.forEach((vinyl) => {
    // tell each vinyl whether we're hovering it
    if (vinyl.updateHover(vinylMouse.x, vinylMouse.y)) anyHover = true;

    vinyl.update(delta);
    vinyl.draw(vinylCtx);
  });

  vinylCtx.canvas.style.cursor = anyHover ? "pointer" : "default";

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

function buildSineArc(canvasSize, spacingX, amplitude, radius) {
  const padding = radius + 20;
  const width = canvasSize - 2 * padding;
  const phaseShift = -Math.PI / 2;
  const bottomY = canvasSize - padding - radius - 4;
  const topBound = padding + radius + 4;
  const verticalSpan = Math.max(bottomY - topBound, 0);
  const effectiveAmplitude = Math.min(
    Math.max(amplitude, 0),
    verticalSpan / 2
  );
  const steps = 600;
  const points = [];
  let totalLength = 0;
  let prevPoint = null;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const x = padding + u * width;
    // Start the wave at the bottom of the canvas and move upward from there.
    const y =
      bottomY -
      effectiveAmplitude * (1 + Math.sin(phaseShift + u * Math.PI * 2));
    const point = { x, y, length: totalLength };
    if (prevPoint) {
      const dx = x - prevPoint.x;
      const dy = y - prevPoint.y;
      totalLength += Math.sqrt(dx * dx + dy * dy);
      point.length = totalLength;
    }
    points.push(point);
    prevPoint = point;
  }
  return { points, totalLength };
}

function sampleSineArc(path, targetLength) {
  const { points } = path;
  if (!points.length) {
    return { x: 0, y: 0 };
  }
  const total = path.totalLength;
  const clamped = Math.max(0, Math.min(targetLength, total));
  if (clamped === 0) return { x: points[0].x, y: points[0].y };
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (curr.length >= clamped) {
      const segment = curr.length - prev.length;
      const ratio = segment === 0 ? 0 : (clamped - prev.length) / segment;
      return {
        x: prev.x + (curr.x - prev.x) * ratio,
        y: prev.y + (curr.y - prev.y) * ratio,
      };
    }
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
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

// ------------ FRUIT PREVIEW CANVAS ------------
function pickRandomFruitImage() {
  if (!FRUIT_IMAGE_VALUES.length) return null;
  const index = Math.floor(Math.random() * FRUIT_IMAGE_VALUES.length);
  return FRUIT_IMAGE_VALUES[index];
}

function resetFruitSequence(tracks) {
  stopFruitInterval();
  fruitQueue = tracks.slice(0, Math.min(tracks.length, VINYL_COUNT));
  fruitSpawnIndex = 0;
  fruitObjects.length = 0;
  if (!fruitQueue.length) {
    fruitCaption.textContent = "No tracks to preview.";
    if (fruitCtx)
      fruitCtx.clearRect(0, 0, FRUIT_CANVAS_WIDTH, FRUIT_CANVAS_HEIGHT);
    return;
  }
  spawnNextFruit();
  if (fruitQueue.length > 1) {
    fruitIntervalId = setInterval(() => {
      spawnNextFruit();
    }, FRUIT_SPAWN_INTERVAL);
  }
}

function stopFruitSequence() {
  stopFruitInterval();
  fruitObjects.length = 0;
  if (fruitCtx)
    fruitCtx.clearRect(0, 0, FRUIT_CANVAS_WIDTH, FRUIT_CANVAS_HEIGHT);
  fruitCaption.textContent = "No tracks to preview.";
}

function spawnNextFruit() {
  if (fruitSpawnIndex >= fruitQueue.length) {
    stopFruitInterval();
    return;
  }
  const track = fruitQueue[fruitSpawnIndex];
  const image = pickRandomFruitImage();
  const fruit = new Fruit(
    FRUIT_CANVAS_WIDTH / 2,
    FRUIT_CANVAS_HEIGHT / 2,
    image,
    120 + Math.random() * 60
  );
  const popularity = track.popularity ?? 75;
  const bpm = Math.max(70, Math.min(200, Math.round(popularity * 1.8)));
  fruit.setTrackInfo(
    `${track.rank ? `#${track.rank} ` : ""}${track.name}`,
    bpm
  );
  fruit.setPulseStyle(
    0.92,
    1.08,
    (fruitSpawnIndex / Math.max(fruitQueue.length, 1)) * Math.PI
  );
  fruitObjects.splice(0, fruitObjects.length, fruit);
  fruitCaption.textContent = `${track.rank ? `#${track.rank} ` : ""}${
    track.name
  }`;
  fruitSpawnIndex += 1;
  if (fruitSpawnIndex >= fruitQueue.length) {
    stopFruitInterval();
  }
}

function stopFruitInterval() {
  if (fruitIntervalId) {
    clearInterval(fruitIntervalId);
    fruitIntervalId = null;
  }
}

function animateFruits(timestamp) {
  if (!fruitCtx) return;
  if (!lastFruitTimestamp) lastFruitTimestamp = timestamp;
  const delta = (timestamp - lastFruitTimestamp) / 1000;
  lastFruitTimestamp = timestamp;
  fruitCtx.clearRect(0, 0, FRUIT_CANVAS_WIDTH, FRUIT_CANVAS_HEIGHT);
  fruitObjects.forEach((fruit) => {
    fruit.update(delta);
    fruit.draw(fruitCtx);
  });
  fruitAnimationId = requestAnimationFrame(animateFruits);
}

function startFruitAnimation() {
  if (fruitAnimationId) return;
  fruitAnimationId = requestAnimationFrame(animateFruits);
}

function stopFruitAnimation() {
  if (fruitAnimationId) {
    cancelAnimationFrame(fruitAnimationId);
    fruitAnimationId = null;
  }
  lastFruitTimestamp = null;
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
  startFruitAnimation();
});
