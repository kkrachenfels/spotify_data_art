// Simple frontend UI to prompt login and list liked songs from backend
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

const header = el("h2", {}, "Spotify: Your 10 Liked Songs");
const info = el(
  "p",
  {},
  'Click "Login with Spotify" to connect your account, then load liked songs and use the date range slider below.'
);
const loginBtn = el(
  "button",
  {
    onclick: () => {
      window.location = "/login";
    },
  },
  "Login with Spotify"
);
const loadBtn = el("button", { onclick: fetchLiked }, "Load Liked Songs");
const logoutBtn = el(
  "button",
  {
    onclick: () => {
      window.location = "/logout";
    },
  },
  "Logout"
);
const list = el("div", { id: "liked-list" });
const CSV_URL = "/liked_tracks.csv";
const RANGE_META_URL = "/liked_tracks_range.json";
const startDateDisplay = el("span", { class: "date-value" }, "Start: —");
const endDateDisplay = el("span", { class: "date-value" }, "End: —");
const startRange = el("input", {
  type: "range",
  id: "start-range",
  min: 0,
  max: 0,
  value: 0,
  disabled: true,
});
const endRange = el("input", {
  type: "range",
  id: "end-range",
  min: 0,
  max: 0,
  value: 0,
  disabled: true,
});
let likedTracks = [];
const colorCache = new Map();
const DEFAULT_SWATCH_COLOR = "#555";
const applyRangeBtn = el(
  "button",
  { id: "apply-range", onclick: applyCurrentRange },
  "Update filter"
);
const SONG_DISPLAY_LIMIT = 10;
startRange.addEventListener("input", () => ensureRangeOrder(true));
endRange.addEventListener("input", () => ensureRangeOrder(false));

function ensureRangeOrder(isStart) {
  const startValue = Number(startRange.value);
  const endValue = Number(endRange.value);
  if (isStart && startValue > endValue) {
    endRange.value = startValue;
  } else if (!isStart && endValue < startValue) {
    startRange.value = endValue;
  }
}
const filterSection = el(
  "section",
  { id: "date-filter" },
  el("h3", {}, "Filter liked songs by date range"),
  el(
    "p",
    { class: "filter-hint" },
    "Choose a start and end date to show the first 10 liked songs saved in that window."
  ),
  el(
    "div",
    { class: "slider-control" },
    el("label", { for: "start-range" }, "From"),
    startDateDisplay,
    startRange
  ),
  el(
    "div",
    { class: "slider-control" },
    el("label", { for: "end-range" }, "To"),
    endDateDisplay,
    endRange
  ),
  applyRangeBtn
);
const rangeStatus = el(
  "p",
  { id: "range-status" },
  "Load liked songs to enable the date range filter."
);

const SPIRAL_SIZE = 420;
let spiralInstance = null;
let spiralSegments = [];
let spiralTooltip = null;
let spiralDrawingCtx = null;

root.appendChild(header);
root.appendChild(info);
root.appendChild(loginBtn);
root.appendChild(loadBtn);
root.appendChild(logoutBtn);
root.appendChild(list);
root.insertBefore(filterSection, list);
root.insertBefore(rangeStatus, list);

function fetchLiked() {
  list.innerHTML = "Loading liked songs...";
  rangeStatus.textContent = "Loading liked tracks from liked_tracks.csv...";
  const csvPromise = fetch(CSV_URL, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          response.statusText || "liked_tracks.csv not available"
        );
      }
      const text = await response.text();
      return processTracksFromCsv(text);
    })
    .then((tracks) => tracks.sort((a, b) => a.added_ms - b.added_ms));

  const metaPromise = fetchRangeMetadata();

  Promise.all([csvPromise, metaPromise])
    .then(([tracks, rangeMeta]) => {
      likedTracks = tracks;
      if (!likedTracks.length) {
        list.innerHTML = "No liked songs saved yet.";
        rangeStatus.textContent =
          "The liked_tracks.csv file does not contain any songs yet.";
        startRange.disabled = true;
        endRange.disabled = true;
        return;
      }

      applyRangeMeta(rangeMeta);
      rangeStatus.textContent = `Loaded ${likedTracks.length} liked songs. Adjust the sliders and click "Update filter" to narrow the date range.`;
      displayFilteredTracks();
    })
    .catch((err) => {
      list.innerHTML = "Failed to load liked songs: " + err;
      rangeStatus.textContent =
        "Please log in, refresh liked tracks, and try again.";
      startRange.disabled = true;
      endRange.disabled = true;
    });
}

