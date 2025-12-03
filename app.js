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
  fetch(`/top_tracks?start=${lo}&end=${hi}`)
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      return response.json();
    })
    .then((data) => {
      const items = (data?.items || []).slice(0, songDisplayLimit);
      renderSongList(items);
      const shown = items.length;
      const total = (data?.items || []).length;
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
function renderSongList(tracks) {
  list.innerHTML = "";
  if (!tracks.length) {
    list.innerHTML = "No tracks in that rank range.";
    return;
  }

  const container = el("div", { class: "spiral-canvas-container" });
  container.style.position = "relative";
  container.style.width = `${SPIRAL_SIZE}px`;
  container.style.height = `${SPIRAL_SIZE}px`;
  container.style.margin = "16px auto";
  container.style.border = "1px solid #eee";
  container.style.borderRadius = "12px";
  container.style.backgroundColor = "#fff";
  list.appendChild(container);

  spiralTooltip = el("div", { class: "spiral-tooltip" });
  spiralTooltip.style.position = "absolute";
  spiralTooltip.style.pointerEvents = "none";
  spiralTooltip.style.padding = "10px 12px";
  spiralTooltip.style.borderRadius = "6px";
  spiralTooltip.style.background = "rgba(0, 0, 0, 0.75)";
  spiralTooltip.style.color = "#fff";
  spiralTooltip.style.fontSize = "0.85rem";
  spiralTooltip.style.display = "none";
  spiralTooltip.style.maxWidth = "220px";
  spiralTooltip.style.zIndex = "100";
  container.appendChild(spiralTooltip);

  const colorPromises = tracks.map((item) =>
    getProminentColor(item.album_image).then(
      (color) => color || DEFAULT_SWATCH_COLOR
    )
  );

  Promise.all(colorPromises).then((colors) => {
    spiralSegments = prepareSpiralSegments(tracks, colors);
    createSpiralSketch(container);
    container.appendChild(spiralTooltip);
  });
}

function prepareSpiralSegments(tracks, colors) {
  const center = SPIRAL_SIZE / 2;
  const baseRadius = 10;
  const radiusScale = 16;
  const thetaStep = Math.PI / 2.45;
  const resolution = 0.05;

  return tracks.map((track, index) => {
    const startTheta = index * thetaStep;
    const endTheta = startTheta + thetaStep;
    const points = [];
    const path = new Path2D();

    for (
      let theta = startTheta;
      theta <= endTheta + resolution;
      theta += resolution
    ) {
      const r = baseRadius + radiusScale * theta;
      const x = center + r * Math.cos(theta);
      const y = center + r * Math.sin(theta);
      if (points.length === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
      points.push({ x, y });
    }

    return {
      track,
      color: colors[index],
      points,
      path,
    };
  });
}

function createSpiralSketch(container) {
  if (spiralInstance) {
    spiralInstance.remove();
  }
  spiralInstance = new p5((p) => {
    p.setup = () => {
      const canvas = p.createCanvas(SPIRAL_SIZE * 1.5, SPIRAL_SIZE * 1.5);
      canvas.parent(container);
      canvas.position(0, 0);
      canvas.style("display", "block");
      const canvasElement = canvas.elt;
      canvasElement.style.position = "absolute";
      canvasElement.style.top = "0";
      canvasElement.style.left = "0";
      canvasElement.style.zIndex = "1";

      // 2D context for isPointInStroke
      spiralDrawingCtx = canvasElement.getContext("2d");
      if (spiralDrawingCtx) {
        spiralDrawingCtx.lineWidth = 36;
        spiralDrawingCtx.lineCap = "round";
        spiralDrawingCtx.lineJoin = "round";
      }

      canvasElement.addEventListener("mousemove", (event) => {
        const rect = canvasElement.getBoundingClientRect();
        const scaleX = canvas.elt.width / rect.width;
        const scaleY = canvas.elt.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        const hovered = findSegmentNear(x, y);
        if (hovered) {
          hoveredIndex = spiralSegments.indexOf(hovered);
          canvasElement.style.cursor = "pointer";
          updateTooltip(hovered.track, x, y, container);
        } else {
          hoveredIndex = -1;
          canvasElement.style.cursor = "default";
          hideTooltip();
        }
      });

      canvasElement.addEventListener("mouseleave", () => {
        hoveredIndex = -1;
        canvasElement.style.cursor = "default";
        hideTooltip();
      });

      canvasElement.addEventListener("click", () => {
        if (hoveredIndex >= 0) {
          const url = spiralSegments[hoveredIndex].track.external_url;
          if (url) window.open(url, "_blank");
        }
      });
    };

    p.draw = () => {
      p.background(255);
      p.strokeWeight(36);
      p.strokeCap(p.ROUND);
      p.strokeJoin(p.ROUND);
      p.noFill();

      // Draw all segments
      spiralSegments.forEach((segment, idx) => {
        // Use p5 stroke for visual; interaction uses Path2D ctx
        p.stroke(idx === hoveredIndex ? 255 : segment.color);
        p.beginShape();
        segment.points.forEach((pt) => p.vertex(pt.x, pt.y));
        p.endShape();

        if (idx === hoveredIndex) {
          // halo
          p.stroke(255);
          p.strokeWeight(36 + 8);
          p.beginShape();
          segment.points.forEach((pt) => p.vertex(pt.x, pt.y));
          p.endShape();

          // main color on top
          p.stroke(segment.color);
          p.strokeWeight(36 + 2);
          p.beginShape();
          segment.points.forEach((pt) => p.vertex(pt.x, pt.y));
          p.endShape();
        }
      });
    };
  });
}

const HOVER_DISTANCE = 20; // fallback distance if Path2D not available

function findSegmentNear(x, y) {
  if (spiralDrawingCtx && spiralSegments.length) {
    // Use isPointInStroke for precise hover
    for (let i = 0; i < spiralSegments.length; i++) {
      const seg = spiralSegments[i];
      if (spiralDrawingCtx.isPointInStroke(seg.path, x, y)) return seg;
    }
  }
  // Fallback: point-distance
  const thrSq = HOVER_DISTANCE * HOVER_DISTANCE;
  for (let i = 0; i < spiralSegments.length; i++) {
    const seg = spiralSegments[i];
    for (let j = 0; j < seg.points.length; j++) {
      const pt = seg.points[j];
      const dx = pt.x - x;
      const dy = pt.y - y;
      if (dx * dx + dy * dy <= thrSq) return seg;
    }
  }
  return null;
}

function updateTooltip(track, x, y) {
  if (!spiralTooltip) return;
  const content = `<strong>${track.rank ? `#${track.rank} ` : ""}${
    track.name
  }</strong><br>${track.artists}<br><em>${track.album || ""}</em>`;
  spiralTooltip.innerHTML = content;
  spiralTooltip.style.display = "block";
  const tooltipWidth = spiralTooltip.offsetWidth;
  const tooltipHeight = spiralTooltip.offsetHeight;
  const offsetX = 12;
  const offsetY = -tooltipHeight - 8;
  const left = Math.min(
    Math.max(x + offsetX, 8),
    SPIRAL_SIZE - tooltipWidth - 8
  );
  const top = Math.max(
    Math.min(y + offsetY, SPIRAL_SIZE - tooltipHeight - 8),
    8
  );
  spiralTooltip.style.left = `${left}px`;
  spiralTooltip.style.top = `${top}px`;
}

function hideTooltip() {
  if (spiralTooltip) spiralTooltip.style.display = "none";
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
