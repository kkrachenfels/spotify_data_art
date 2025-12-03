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
const info = el("p", {}, 'Click "Login with Spotify" to connect your account.');
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

root.appendChild(header);
root.appendChild(info);
root.appendChild(loginBtn);
root.appendChild(loadBtn);
root.appendChild(logoutBtn);
root.appendChild(list);

function fetchLiked() {
  list.innerHTML = "Loading...";
  fetch("/liked")
    .then(async (r) => {
      if (r.status === 401) {
        list.innerHTML = "Not authenticated. Please log in first.";
        return;
      }
      if (!r.ok) {
        const txt = await r.text();
        list.innerHTML = "Error: " + txt;
        return;
      }
      return r.json();
    })
    .then((data) => {
      if (!data) return;
      list.innerHTML = "";
      if (!data.items || data.items.length === 0) {
        list.innerHTML = "No liked songs found.";
        return;
      }
      const ul = document.createElement("ul");
      data.items.forEach((item) => {
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
    })
    .catch((err) => {
      list.innerHTML = "Fetch failed: " + err;
    });
}

// Optionally auto-load on start
// fetchLiked();
