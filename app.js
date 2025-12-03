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
const SONG_DISPLAY_LIMIT = 10;
startRange.addEventListener("input", () => handleSliderInput(true));
endRange.addEventListener("input", () => handleSliderInput(false));
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
  )
);
const rangeStatus = el(
  "p",
  { id: "range-status" },
  "Load liked songs to enable the date range filter."
);

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
        throw new Error(response.statusText || "liked_tracks.csv not available");
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
      rangeStatus.textContent = `Loaded ${likedTracks.length} liked songs. Use the sliders to narrow the date range.`;
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

function handleSliderInput(isStart) {
  if (!likedTracks.length) {
    return;
  }
  const startValue = Number(startRange.value);
  const endValue = Number(endRange.value);
  if (isStart && startValue > endValue) {
    endRange.value = startValue;
  } else if (!isStart && endValue < startValue) {
    startRange.value = endValue;
  }
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
  const ul = document.createElement("ul");
  tracks.forEach((item) => {
    const li = document.createElement("li");
    const img = item.album_image
      ? el("img", { src: item.album_image, width: 64, height: 64 })
      : null;
    const title = el("strong", {}, item.name);
    const meta = document.createElement("div");
    meta.appendChild(
      document.createTextNode(item.artists + " — " + item.album)
    );
    if (item.external_url) {
      const a = el(
        "a",
        { href: item.external_url, target: "_blank" },
        "Open on Spotify"
      );
      meta.appendChild(document.createTextNode(" "));
      meta.appendChild(a);
    }
    if (img) li.appendChild(img);
    li.appendChild(title);
    li.appendChild(document.createElement("br"));
    li.appendChild(meta);
    ul.appendChild(li);
  });
  list.appendChild(ul);
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

// Optionally auto-load on start
// fetchLiked();
