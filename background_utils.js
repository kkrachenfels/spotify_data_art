const WAVE_COLOR_LIMIT = 10;
const WAVE_OPACITY = 0.7;
const WAVE_SPEED_DEFAULT = 0.3;

let waveCanvas = null;
let waveCtx = null;
let waveBackgroundColors = [];
let waveAnimationId = null;
let wavePhase = 0;
let waveLastWaveTimestamp = null;
let waveSpeed = WAVE_SPEED_DEFAULT;
let waveLabels = [];

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

function updateWavePalette(colorSets, labelSets) {
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
  const labelEntries = labelSets
    ? labelSets
        .map((lbl) => (typeof lbl === "string" ? lbl : ""))
        .slice(0, WAVE_COLOR_LIMIT)
    : [];
  while (labelEntries.length < waveBackgroundColors.length) {
    const idx = labelEntries.length;
    labelEntries.push(`Item ${idx + 1}`);
  }
  waveLabels = labelEntries.slice(0, waveBackgroundColors.length);
  startWaveBackgroundAnimation();
}

function updateWaveSpeedFromTracks(tracks) {
  if (!tracks?.length) {
    waveSpeed = WAVE_SPEED_DEFAULT;
    return;
  }
  const bpms = tracks.map(getTrackBpmEstimate);
  const avgBpm = bpms.reduce((sum, val) => sum + val, 0) / bpms.length;
  const normalized = avgBpm / 120;
  waveSpeed = Math.max(0.4, Math.min(0.5, normalized * WAVE_SPEED_DEFAULT));
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
  if (typeof showWaveBackgrounds === "boolean" && !showWaveBackgrounds) {
    waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    waveAnimationId = requestAnimationFrame(animateWaveBackground);
    return;
  }
  if (!waveLastWaveTimestamp) waveLastWaveTimestamp = timestamp;
  const delta = (timestamp - waveLastWaveTimestamp) / 1000;
  waveLastWaveTimestamp = timestamp;
  wavePhase += waveSpeed * delta;
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
    const label = waveLabels[idx];
    if (label && typeof showWaveLabels === "boolean" ? showWaveLabels : true) {
      const savedComposite = waveCtx.globalCompositeOperation;
      waveCtx.globalCompositeOperation = "source-over";
      const textColor = getContrastingTextColor(color);
      waveCtx.fillStyle = textColor;
      const prevAlpha = waveCtx.globalAlpha;
      waveCtx.globalAlpha = 0.5;
      waveCtx.font = `bold 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      waveCtx.textAlign = "center";
      waveCtx.textBaseline = "bottom";
      const textY = Math.max(centerOffset - amplitude - 12, 20);
      waveCtx.fillText(label, width / 2, textY);
      waveCtx.globalAlpha = prevAlpha;
      waveCtx.globalCompositeOperation = savedComposite;
    }
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

function getContrastingTextColor(color) {
  const rgb = parseColorToRgb(color);
  if (!rgb) return "#000";
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < 0.7 ? "#fff" : "#000";
}

function parseColorToRgb(color) {
  if (!color || typeof color !== "string") return null;
  if (color.startsWith("rgb")) {
    const nums = color
      .replace(/[^\d,]/g, "")
      .split(",")
      .map((v) => Number(v.trim()));
    if (nums.length >= 3) return { r: nums[0], g: nums[1], b: nums[2] };
    return null;
  }
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  return null;
}

