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

const header = el("h2", {}, "Spotify: Starving Artist");
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
const startLabel = el("span", { class: "date-value" }, "Ranks 1 - 10");
const startRange = el("input", {
  type: "range",
  id: "start-range",
  min: 1,
  max: 1,
  value: 1,
  disabled: true,
});
const SONG_DISPLAY_LIMIT = 10;
// ------------ VINYL DISPLAY ------------
const VINYL_CANVAS_WIDTH = 1440;
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
let lastVinylIndex = -1;
let buttSpriteVisible = false;
let lastVinylTimestamp = null;
let headSpriteEntry = null;
let headVisible = false;
let sceneReadyForPlay = false;
let animationsActive = false;
const updateFilterBtn = el(
  "button",
  { id: "apply-range", class: "compact-button", onclick: applyCurrentRange },
  "Update filter"
);
const eatBtn = el(
  "button",
  {
    id: "eat-button",
    class: "compact-button",
    onclick: startEatingAnimations,
    disabled: true,
  },
  "Eat!"
);
const filterButtonGroup = el(
  "div",
  { class: "filter-buttons" },
  updateFilterBtn,
  eatBtn
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


const CATERPILLAR_MARGIN = 12;

const CATERPILLAR_HEAD_SRC = "assets/caterpillar_head.png";
const CATERPILLAR_HEAD_CLOSED_SRC = "assets/caterpillar_head_closed.png";
const CATERPILLAR_BUTT_SRC = "assets/caterpillar_butt.png";
const CATERPILLAR_HEAD_SIZE = {
  width: VINYL_OUTER_RADIUS * 2.5,
  height: VINYL_OUTER_RADIUS * 2.5,
};
const CATERPILLAR_BUTT_SIZE = {
  width: VINYL_OUTER_RADIUS * 2.5,
  height: VINYL_OUTER_RADIUS * 2.5,
};

const CATERPILLAR_CANVAS_MARGIN = VINYL_OUTER_RADIUS;
const WAVE_START_OFFSET = FRUIT_CANVAS_WIDTH / 3; // + CATERPILLAR_CANVAS_MARGIN;
const BUTT_ROTATION_SPEED = 0.3;
const VINYL_CANVAS_EXTRA_WIDTH = 16;

class CaterpillarSprite {
  constructor(src, width, height) {
    this._primaryImage = new Image();
    this._primaryImage.src = src;
    this.width = width;
    this.height = height;
    this.ready = false;
    this.position = null;
    this.rotation = 0;
    this.angularVelocity = 0;
    this._alternateImage = null;
    this._alternateReady = false;
    this._useAlternateFrame = false;

    this._primaryImage.crossOrigin = "Anonymous";
    this._primaryImage.onload = () => {
      this.ready = true;
    };
    this._primaryImage.onerror = () => {
      this.ready = false;
    };
  }

  setPosition(point) {
    this.position = point;
  }

  draw(ctx) {
    if (!this.ready || !this.position) return;
    const useAlternate =
      this._useAlternateFrame && this._alternateImage && this._alternateReady;
    const renderImage = useAlternate ? this._alternateImage : this._primaryImage;
    if (!renderImage?.complete) return;
    const { x, y } = this.position;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.rotation);
    ctx.drawImage(
      renderImage,
      -this.width / 2,
      -this.height / 2,
      this.width,
      this.height
    );
    ctx.restore();
  }

  update(deltaSeconds) {
    if (this.angularVelocity) {
      this.rotation =
        (this.rotation + this.angularVelocity * deltaSeconds) % (Math.PI * 2);
    }
  }

  setAlternateImage(src) {
    if (!src) {
      this._alternateImage = null;
      this._alternateReady = false;
      this._useAlternateFrame = false;
      return;
    }
    this._alternateImage = new Image();
    this._alternateImage.src = src;
    this._alternateImage.crossOrigin = "Anonymous";
    this._alternateReady = false;
    this._alternateImage.onload = () => {
      this._alternateReady = true;
    };
    this._alternateImage.onerror = () => {
      this._alternateReady = false;
    };
  }

  useAlternateFrame(enabled) {
    this._useAlternateFrame = Boolean(enabled);
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

caterpillarSprites.head.setAlternateImage(CATERPILLAR_HEAD_CLOSED_SRC);

startRange.addEventListener("input", () => {
  updateRankRangeLabel(Number(startRange.value));
});

// --- TIME RANGE STATE + RADIO CONTROL ---

// pick your default: "short_term" | "medium_term" | "long_term"
let currentTimeRange = "long_term";
let currentDataType = "tracks";
let pendingDataType = "tracks";
const dataTypeOptions = [
  { label: "Top Tracks", value: "tracks" },
  { label: "Top Artists", value: "artists" },
];
let dataTypeOptionLabels = [];
let pendingTimeRange = currentTimeRange;
const timeRangeOptions = [
  { label: "1 month", value: "short_term" },
  { label: "6 months", value: "medium_term" },
  { label: "1 year", value: "long_term" },
];
let timeRangeOptionLabels = [];

function updatePendingTimeRange(value) {
  pendingTimeRange = value;
  timeRangeOptionLabels.forEach((lbl) => {
    lbl.classList.toggle("active", lbl.dataset.range === value);
  });
}

function buildTimeRangeControls() {
  const container = document.createElement("div");
  container.className = "time-range-controls";
  container.appendChild(el("span", { class: "time-range-label" }, "Time window: "));
  container.appendChild(document.createElement("br"));

  timeRangeOptions.forEach((option) => {
    const id = `time-range-${option.value}`;
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "time-range";
    radio.value = option.value;
    radio.id = id;
    radio.checked = option.value === pendingTimeRange;
    radio.addEventListener("change", () => {
      if (radio.checked) updatePendingTimeRange(option.value);
    });

    const label = document.createElement("label");
    label.className =
      "time-range-option" + (option.value === pendingTimeRange ? " active" : "");
    label.dataset.range = option.value;
    label.htmlFor = id;
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.margin = "4px 0";
    label.appendChild(radio);
    label.appendChild(document.createTextNode(option.label));

    timeRangeOptionLabels.push(label);
    container.appendChild(label);
  });

  return container;
}

const timeRangeControls = buildTimeRangeControls();

function updatePendingDataType(value) {
  pendingDataType = value;
  dataTypeOptionLabels.forEach((lbl) => {
    lbl.classList.toggle("active", lbl.dataset.range === value);
  });
}

function buildDataTypeControls() {
  const container = document.createElement("div");
  container.className = "data-type-controls";
  container.appendChild(el("span", { class: "time-range-label" }, "Data: "));
  container.appendChild(document.createElement("br"));

  dataTypeOptions.forEach((option) => {
    const id = `data-type-${option.value}`;
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "data-type";
    radio.value = option.value;
    radio.id = id;
    radio.checked = option.value === pendingDataType;
    radio.addEventListener("change", () => {
      if (radio.checked) updatePendingDataType(option.value);
    });

    const label = document.createElement("label");
    label.className =
      "time-range-option" + (option.value === pendingDataType ? " active" : "");
    label.dataset.range = option.value;
    label.htmlFor = id;
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.margin = "4px 0";
    label.appendChild(radio);
    label.appendChild(document.createTextNode(option.label));

    dataTypeOptionLabels.push(label);
    container.appendChild(label);
  });

  return container;
}

const dataTypeControls = buildDataTypeControls();
let showWaveLabels = true;
const waveLabelCheckbox = document.createElement("input");
waveLabelCheckbox.type = "checkbox";
waveLabelCheckbox.id = "show-wave-labels";
waveLabelCheckbox.checked = showWaveLabels;
waveLabelCheckbox.addEventListener("change", () => {
  showWaveLabels = waveLabelCheckbox.checked;
});
const waveLabelToggle = el(
  "label",
  { class: "wave-label-toggle", for: "show-wave-labels" },
  waveLabelCheckbox,
  el("span", {}, "Show background labels")
);
const INITIAL_WAVE_OPACITY = 0.7;
const waveOpacitySlider = document.createElement("input");
waveOpacitySlider.type = "range";
waveOpacitySlider.id = "wave-opacity";
waveOpacitySlider.min = 0;
waveOpacitySlider.max = 100;
waveOpacitySlider.step = 1;
const initialWaveOpacity = Math.round(INITIAL_WAVE_OPACITY * 100);
waveOpacitySlider.value = initialWaveOpacity;
const waveOpacityValueLabel = el(
  "span",
  { class: "wave-opacity-value" },
  `${initialWaveOpacity}%`
);
waveOpacitySlider.addEventListener("input", () => {
  const pct = Number(waveOpacitySlider.value);
  waveOpacityValueLabel.textContent = `${pct}%`;
  if (typeof setWaveBackgroundOpacity === "function") {
    setWaveBackgroundOpacity(pct / 100);
  }
  updateWaveLabelToggleState();
});
const waveOpacityControl = el(
  "div",
  { class: "wave-opacity-control" },
  el("label", { for: "wave-opacity" }, "Background opacity:"),
  waveOpacitySlider,
  waveOpacityValueLabel
);
waveOpacityControl.style.marginTop = "4px";

const waveShapeOptions = [
  { label: "Sine", value: "sine" },
  { label: "Square", value: "square" },
  { label: "Triangle", value: "triangle" },
  { label: "Saw", value: "saw" },
];
function handleWaveShapeChange(value) {
  if (typeof setWaveShape === "function") {
    setWaveShape(value);
  }
}
const waveShapeControls = el("div", { class: "wave-shape-controls" });
waveShapeControls.appendChild(el("span", { class: "wave-shape-label" }, "Wave shape:"));
waveShapeOptions.forEach((option, index) => {
  const id = `wave-shape-${option.value}`;
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "wave-shape";
  radio.value = option.value;
  radio.id = id;
  radio.checked = option.value === "sine";
  radio.addEventListener("change", () => {
    if (radio.checked) handleWaveShapeChange(option.value);
  });
  const label = el(
    "label",
    { class: "wave-shape-option", for: id },
    radio,
    option.label
  );
  waveShapeControls.appendChild(label);
});
handleWaveShapeChange("sine");

const waveLabelArea = el("div", { class: "wave-label-area" }, waveLabelToggle);
waveLabelArea.style.marginLeft = "0";
waveLabelArea.style.marginTop = "8px";
waveLabelArea.style.marginBottom = "12px";
waveLabelToggle.style.marginLeft = "0";
waveLabelToggle.style.display = "block";

const waveToggleGroup = el(
  "div",
  { class: "wave-toggle-group" },
  waveOpacityControl
);
waveToggleGroup.style.marginTop = "12px";

if (typeof setWaveBackgroundOpacity === "function") {
  setWaveBackgroundOpacity(initialWaveOpacity / 100);
}
updateWaveLabelToggleState();

function updateWaveLabelToggleState() {
  const opacityValue = Number(waveOpacitySlider.value) || 0;
  waveLabelCheckbox.disabled = opacityValue <= 0;
}

// --- FILTER SECTION (now can safely use timeRangeControls) ---

const filterSection = el(
  "section",
  { id: "date-filter" },
  el("h3", {}, "Filter Spotify data"),
  timeRangeControls,
  dataTypeControls,
  el(
    "div",
    { class: "slider-control" },
    el("label", { for: "start-range" }, "Rank range:"),
    startLabel,
    startRange
  ),
  el(
    "p",
    { class: "filter-hint" },
    `Pick a time window, type of top result, and starting rank, then press "Update filter" to fetch data.`
  ),
  el("h3", { class: "filter-subheader" }, "Display options"),
  waveShapeControls,
  waveToggleGroup,
  waveLabelArea,
  filterButtonGroup
);

const rangeStatus = el(
  "p",
  { id: "range-status" },
  "Load top tracks or artists to enable the rank filter."
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
const HEAD_MOUTH_TOGGLE_INTERVAL = 0.35;
let headMouthTimer = 0;
let headMouthClosedFrame = false;
const HEAD_CLOSED_ROTATION = -Math.PI / 12;

root.appendChild(header);
root.appendChild(info);
root.appendChild(loginBtn);
root.appendChild(logoutBtn);
root.appendChild(contentLayout);

function updateRankRangeLabel(startRank) {
  const endRank = Math.min(startRank + SONG_DISPLAY_LIMIT - 1, MAX_TOP_TRACKS);
  startLabel.textContent = `Ranks ${startRank} - ${endRank}`;
}

function applyCurrentRange() {
  const startRank = Number(startRange.value);
  const offsetRank = Math.max(
    1,
    Math.min(startRank, MAX_TOP_TRACKS - SONG_DISPLAY_LIMIT + 1)
  );
  stopVinylAnimation();
  stopFruitAnimation();
  stopFruitInterval();
  sceneReadyForPlay = false;
  animationsActive = false;
  eatBtn.disabled = true;
  currentTimeRange = pendingTimeRange;
  currentDataType = pendingDataType;
  const loadingLabel =
    currentDataType === "artists" ? "top artists" : "top tracks";
  rangeStatus.textContent = `Fetching ${loadingLabel} from Spotify...`;
  list.innerHTML = `Loading ${loadingLabel}...`;
  const endpoint = currentDataType === "artists" ? "/top_artists" : "/top_tracks";

  fetch(
    `${endpoint}?offset=${offsetRank}&time_range=${encodeURIComponent(
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
      const typeLabel = currentDataType === "artists" ? "artists" : "tracks";
      rangeStatus.textContent = total
        ? `Showing ${shown} ${typeLabel} starting from rank ${offsetRank}. Press "Eat!" to animate.`
        : `No ${typeLabel} found starting at rank ${offsetRank}.`;
      updateRankRangeLabel(offsetRank);
    })
    .catch((err) => {
      const typeLabel = currentDataType === "artists" ? "artists" : "tracks";
      list.innerHTML = `Failed to load top ${typeLabel}: ${err}`;
      rangeStatus.textContent =
        err.message || `Unable to load top ${typeLabel}.`;
    });
}

function startEatingAnimations() {
  if (!sceneReadyForPlay || animationsActive) return;
  startVinylPlayback();
  startFruitPlayback();
  animationsActive = true;
  eatBtn.disabled = true;
  rangeStatus.textContent = 'Now eating the data!';
}

function renderVinylScene(items) {
  list.innerHTML = "";
  clearCaterpillarSprites();
  const container = el("div", { class: "vinyl-canvas-container" });
  container.style.position = "relative";
  container.style.width = `${VINYL_CANVAS_WIDTH + VINYL_CANVAS_EXTRA_WIDTH}px`;
  container.style.height = `${VINYL_CANVAS_HEIGHT}px`;
  container.style.margin = "16px 0 16px 0";
  container.style.alignSelf = "flex-start";
  container.style.paddingLeft = "16px";
  container.style.border = "none";
  container.style.borderRadius = "12px";
  container.style.backgroundColor = "#fff";
  list.appendChild(container);

  if (!items.length) {
    list.innerHTML = "No items in that rank range.";
    stopFruitSequence();
    stopWaveBackgroundAnimation();
    sceneReadyForPlay = false;
    eatBtn.disabled = true;
    return;
  }

  const selected = items.slice(0, VINYL_COUNT);
  console.debug(
    "[renderVinylScene]",
    currentDataType,
    "items",
    items.length,
    "selected",
    selected.length
  );
  updateWaveSpeedFromTracks(selected);
  setupWaveBackground(container);
  updateWavePalette([], []);

  const initialColorSets = selected.map(() => [
    DEFAULT_SWATCH_COLOR,
    DEFAULT_SWATCH_COLOR,
  ]);
  const layout = buildVinylLayout(selected, initialColorSets);
  initializeVinylScene(container, layout);
  drawVinylSnapshot();
  prepareFruitSequence(selected);
  sceneReadyForPlay = selected.length > 0;
  animationsActive = false;
  eatBtn.disabled = !sceneReadyForPlay;

  const colorPromises = selected.map((item) =>
    getProminentColor(item.image || item.album_image).then(
      (color) => color || DEFAULT_SWATCH_COLOR
    )
  );

  const labelList = selected.map((item) => {
    if (item?.kind === "artist") return item?.name || "Unknown Artist";
    const rankStr = item?.rank ? `#${item.rank} ` : "";
    return `${rankStr}${item?.name || "Unknown Track"}`;
  });
  console.debug(
    "[wave labels]",
    labelList.length,
    labelList.slice(0, 10)
  );
  Promise.all(colorPromises).then((colors) => {
    updateVinylColors(colors);
    updateWavePalette(colors, labelList);
  });
}

function getTrackBpmEstimate(track) {
  const bpm =
    typeof track?.bpm === "number"
      ? track.bpm
      : typeof track?.tempo === "number"
      ? track.tempo
      : null;
  if (bpm != null) return bpm;
  const energy =
    typeof track?.energy === "number"
      ? track.energy
      : typeof track?.popularity === "number"
      ? Math.min(Math.max(track.popularity / 100, 0), 1)
      : 0.5;
  const estimated = Math.round(energy * 120 + 60); // energy 0→1 maps to 60-180 BPM
  return Math.max(70, estimated);
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
  lastVinylIndex = pendingVinylEntries.length - 1;

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
    const buttPoint = {
      ...buttEntry.pathPoint,
      x: buttEntry.pathPoint.x,
    };
    const pos = clampSpritePosition(buttPoint, buttSprite, buttEntry.clampMargin);
    buttSprite.position = pos || buttPoint;
  }

  vinylDrawOrder = [];
  if (headSprite) {
    headSpriteEntry = { type: "sprite", sprite: headSprite };
  }
  buttSpriteVisible = false;
  lastVinylIndex = pendingVinylEntries.length - 1;

  lastVinylTimestamp = null;
}

function drawVinylSnapshot() {
  if (!vinylCtx) return;
  vinylCtx.clearRect(0, 0, VINYL_CANVAS_WIDTH, VINYL_CANVAS_HEIGHT);
  vinylDrawOrder.forEach((entry) => {
    if (entry.type === "sprite") {
      entry.sprite.draw(vinylCtx);
      return;
    }
    entry.vinyl.draw(vinylCtx);
  });
}

function startVinylPlayback() {
  if (vinylAnimationId) return;
  showHeadSprite();
  lastVinylTimestamp = null;
  vinylAnimationId = requestAnimationFrame(animateVinyls);
}

function showHeadSprite() {
  if (!headSpriteEntry || headVisible) return;
  headMouthTimer = 0;
  headMouthClosedFrame = false;
  const headSprite = caterpillarSprites.head;
  if (headSprite) headSprite.useAlternateFrame(false);
  vinylDrawOrder.unshift(headSpriteEntry);
  headVisible = true;
}

function hideHeadSprite() {
  if (!headSpriteEntry || !headVisible) return;
  vinylDrawOrder = vinylDrawOrder.filter((entry) => entry !== headSpriteEntry);
  headVisible = false;
  headMouthTimer = 0;
  headMouthClosedFrame = false;
  const headSprite = caterpillarSprites.head;
  if (headSprite) headSprite.useAlternateFrame(false);
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
  const item = entry.track;
  const isArtist = item?.kind === "artist";
  const rankStr = item?.rank ? `#${item.rank} ` : "";
  const artistNames = isArtist ? "" : getArtistNamesSafe(item);
  const rawAlbum = item?.album;
  const album =
    isArtist || !rawAlbum
      ? ""
      : typeof rawAlbum === "string"
      ? rawAlbum
      : rawAlbum?.name || item?.album_name || "";
  const title = isArtist ? item?.name || "Unknown artist" : `${rankStr}${item?.name || ""}`;

  const bpm =
    isArtist
      ? null
      : (typeof item?.bpm === "number" ? item.bpm : null) ??
        (typeof item?.tempo === "number" ? item.tempo : null) ??
        null;

  const derivedBpm = getTrackBpmEstimate(item);

  vinyl.setTrackMeta({
    title,
    artist: isArtist ? "" : artistNames,
    album,
    bpm,
    spinsPerBeat: 0.05,
    hoverBpm: isArtist ? null : bpm ?? derivedBpm,
  });

  if (isArtist) {
    const genresText = Array.isArray(item?.genres) && item.genres.length
      ? item.genres.join(", ")
      : "Unknown";
    vinyl.setHoverLinesOverride([
      `Artist: ${item?.name || "Unknown"}`,
      `Popularity: ${item?.popularity ?? "N/A"}`,
      `Genres: ${genresText}`,
    ]);
    const pseudoBpm = Math.max(
      70,
      Math.round((item?.popularity ?? 60) * 1.25 + 5)
    );
    const rotationsPerSecond = (pseudoBpm / 60) * 0.05;
    vinyl.setAngularVelocity(rotationsPerSecond * 2 * Math.PI);
  } else {
    vinyl.setHoverLinesOverride(null);
    if (bpm == null) {
      vinyl.setAngularVelocity(0.6 + (vinylObjects.length % 3) * 0.15);
    }
  }

  vinyl.setSwirlColors(entry.colorSet);
  vinylObjects.push(vinyl);

  const insertIndex = Math.max(vinylDrawOrder.length - 1, 0);
  vinylDrawOrder.splice(insertIndex, 0, { type: "vinyl", vinyl });

  entry.vinyl = vinyl;
  entry.added = true;
  if (entry.index === lastVinylIndex) {
    showButtSprite();
  }
}

function addVinylForTrackIndex(index) {
  addVinylFromEntry(pendingVinylEntries[index]);
}

function onFruitAnimationComplete(trackIndex) {
  addVinylForTrackIndex(trackIndex);
}

function showButtSprite() {
  if (buttSpriteVisible) return;
  const sprite = caterpillarSprites.butt;
  if (!sprite) return;
  sprite.angularVelocity = BUTT_ROTATION_SPEED;
  buttSpriteVisible = true;
  vinylDrawOrder.push({ type: "sprite", sprite });
}

function animateVinyls(timestamp) {
  if (!vinylCtx) return;
  if (!lastVinylTimestamp) lastVinylTimestamp = timestamp;
  const delta = (timestamp - lastVinylTimestamp) / 1000;
  lastVinylTimestamp = timestamp;

  vinylCtx.clearRect(0, 0, VINYL_CANVAS_WIDTH, VINYL_CANVAS_HEIGHT);

  let anyHover = false;
  const hoveredVinyls = [];

  vinylDrawOrder.forEach((entry) => {
    if (entry.type === "sprite") {
      if (typeof entry.sprite.update === "function") {
        entry.sprite.update(delta);
      }
      entry.sprite.draw(vinylCtx);
      return;
    }
    const vinyl = entry.vinyl;
    if (vinyl.updateHover(vinylMouse.x, vinylMouse.y)) anyHover = true;
    vinyl.update(delta);
    vinyl.draw(vinylCtx, { showHud: false });
    if (vinyl._hovered) hoveredVinyls.push(vinyl);
  });

  vinylCtx.canvas.style.cursor = anyHover ? "pointer" : "default";

  updateHeadMouthAnimation(delta);

  hoveredVinyls.forEach((vinyl) => vinyl.drawHoverHud(vinylCtx));

  vinylAnimationId = requestAnimationFrame(animateVinyls);
}

function stopVinylAnimation() {
  if (vinylAnimationId) {
    cancelAnimationFrame(vinylAnimationId);
    vinylAnimationId = null;
  }
  hideHeadSprite();
}

function updateHeadMouthAnimation(delta) {
  const headSprite = caterpillarSprites.head;
  if (!headSprite) return;
  if (headVisible) {
    headMouthTimer += delta;
    if (headMouthTimer >= HEAD_MOUTH_TOGGLE_INTERVAL) {
      headMouthTimer -= HEAD_MOUTH_TOGGLE_INTERVAL;
      headMouthClosedFrame = !headMouthClosedFrame;
      headSprite.useAlternateFrame(headMouthClosedFrame);
      headSprite.rotation = headMouthClosedFrame ? HEAD_CLOSED_ROTATION : 0;
    }
  } else if (headMouthClosedFrame) {
    headMouthTimer = 0;
    headMouthClosedFrame = false;
    headSprite.useAlternateFrame(false);
    headSprite.rotation = 0;
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
  const maxX = VINYL_CANVAS_WIDTH + sprite.width / 1.7 - margin;
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

// ------------ FRUIT PREVIEW CANVAS ------------
function pickRandomFruitImage() {
  if (!FRUIT_IMAGE_VALUES.length) return null;
  const index = Math.floor(Math.random() * FRUIT_IMAGE_VALUES.length);
  return FRUIT_IMAGE_VALUES[index];
}

function prepareFruitSequence(tracks) {
  stopFruitInterval();
  stopFruitAnimation();
  fruitQueue = tracks.slice(0, Math.min(tracks.length, VINYL_COUNT));
  fruitSpawnIndex = 0;
  fruitObjects.length = 0;
  lastFruitTimestamp = null;
  if (fruitCtx)
    fruitCtx.clearRect(0, 0, FRUIT_CANVAS_WIDTH, FRUIT_CANVAS_HEIGHT);
}

function startFruitPlayback() {
  if (!fruitQueue.length) return;
  stopFruitAnimation();
  stopFruitInterval();
  fruitObjects.length = 0;
  fruitSpawnIndex = 0;
  lastFruitTimestamp = null;
  spawnNextFruit();
  if (fruitQueue.length > 1) {
    fruitIntervalId = setInterval(() => {
      spawnNextFruit();
    }, FRUIT_SPAWN_INTERVAL);
  }
  startFruitAnimation();
}

function stopFruitSequence() {
  stopFruitInterval();
  fruitObjects.length = 0;
  fruitQueue = [];
  fruitSpawnIndex = 0;
  lastFruitTimestamp = null;
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
  updateRankRangeLabel(1);
}

document.addEventListener("DOMContentLoaded", () => {
  resetRankControls();
  rangeStatus.textContent =
    'Rank range ready. Choose a window and click "Update filter".';
  startFruitAnimation();
});
