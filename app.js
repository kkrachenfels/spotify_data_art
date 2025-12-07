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
  '"Login with Spotify" to connect your account, then select and "Update filter" to refresh the display.'
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
// ------------ VINYL DISPLAY ------------
const VINYL_CANVAS_WIDTH = 1360;
const VINYL_CANVAS_HEIGHT = 760;
const VINYL_CANVAS_LEFT_PADDING = 150;
const VINYL_COUNT = 15;
const VINYL_OUTER_RADIUS = 68;
const VINYL_INNER_RADIUS = 32;
let vinylCanvas = null;
let vinylCtx = null;
let vinylAnimationId = null;
let vinylObjects = [];
let vinylDrawOrder = [];
let pendingVinylEntries = [];
let lastVinylTimestamp = null;

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
const FRUIT_MOVE_TIME = 2;
const FRUIT_MOVE_MARGIN = 24;
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

const WAVE_COLOR_LIMIT = 10;
const WAVE_OPACITY = 0.7;
const WAVE_SPEED_DEFAULT = 0.2;

let waveCanvas = null;
let waveCtx = null;
let waveBackgroundColors = [];
let waveAnimationId = null;
let wavePhase = 0;
let waveLastWaveTimestamp = null;
let waveSpeed = WAVE_SPEED_DEFAULT;

const CATERPILLAR_MARGIN = 12;

const CATERPILLAR_HEAD_SRC = "assets/caterpillar_head.png";
const CATERPILLAR_BUTT_SRC = "assets/caterpillar_butt.png";
const CATERPILLAR_HEAD_SIZE = {
  width: VINYL_OUTER_RADIUS * 2.5,
  height: VINYL_OUTER_RADIUS * 2.5,
};
const CATERPILLAR_BUTT_SIZE = {
  width: VINYL_OUTER_RADIUS * 2.5,
  height: VINYL_OUTER_RADIUS * 2.5,
};
const SPRITE_EDGE_MARGIN = 12;
const CATERPILLAR_CANVAS_MARGIN = VINYL_OUTER_RADIUS;
const WAVE_START_OFFSET = FRUIT_CANVAS_WIDTH / 3; // + CATERPILLAR_CANVAS_MARGIN;

class CaterpillarSprite {
  constructor(src, width, height) {
    this.image = new Image();
    this.image.src = src;
    this.width = width;
    this.height = height;
    this.ready = false;
    this.position = null;
    this.image.crossOrigin = "Anonymous";
    this.image.onload = () => {
      this.ready = true;
    };
    this.image.onerror = () => {
      this.ready = false;
    };
  }

  setPosition(point) {
    this.position = point;
  }

  draw(ctx) {
    if (!this.ready || !this.position) return;
    const { x, y } = this.position;
    ctx.drawImage(
      this.image,
      x - this.width / 2,
      y - this.height / 2,
      this.width,
      this.height
    );
  }
}

const caterpillarSprites = {
  head: new CaterpillarSprite(
    CATERPILLAR_HEAD_SRC,
    CATERPILLAR_HEAD_SIZE.width,
    CATERPILLAR_HEAD_SIZE.height
  ),
  butt: new CaterpillarSprite(
    CATERPILLAR_BUTT_SRC,
    CATERPILLAR_BUTT_SIZE.width,
    CATERPILLAR_BUTT_SIZE.height
  ),
};

startRange.addEventListener("input", () => {
  startLabel.textContent = `From rank: ${startRange.value}`;
});

// --- TIME RANGE STATE + BUTTONS ---

// pick your default: "short_term" | "medium_term" | "long_term"
let currentTimeRange = "long_term";

function setTimeRange(range) {
  currentTimeRange = range;

  // Update button active state
  document.querySelectorAll(".time-range-button").forEach((btn) => {
    const r = btn.getAttribute("data-range");
    btn.classList.toggle("active", r === range);
  });

  // Re-fetch using current slider + new time window
  applyCurrentRange();
}