function applyCurrentRange() {
  if (!likedTracks.length) {
    rangeStatus.textContent = "Load liked songs before applying a date filter.";
    return;
  }
  // Make sure sliders aren't crossing in a weird way
  ensureRangeOrder(true);
  displayFilteredTracks();
}

function displayFilteredTracks() {
  if (!likedTracks.length) {
    list.innerHTML = "No liked songs loaded.";
    return;
  }
  const startValue = Number(startRange.value);
  const endValue = Number(endRange.value);
  const rangeStart = Math.min(startValue, endValue);
  const rangeEnd = Math.max(startValue, endValue);
  const filtered = likedTracks.filter(
    (track) => track.added_ms >= rangeStart && track.added_ms <= rangeEnd
  );
  renderSongList(filtered.slice(0, SONG_DISPLAY_LIMIT));
  const startText = formatDateValue(rangeStart);
  const endText = formatDateValue(rangeEnd);
  if (filtered.length === 0) {
    rangeStatus.textContent = `No liked songs between ${startText} and ${endText}.`;
  } else {
    rangeStatus.textContent = `Showing ${Math.min(
      filtered.length,
      SONG_DISPLAY_LIMIT
    )} of ${filtered.length} liked songs between ${startText} and ${endText}.`;
  }
  startDateDisplay.textContent = `Start: ${startText}`;
  endDateDisplay.textContent = `End: ${endText}`;
}

function renderSongList(tracks) {
  list.innerHTML = "";
  if (!tracks.length) {
    list.innerHTML = "No liked songs in that range.";
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
    for (let theta = startTheta; theta <= endTheta + resolution; theta += resolution) {
      const r = baseRadius + radiusScale * theta;
      const x = center + r * Math.cos(theta);
      const y = center + r * Math.sin(theta);
      if (points.length === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
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
          console.log("hover segment", hovered.track.name, hovered.track.artists);
          updateTooltip(hovered.track, x, y, container);
        } else {
          hideTooltip();
        }
      });
      canvasElement.addEventListener("mouseleave", () => {
        hideTooltip();
      });
    };
    p.draw = () => {
      p.background(255);
      p.strokeWeight(36);
      p.strokeCap(p.ROUND);
      p.strokeJoin(p.ROUND);
      p.noFill();
      spiralSegments.forEach((segment) => {
        p.stroke(segment.color);
        p.beginShape();
        segment.points.forEach((point) => {
          p.vertex(point.x, point.y);
        });
        p.endShape();
      });
    };
  });
}

const HOVER_DISTANCE = 20;

function findSegmentNear(x, y) {
  if (spiralDrawingCtx && spiralSegments.length) {
    return spiralSegments.find((segment) =>
      spiralDrawingCtx.isPointInStroke(segment.path, x, y)
    );
  }
  const thresholdSq = HOVER_DISTANCE * HOVER_DISTANCE;
  return spiralSegments.find((segment) =>
    segment.points.some((point) => {
      const dx = point.x - x;
      const dy = point.y - y;
      return dx * dx + dy * dy <= thresholdSq;
    })
  );
}

function updateTooltip(track, x, y, container) {
  if (!spiralTooltip) {
    return;
  }
  const content = `<strong>${track.name}</strong><br>${track.artists}<br><em>${track.album}</em>`;
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
  if (spiralTooltip) {
    spiralTooltip.style.display = "none";
  }
}

function getProminentColor(imageUrl) {
  if (!imageUrl) {
    return Promise.resolve(null);
  }
  if (colorCache.has(imageUrl)) {
    return Promise.resolve(colorCache.get(imageUrl));
  }
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
        const alpha = data[i + 3];
        if (alpha < 30) {
          continue;
        }
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

function formatDateValue(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return "—";
  }
  return dt.toISOString().split("T")[0];
}

