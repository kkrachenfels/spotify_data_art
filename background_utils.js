/**
 * background_utils.js
 * - Utility functions for setting up and updating the wave background
 */

// some defaults
const WAVE_COLOR_LIMIT = 10;
const WAVE_OPACITY = 0.7;
const WAVE_SPEED_DEFAULT = 0.3;

// initialize variables
let waveCanvas = null;
let waveCtx = null;
let waveBackgroundColors = [];
let waveAnimationId = null;
let wavePhase = 0;
let waveLastWaveTimestamp = null;
let waveSpeed = WAVE_SPEED_DEFAULT;
let waveLabels = [];
let waveOpacity = WAVE_OPACITY;
let waveShape = "sine";

// setup the wave background canvas
// put it on a separate canvas behind the vinyls/fruits
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

// pass in a pair of color and label arrays
// colors are for the wave background, labels are used to set the text (i.e. song name or artist name)
function updateWavePalette(colorSets, labelSets) {
  if (!waveCtx) return;
  const palette = (colorSets || [])
    .map((set) => {
      if (typeof set === "string") return set;
      if (Array.isArray(set) && set.length) return set[0];
      return DEFAULT_SWATCH_COLOR;
    })
    .slice(0, WAVE_COLOR_LIMIT);
  if (palette.length) {
    waveBackgroundColors = palette;
  } else {
    waveBackgroundColors = [DEFAULT_SWATCH_COLOR];
  }
  let labelEntries = [];
  if (labelSets) {
    labelEntries = labelSets
      .map((label) => {
        if (typeof label === "string") {
          return label;
        }
        return "";
      })
      .slice(0, WAVE_COLOR_LIMIT); // 10 labels max by default
  }
  // if there are less labels than colors, add some default labels
  while (labelEntries.length < waveBackgroundColors.length) {
    const idx = labelEntries.length;
    labelEntries.push(`Item ${idx + 1}`); // default label is "Item 1", "Item 2", etc.
  }
  // make sure the labels and colors are the same length
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
  // we just played around with speed values until their speed wasn't too visually fast or slow
  waveSpeed = Math.max(0.4, Math.min(0.5, normalized * WAVE_SPEED_DEFAULT));
}

// based on the slider value, set wave background opacity
function setWaveBackgroundOpacity(value) {
  let parsed;
  if (typeof value === "number") {
    parsed = value;
  } else {
    parsed = Number(value);
  }
  if (Number.isNaN(parsed)) return;
  waveOpacity = Math.max(0, Math.min(1, parsed));
}

// based on radio button value, set wave background shape
function setWaveShape(shape) {
  const allowed = ["sine", "square", "triangle", "saw"];
  if (allowed.includes(shape)) {
    waveShape = shape;
  }
}

// all waves use the sine as a base and are modified from there
function evaluateWave(value, shape) {
  const normalizedShape = shape || waveShape;
  const period = Math.PI * 2;
  const phase = ((value / period) % 1 + 1) % 1; // normalize the value to 0-1
  const square = Math.sign(Math.sin(value)) || 0; // square wave is 1 or -1 based on the sine value
  const triangle = 1 - 4 * Math.abs(phase - 0.5); // triangle wave is 1 at 0.5 and 0 at 0 and 1
  const saw = phase * 2 - 1; // saw wave is 1 at 0 and -1 at 1
  switch (normalizedShape) {
    case "square":
      return square;
    case "triangle":
      return triangle;
    case "saw":
      return saw;
    case "sine":
    default:
      return Math.sin(value);
  }
}

function startWaveBackgroundAnimation() {
  if (!waveCtx || !waveBackgroundColors.length || waveAnimationId) return;
  waveAnimationId = requestAnimationFrame(animateWaveBackground);
}

// animate the wave background
// use the timestamp to set the wave's phase offset, which makes the waves appear to move
function animateWaveBackground(timestamp) {
  if (!waveCtx || !waveCanvas) return;
  if (!waveBackgroundColors.length) {
    waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    waveAnimationId = requestAnimationFrame(animateWaveBackground);
    return;
  }
  if (waveOpacity <= 0) {
    waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    waveAnimationId = requestAnimationFrame(animateWaveBackground);
    return;
  }
  if (!waveLastWaveTimestamp) waveLastWaveTimestamp = timestamp;
  const delta = (timestamp - waveLastWaveTimestamp) / 1000;
  waveLastWaveTimestamp = timestamp;
  wavePhase += waveSpeed * delta; // update the wave's phase offset

  const { width, height } = waveCanvas;
  waveCtx.clearRect(0, 0, width, height);
  waveCtx.globalAlpha = waveOpacity;
  const prevComposite = waveCtx.globalCompositeOperation;
  // destination-over means the waves will be drawn on top of the background
  // make sure waves layer atop each other
  waveCtx.globalCompositeOperation = "destination-over";

  // spacing is the distance between the waves
  const spacing = height / (waveBackgroundColors.length + 1);
    waveBackgroundColors.forEach((color, idx) => {
    // make amplitude and frequency increase for each wave
    // so that when they first start moving, they are all cohesive/visible
    const amplitude = 24 + idx * 4;
    const freqFactor = 1 + idx * 0.15;
    // since frequency also increases, we need to scale the phase offset (movement) for each wave by index
    const phaseShift = wavePhase * (0.4 + idx * 0.2);
    // centerOffset is the distance from the center of the canvas to the wave's center
    const centerOffset =
      spacing * (idx + 1) + evaluateWave(wavePhase * 0.8 + idx, waveShape) * 12;
    waveCtx.fillStyle = color;
    waveCtx.beginPath();
    waveCtx.moveTo(0, 0);

    // calculate the y value at each point
    // and then connect the points to form the wave
    for (let x = 0; x <= width; x += 1) {
      const normalized = (x / width) * Math.PI * 2 * freqFactor;
      const y =
        centerOffset +
        evaluateWave(normalized + phaseShift, waveShape) *
          amplitude *
          (1 + idx * 0.05);
      waveCtx.lineTo(x, y);
    }
    waveCtx.lineTo(width, 0);
    waveCtx.closePath();
    waveCtx.fill();

    // draw the textlabel if it exists
    const label = waveLabels[idx];
    let displayLabels = true;
    if (typeof showWaveLabels === "boolean") {
      displayLabels = showWaveLabels;
    }
    if (label && displayLabels) {
      const savedComposite = waveCtx.globalCompositeOperation;
      // source-over means the text will be drawn on top of the wave
      // so that the text is always visible
      waveCtx.globalCompositeOperation = "source-over";
      const textColor = getContrastingTextColor(color);
      waveCtx.fillStyle = textColor;
      const prevAlpha = waveCtx.globalAlpha;
      waveCtx.globalAlpha = 0.3;
      waveCtx.font = `bold 18px sans-serif`;
      waveCtx.textAlign = "center";
      waveCtx.textBaseline = "bottom";
      // keep label in canvas, place slightly above center but at least 20px from the bottom
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

// use white text labels on dark backgrounds, black text labels on light backgrounds
function getContrastingTextColor(color) {
  const rgb = parseColorToRgb(color);
  if (!rgb) return "#000000"; // white by default
  // luminance calculation from https://www.w3.org/TR/AERT/#color-contrast
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  if (luminance < 0.7) {
    return "#ffffff";
  }
  return "#000000";
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
  return null;
}