const timeRangeControls = el(
  "div",
  { class: "time-range-controls" },
  el("span", { class: "time-range-label" }, "Time window: "),
  el(
    "button",
    {
      class: "compact-button time-range-button",
      "data-range": "short_term",
      onclick: () => setTimeRange("short_term"),
    },
    "1 month"
  ),
  el(
    "button",
    {
      class: "compact-button time-range-button",
      "data-range": "medium_term",
      onclick: () => setTimeRange("medium_term"),
    },
    "6 months"
  ),
  el(
    "button",
    {
      class: "compact-button time-range-button active",
      "data-range": "long_term",
      onclick: () => setTimeRange("long_term"),
    },
    "1 year"
  ),
  el(
    "button",
    {
      class: "compact-button time-range-button",
      "data-range": "long_term",
      onclick: () => setTimeRange("long_term"),
    },
    "All time"
  )
);

// --- FILTER SECTION (now can safely use timeRangeControls) ---

const filterSection = el(
  "section",
  { id: "date-filter" },
  el("h3", {}, "Filter top tracks"),
  timeRangeControls,
  el(
    "p",
    { class: "filter-hint" },
    `Pick a time window and starting rank (up to ${
      MAX_TOP_TRACKS - SONG_DISPLAY_LIMIT + 1
    }), then press "Update filter" to fetch tracks from there.`
  ),
  el(
    "div",
    { class: "slider-control" },
    el("label", { for: "start-range" }, "From rank"),
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
const controlsColumn = el(
  "div",
  { class: "control-column" },
  filterSection,
  rangeStatus
);
const fruitCanvas = document.createElement("canvas");
fruitCanvas.width = FRUIT_CANVAS_WIDTH;
fruitCanvas.height = FRUIT_CANVAS_HEIGHT;
const fruitCtx = fruitCanvas.getContext("2d");
const fruitOverlay = el("div", { class: "fruit-overlay" }, fruitCanvas);
const vinylPanel = el("div", { class: "vinyl-panel" }, fruitOverlay, list);
const visualColumn = el("div", { class: "visual-column" }, vinylPanel);
const contentLayout = el(
  "div",
  { class: "content-layout" },
  controlsColumn,
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

  fetch(
    `/top_tracks?offset=${offsetRank}&time_range=${encodeURIComponent(
      currentTimeRange
    )}`,
    { cache: "no-store" }
  )
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

function renderVinylScene(tracks) {
  list.innerHTML = "";
  clearCaterpillarSprites();
  const container = el("div", { class: "vinyl-canvas-container" });
  container.style.position = "relative";
  container.style.width = `${VINYL_CANVAS_WIDTH + 40}px`;
  container.style.height = `${VINYL_CANVAS_HEIGHT}px`;
  container.style.margin = "16px 0 16px 0";
  container.style.alignSelf = "flex-start";
  container.style.paddingLeft = "16px";
  container.style.border = "none";
  container.style.borderRadius = "12px";
  container.style.backgroundColor = "#fff";
  list.appendChild(container);

  if (!tracks.length) {
    list.innerHTML = "No tracks in that rank range.";
    stopFruitSequence();
    stopWaveBackgroundAnimation();
    return;
  }

  const selected = tracks.slice(0, VINYL_COUNT);
  updateWaveSpeedFromTracks(selected);
  setupWaveBackground(container);
  updateWavePalette([]);

  const initialColorSets = selected.map(() => [
    DEFAULT_SWATCH_COLOR,
    DEFAULT_SWATCH_COLOR,
  ]);
  const layout = buildVinylLayout(selected, initialColorSets);
  initializeVinylScene(container, layout);

  resetFruitSequence(selected);

  const colorPromises = selected.map((item) =>
    getProminentColor(item.album_image).then(
      (color) => color || DEFAULT_SWATCH_COLOR
    )
  );

  Promise.all(colorPromises).then((colors) => {
    updateVinylColors(colors);
    updateWavePalette(colors);
  });
}
function setupWaveBackground(container) {
  stopWaveBackgroundAnimation();
  if (waveCanvas && waveCanvas.parentNode) {
    waveCanvas.parentNode.removeChild(waveCanvas);
  }
  waveCanvas = document.createElement("canvas");
  waveCanvas.width = VINYL_CANVAS_WIDTH;
  waveCanvas.height = VINYL_CANVAS_HEIGHT;
  waveCanvas.style.display = "block";
  waveCanvas.style.position = "absolute";
  waveCanvas.style.top = "0";
  waveCanvas.style.left = "0";
  waveCanvas.style.right = "0";
  waveCanvas.style.zIndex = "0";
  waveCanvas.style.pointerEvents = "none";
  waveCanvas.style.width = "100%";
  waveCanvas.style.height = `${VINYL_CANVAS_HEIGHT}px`;
  container.appendChild(waveCanvas);
  const containerWidth =
    container.clientWidth ||
    container.offsetWidth ||
    Math.ceil(container.getBoundingClientRect().width) ||
    VINYL_CANVAS_WIDTH;
  const computedWidth = Math.max(
    VINYL_CANVAS_WIDTH,
    containerWidth,
    container.scrollWidth || 0
  );
  waveCanvas.width = computedWidth;
  waveCanvas.height = VINYL_CANVAS_HEIGHT;
  waveCtx = waveCanvas.getContext("2d");
  waveBackgroundColors = [];
  wavePhase = 0;
  waveLastWaveTimestamp = null;
}

function updateWavePalette(colorSets) {
  if (!waveCtx) return;
  const palette = (colorSets || [])
    .map((set) => {
      if (typeof set === "string") return set;
      if (Array.isArray(set) && set.length) return set[0];
      return DEFAULT_SWATCH_COLOR;
    })
    .slice(0, WAVE_COLOR_LIMIT);
  waveBackgroundColors = palette.length
    ? palette
    : [DEFAULT_SWATCH_COLOR];
  startWaveBackgroundAnimation();
}

function getTrackBpmEstimate(track) {
  const bpm =
    typeof track?.bpm === "number"
      ? track.bpm
      : typeof track?.tempo === "number"
      ? track.tempo
      : null;
  if (bpm != null) return bpm;
  const popularity = track?.popularity ?? 60;
  return Math.max(70, Math.round(popularity * 1.25 + 5));
}

function updateWaveSpeedFromTracks(tracks) {
  if (!tracks?.length) {
    waveSpeed = WAVE_SPEED_DEFAULT;
    return;
  }
  const bpms = tracks.map(getTrackBpmEstimate);
  const avgBpm = bpms.reduce((sum, val) => sum + val, 0) / bpms.length;
  const normalized = avgBpm / 120;
  waveSpeed = Math.max(0.08, Math.min(0.5, normalized * WAVE_SPEED_DEFAULT));
}

function startWaveBackgroundAnimation() {
  if (!waveCtx || !waveBackgroundColors.length || waveAnimationId) return;
  waveAnimationId = requestAnimationFrame(animateWaveBackground);
}

function animateWaveBackground(timestamp) {
  if (!waveCtx || !waveCanvas) return;
  if (!waveBackgroundColors.length) {
    waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    waveAnimationId = requestAnimationFrame(animateWaveBackground);
    return;
  }
  if (!waveLastWaveTimestamp) waveLastWaveTimestamp = timestamp;
  const delta = (timestamp - waveLastWaveTimestamp) / 1000;
  waveLastWaveTimestamp = timestamp;
  wavePhase = (wavePhase + waveSpeed * delta) % (Math.PI * 4);
  const { width, height } = waveCanvas;
  waveCtx.clearRect(0, 0, width, height);
  waveCtx.globalAlpha = WAVE_OPACITY;
  const prevComposite = waveCtx.globalCompositeOperation;
  waveCtx.globalCompositeOperation = "destination-over";
  const spacing = height / (waveBackgroundColors.length + 1);
  waveBackgroundColors.forEach((color, idx) => {
    const amplitude = 24 + idx * 4;
    const centerOffset =
      spacing * (idx + 1) + Math.sin(wavePhase * 0.8 + idx) * 12;
    const freqFactor = 1 + idx * 0.15;
    const phaseShift = wavePhase * (0.4 + idx * 0.2);
    waveCtx.fillStyle = color;
    waveCtx.beginPath();
    waveCtx.moveTo(0, 0);
    for (let x = 0; x <= width; x += 16) {
      const normalized = (x / width) * Math.PI * 2 * freqFactor;
      const y =
        centerOffset +
        Math.sin(normalized + phaseShift) * amplitude * (1 + idx * 0.05);
      waveCtx.lineTo(x, y);
    }
    waveCtx.lineTo(width, 0);
    waveCtx.closePath();
    waveCtx.fill();
  });
  waveCtx.globalCompositeOperation = prevComposite;
  waveCtx.globalAlpha = 1;
  waveAnimationId = requestAnimationFrame(animateWaveBackground);
}

function stopWaveBackgroundAnimation() {
  if (waveAnimationId) {
    cancelAnimationFrame(waveAnimationId);
    waveAnimationId = null;
  }
  waveLastWaveTimestamp = null;
  waveBackgroundColors = [];
  wavePhase = 0;
  waveSpeed = WAVE_SPEED_DEFAULT;
  if (waveCtx && waveCanvas) {
    waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
  }
}

function normalizeColorSet(set) {
  if (Array.isArray(set) && set.length) {
    const first = set[0] || DEFAULT_SWATCH_COLOR;
    const second = set[1] || first;
    return [first, second];
  }
  if (typeof set === "string" && set) {
    return [set, set];
  }
  return [DEFAULT_SWATCH_COLOR, DEFAULT_SWATCH_COLOR];
}

function buildVinylLayout(tracks, colorSets = []) {
  const count = tracks.length;
  const padding = VINYL_OUTER_RADIUS + 20;
  const availableWidth = VINYL_CANVAS_WIDTH - 2 * padding;
  const spreading = availableWidth / Math.max(count - 1, 1);
  const targetDist = VINYL_OUTER_RADIUS * 2.1;
  const baseSpacing = Math.max(spreading, VINYL_OUTER_RADIUS * 2.4);
  const spacingX = Math.min(baseSpacing, targetDist * 0.75);
  const frequency = (Math.PI * 1) / Math.max(count * 10, 1);
  const sinHalf = Math.sin(frequency / 2) || 1;
  const maxVerticalDiff = Math.sqrt(
    Math.max(targetDist * targetDist - spacingX * spacingX, 0)
  );
  const baseAmplitude = (maxVerticalDiff / (2 * sinHalf || 1)) * 0.4;
  let amplitude = Math.min(
    Math.max(baseAmplitude * 1, VINYL_OUTER_RADIUS * 1),
    VINYL_CANVAS_HEIGHT / 2 - VINYL_OUTER_RADIUS
  );

  let wavePath = buildSineArc(
    VINYL_CANVAS_WIDTH,
    VINYL_CANVAS_HEIGHT,
    spacingX,
    amplitude,
    VINYL_OUTER_RADIUS
  );
  const requiredLength = (count - 1) * targetDist;
  if (wavePath.totalLength < requiredLength) {
    amplitude =
      (amplitude * requiredLength) / Math.max(wavePath.totalLength, 1);
    wavePath = buildSineArc(
      VINYL_CANVAS_WIDTH,
      VINYL_CANVAS_HEIGHT,
      spacingX,
      amplitude,
      VINYL_OUTER_RADIUS
    );
  }

  const normalizedColorSets = tracks.map((_, idx) =>
    normalizeColorSet(colorSets[idx])
  );

  const layoutSequence = [];
  layoutSequence.push({
    kind: "head",
    length: -(targetDist * 0.8),
    clampMargin:
      CATERPILLAR_CANVAS_MARGIN + CATERPILLAR_HEAD_SIZE.width / 2 + 8,
  });

  tracks.forEach((track, idx) => {
    const colors = normalizedColorSets[idx];
    layoutSequence.push({
      kind: "vinyl",
      length: idx * targetDist,
      track,
      colorSet: colors,
      labelColor: colors[0] || DEFAULT_SWATCH_COLOR,
      index: idx,
    });
  });

  layoutSequence.push({
    kind: "butt",
    length: requiredLength + targetDist,
    clampMargin:
      CATERPILLAR_CANVAS_MARGIN + CATERPILLAR_BUTT_SIZE.width / 2 + 8,
  });

  const entries = layoutSequence.map((entry) => ({
    ...entry,
    pathPoint: sampleSineArcExtended(wavePath, entry.length),
  }));

  const headEntry = entries.find((entry) => entry.kind === "head") || null;
  const buttEntry = entries.find((entry) => entry.kind === "butt") || null;
  const vinylEntries = entries.filter((entry) => entry.kind === "vinyl");
  return { headEntry, buttEntry, vinylEntries };
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

function initializeVinylScene(container, layout) {
  stopVinylAnimation();
  vinylObjects.length = 0;
  pendingVinylEntries.length = 0;
  if (vinylCanvas && vinylCanvas.parentNode === container) {
    container.removeChild(vinylCanvas);
  }
  vinylCanvas = document.createElement("canvas");
  vinylCanvas.width = VINYL_CANVAS_WIDTH;
  vinylCanvas.height = VINYL_CANVAS_HEIGHT;
  vinylCanvas.style.display = "block";
  vinylCanvas.style.position = "absolute";
  vinylCanvas.style.top = "0";
  vinylCanvas.style.left = "0";
  vinylCanvas.style.zIndex = "1";
  container.appendChild(vinylCanvas);
  vinylCtx = vinylCanvas.getContext("2d");

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

  const headEntry = layout?.headEntry;
  const buttEntry = layout?.buttEntry;
  pendingVinylEntries = (layout?.vinylEntries || []).map((entry) => ({
    ...entry,
    added: false,
    vinyl: null,
  }));

  const headSprite = caterpillarSprites.head;
  const buttSprite = caterpillarSprites.butt;
  if (headSprite && headEntry?.pathPoint) {
    const pos = clampSpritePosition(
      headEntry.pathPoint,
      headSprite,
      headEntry.clampMargin
    );
    headSprite.position = pos || headEntry.pathPoint;
  }
  if (buttSprite && buttEntry?.pathPoint) {
    const pos = clampSpritePosition(
      buttEntry.pathPoint,
      buttSprite,
      buttEntry.clampMargin
    );
    buttSprite.position = pos || buttEntry.pathPoint;
  }

  vinylDrawOrder = [];
  if (headSprite) {
    vinylDrawOrder.push({ type: "sprite", sprite: headSprite });
  }
  if (buttSprite) {
    vinylDrawOrder.push({ type: "sprite", sprite: buttSprite });
  }

  lastVinylTimestamp = null;
  vinylAnimationId = requestAnimationFrame(animateVinyls);
}

function addVinylFromEntry(entry) {
  if (!entry || entry.added) return;
  const point = entry.pathPoint || {
    x: VINYL_CANVAS_WIDTH / 2,
    y: VINYL_CANVAS_HEIGHT / 2,
  };
  const vinyl = new Vinyl(
    point.x,
    point.y,
    VINYL_OUTER_RADIUS,
    VINYL_INNER_RADIUS,
    entry.labelColor || DEFAULT_SWATCH_COLOR
  );
  const track = entry.track;
  const rankStr = track?.rank ? `#${track.rank} ` : "";
  const title = `${rankStr}${track?.name || ""}`;
  const artist = getArtistNamesSafe(track);
  const rawAlbum = track?.album;
  const album =
    typeof rawAlbum === "string"
      ? rawAlbum
      : rawAlbum?.name || track?.album_name || "";

  const bpm =
    (typeof track?.bpm === "number" ? track.bpm : null) ??
    (typeof track?.tempo === "number" ? track.tempo : null) ??
    null;

  const derivedBpm = Math.max(
    70,
    Math.round((track?.popularity ?? 60) * 1.25 + 5)
  );

  vinyl.setTrackMeta({
    title,
    artist,
    album,
    bpm,
    spinsPerBeat: 0.05,
    hoverBpm: bpm ?? derivedBpm,
  });

  if (bpm == null) {
    vinyl.setAngularVelocity(0.6 + (vinylObjects.length % 3) * 0.15);
  }

  vinyl.setSwirlColors(entry.colorSet);
  vinylObjects.push(vinyl);

  const insertIndex = Math.max(vinylDrawOrder.length - 1, 0);
  vinylDrawOrder.splice(insertIndex, 0, { type: "vinyl", vinyl });

  entry.vinyl = vinyl;
  entry.added = true;
}

function addVinylForTrackIndex(index) {
  addVinylFromEntry(pendingVinylEntries[index]);
}

function onFruitAnimationComplete(trackIndex) {
  addVinylForTrackIndex(trackIndex);
}

function animateVinyls(timestamp) {
  if (!vinylCtx) return;
  if (!lastVinylTimestamp) lastVinylTimestamp = timestamp;
  const delta = (timestamp - lastVinylTimestamp) / 1000;
  lastVinylTimestamp = timestamp;

  vinylCtx.clearRect(0, 0, VINYL_CANVAS_WIDTH, VINYL_CANVAS_HEIGHT);

  let anyHover = false;

  vinylDrawOrder.forEach((entry) => {
    if (entry.type === "sprite") {
      entry.sprite.draw(vinylCtx);
      return;
    }
    const vinyl = entry.vinyl;
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

function updateVinylColors(colorSets) {
  if (!pendingVinylEntries.length) return;
  const normalized = (colorSets || []).map((set) => normalizeColorSet(set));
  pendingVinylEntries.forEach((entry, index) => {
    const colors = normalized[index] || entry.colorSet;
    entry.colorSet = colors;
    entry.labelColor = colors[0] || DEFAULT_SWATCH_COLOR;
    if (entry.vinyl) {
      entry.vinyl.labelColor = entry.labelColor;
      entry.vinyl.setSwirlColors(colors);
    }
  });
}

function clearCaterpillarSprites() {
  Object.values(caterpillarSprites).forEach((sprite) => {
    if (sprite) sprite.setPosition(null);
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampSpritePosition(point, sprite, margin = 0) {
  if (!point || !sprite) return null;
  const minX = -sprite.width / 2 + margin;
  const maxX = VINYL_CANVAS_WIDTH + sprite.width / 2 - margin;
  const minY = -sprite.height / 2 + margin;
  const maxY = VINYL_CANVAS_HEIGHT + sprite.height / 2 - margin;
  return {
    x: clamp(point.x, minX, maxX),
    y: clamp(point.y, minY, maxY),
  };
}

function sampleSineArcExtended(path, targetLength) {
  const { points } = path;
  if (!points.length) return { x: 0, y: 0 };
  const total = path.totalLength;
  if (targetLength >= 0 && targetLength <= total) {
    return sampleSineArc(path, targetLength);
  }
  if (targetLength < 0) {
    const first = points[0];
    const next = points[1] || first;
    return offsetAlongPath(first, next, Math.abs(targetLength), false);
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2] || last;
  const overshoot = Math.max(targetLength - total, 0);
  if (!overshoot) return { x: last.x, y: last.y };
  const directionPoint = {
    x: last.x + (last.x - prev.x),
    y: last.y + (last.y - prev.y),
  };
  return offsetAlongPath(last, directionPoint, overshoot, true);
}

function offsetAlongPath(base, neighbor, distance, forward = true) {
  const dirX = neighbor.x - base.x;
  const dirY = neighbor.y - base.y;
  const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  const sign = forward ? 1 : -1;
  return {
    x: base.x + sign * (dirX / len) * distance,
    y: base.y + sign * (dirY / len) * distance,
  };
}

function buildSineArc(canvasWidth, canvasHeight, spacingX, amplitude, radius) {
  const horizontalPadding = radius + 20;
  const verticalPadding = radius + 20;
  const baseWidth = Math.max(
    canvasWidth - 2 * horizontalPadding - WAVE_START_OFFSET,
    0
  );
  const width = Math.max(baseWidth - VINYL_CANVAS_LEFT_PADDING, 0);
  const phaseShift = -Math.PI / 2;
  const bottomY = canvasHeight - verticalPadding - radius - 4;
  const topBound = verticalPadding + radius + 4;
  const verticalSpan = Math.max(bottomY - topBound, 0);
  const effectiveAmplitude = Math.min(Math.max(amplitude, 0), verticalSpan / 2);
  const steps = 600;
  const points = [];
  let totalLength = 0;
  let prevPoint = null;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const x =
      horizontalPadding +
      WAVE_START_OFFSET +
      u * width +
      VINYL_CANVAS_LEFT_PADDING;
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
  if (!imageUrl) return Promise.resolve([]);
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
        colorCache.set(imageUrl, []);
        resolve([]);
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
      colorCache.set(imageUrl, []);
      resolve([]);
    };
    img.src = imageUrl;
  });
}

function findDominantColor(pixels, k = 3, iterations = 6, topN = 2) {
  if (!pixels.length)
    return Array.from({ length: topN }, () => DEFAULT_SWATCH_COLOR);
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
  const bucketStats = centers.map((center, idx) => ({
    color: `rgb(${center[0]}, ${center[1]}, ${center[2]})`,
    count: lastBuckets[idx]?.length ?? 0,
  }));
  bucketStats.sort((a, b) => b.count - a.count);
  const result = [];
  for (let i = 0; i < topN; i += 1) {
    if (bucketStats[i]) result.push(bucketStats[i].color);
    else result.push(DEFAULT_SWATCH_COLOR);
  }
  return result;
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
    if (fruitCtx)
      fruitCtx.clearRect(0, 0, FRUIT_CANVAS_WIDTH, FRUIT_CANVAS_HEIGHT);
    return;
  }
  if (fruitCtx)
    fruitCtx.clearRect(0, 0, FRUIT_CANVAS_WIDTH, FRUIT_CANVAS_HEIGHT);
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
}

function spawnNextFruit() {
  if (fruitSpawnIndex >= fruitQueue.length) {
    stopFruitInterval();
    return;
  }
  const trackIndex = fruitSpawnIndex;
  const track = fruitQueue[trackIndex];
  const image = pickRandomFruitImage();
  const fruit = new Fruit(
    FRUIT_CANVAS_WIDTH / 2,
    FRUIT_CANVAS_HEIGHT / 2,
    image,
    120 + Math.random() * 60
  );
  const startX = - (FRUIT_MOVE_MARGIN * 3);
  const endX = FRUIT_CANVAS_WIDTH - (FRUIT_MOVE_MARGIN * 3);
  const travelDistance = Math.max(endX - startX, 0);
  fruit.position.x = startX;
  fruit.position.y = FRUIT_CANVAS_HEIGHT / 2;
  fruit.setVelocity(travelDistance / FRUIT_MOVE_TIME, 0);
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
  fruitObjects.push(fruit);
  fruit.__trackIndex = trackIndex;
  fruit.__completionX = endX;
  fruit.__completionCallback = onFruitAnimationComplete;
  fruit.__completionTriggered = false;
  fruit.__shouldRemove = false;
  // optional: no caption text
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
  const remaining = [];
  fruitObjects.forEach((fruit) => {
    fruit.update(delta);
    if (
      fruit.__completionCallback &&
      !fruit.__completionTriggered &&
      typeof fruit.__completionX === "number"
    ) {
      const reached =
        fruit.velocity.x >= 0
          ? fruit.position.x >= fruit.__completionX
          : fruit.position.x <= fruit.__completionX;
      if (reached) {
        fruit.__completionTriggered = true;
        fruit.__completionCallback(fruit.__trackIndex);
        fruit.__shouldRemove = true;
      }
    }
    fruit.draw(fruitCtx);
    if (!fruit.__shouldRemove) remaining.push(fruit);
  });
  fruitObjects = remaining;
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
