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