function findDominantColor(pixels, k = 3, iterations = 6) {
  if (!pixels.length) {
    return DEFAULT_SWATCH_COLOR;
  }
  const centers = [];
  for (let i = 0; i < k; i += 1) {
    centers.push(pixels[(i * 3) % pixels.length]);
  }
  let lastBuckets = [];

  for (let iter = 0; iter < iterations; iter += 1) {
    const buckets = Array.from({ length: k }, () => []);
    pixels.forEach((pixel) => {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      centers.forEach((center, idx) => {
        const dist =
          Math.pow(pixel[0] - center[0], 2) +
          Math.pow(pixel[1] - center[1], 2) +
          Math.pow(pixel[2] - center[2], 2);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestIndex = idx;
        }
      });
      buckets[bestIndex].push(pixel);
    });

    buckets.forEach((bucket, idx) => {
      if (!bucket.length) {
        centers[idx] = pixels[Math.floor(Math.random() * pixels.length)];
        return;
      }
      const avg = bucket.reduce(
        (acc, pixel) => {
          acc[0] += pixel[0];
          acc[1] += pixel[1];
          acc[2] += pixel[2];
          return acc;
        },
        [0, 0, 0]
      );
      centers[idx] = [
        Math.round(avg[0] / bucket.length),
        Math.round(avg[1] / bucket.length),
        Math.round(avg[2] / bucket.length),
      ];
    });
    lastBuckets = buckets;
  }

  let largestBucket = 0;
  let dominantCenter = centers[0];
  lastBuckets.forEach((bucket, idx) => {
    if (bucket.length > largestBucket) {
      largestBucket = bucket.length;
      dominantCenter = centers[idx];
    }
  });
  return rgbToCss(dominantCenter);
}

function rgbToCss(rgb) {
  if (!rgb || rgb.length !== 3) {
    return DEFAULT_SWATCH_COLOR;
  }
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return [];
  }
  const headers = parseCsvLine(lines[0]);
  return lines
    .slice(1)
    .map((line) => {
      const values = parseCsvLine(line);
      if (values.length !== headers.length) {
        return null;
      }
      const row = {};
      headers.forEach((header, idx) => {
        row[header.trim()] = values[idx];
      });
      return row;
    })
    .filter(Boolean);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function parseDateToMs(value) {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function processTracksFromCsv(text) {
  const rows = parseCsv(text);
  return rows
    .map((row) => {
      const addedMs = parseDateToMs(row.added_at);
      return {
        ...row,
        added_at: row.added_at,
        added_ms: Number.isFinite(addedMs) ? addedMs : null,
      };
    })
    .filter((track) => Number.isFinite(track.added_ms));
}

function fetchRangeMetadata() {
  return fetch(RANGE_META_URL, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("range metadata not available");
      }
      return response.json();
    })
    .catch(() => null);
}
function initRangeFromMeta() {
  // Try to fetch the precomputed date range written at login
  fetchRangeMetadata()
    .then((rangeMeta) => {
      if (!rangeMeta) {
        // No metadata yet (user not logged in or no CSV)
        rangeStatus.textContent =
          "Log in and generate liked tracks to enable the date range filter.";
        startRange.disabled = true;
        endRange.disabled = true;
        return;
      }

      // Use metadata to configure sliders
      applyRangeMeta(rangeMeta);

      // After applyRangeMeta, the sliders' min/max/value are set.
      const startValue = Number(startRange.value);
      const endValue = Number(endRange.value);
      const startText = formatDateValue(startValue);
      const endText = formatDateValue(endValue);

      startDateDisplay.textContent = `Start: ${startText}`;
      endDateDisplay.textContent = `End: ${endText}`;
      rangeStatus.textContent =
        'Date range loaded. Click "Load Liked Songs" to fetch and filter your tracks.';
    })
    .catch(() => {
      // If range metadata fetch fails (e.g. file missing), keep defaults
      rangeStatus.textContent =
        "Log in and generate liked tracks to enable the date range filter.";
      startRange.disabled = true;
      endRange.disabled = true;
    });
}

function applyRangeMeta(rangeMeta) {
  const trackMin = likedTracks[0]?.added_ms ?? null;
  const trackMax = likedTracks[likedTracks.length - 1]?.added_ms ?? null;
  const metaMin = parseDateToMs(rangeMeta?.earliest);
  const metaMax = parseDateToMs(rangeMeta?.latest);
  let minValue = metaMin ?? trackMin;
  let maxValue = metaMax ?? trackMax;
  if (minValue == null || maxValue == null) {
    startRange.disabled = true;
    endRange.disabled = true;
    return;
  }
  if (maxValue < minValue) {
    [minValue, maxValue] = [maxValue, minValue];
  }
  const totalRange = Math.max(1, maxValue - minValue);
  const sliderStep = Math.max(1, Math.floor(totalRange / 50));
  startRange.min = minValue;
  startRange.max = maxValue;
  startRange.step = sliderStep;
  endRange.min = minValue;
  endRange.max = maxValue;
  endRange.step = sliderStep;
  startRange.value = minValue;
  endRange.value = maxValue;
  startRange.disabled = false;
  endRange.disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  initRangeFromMeta();
  // You can also auto-load tracks here if you want:
  // fetchLiked();
});
