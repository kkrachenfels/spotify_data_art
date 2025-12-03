("""Simple Flask backend to authenticate with Spotify and return user's saved/top tracks.

Environment variables required:
- SPOTIFY_CLIENT_ID
- SPOTIFY_CLIENT_SECRET
- SPOTIFY_REDIRECT_URI (optional, defaults to http://localhost:8080)
- FLASK_SECRET_KEY (optional)

Run: `FLASK_APP=data.py flask run` from the `spotify_data_art` folder.
""")
import base64
import csv
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from config import CLIENT_ID, CLIENT_SECRET, REDIRECT_URI
from flask import (Flask, jsonify, redirect, request, send_from_directory,
                   session)

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', os.urandom(24))

SPOTIFY_CLIENT_ID = CLIENT_ID
SPOTIFY_CLIENT_SECRET = CLIENT_SECRET
REDIRECT_URI = REDIRECT_URI
# Include user-top-read for /me/top/*; keep user-library-read for liked route.
SCOPE = 'user-top-read user-library-read'

print(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, REDIRECT_URI)

AUTH_URL = 'https://accounts.spotify.com/authorize'
TOKEN_URL = 'https://accounts.spotify.com/api/token'
API_BASE = 'https://api.spotify.com/v1'


# ------------------------- helpers -------------------------

def _auth_header():
    token = session.get('access_token')
    if not token:
        return None
    return {'Authorization': f'Bearer {token}'}


def _is_token_expired():
    expires_at = session.get('expires_at')
    if not expires_at:
        return True
    return time.time() > expires_at


def _refresh_token():
    refresh_token = session.get('refresh_token')
    if not refresh_token:
        return False
    payload = {
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
    }
    auth = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()
    headers = {'Authorization': f'Basic {auth}'}
    r = requests.post(TOKEN_URL, data=payload, headers=headers)
    if r.status_code != 200:
        return False
    tok = r.json()
    session['access_token'] = tok.get('access_token')
    expires_in = tok.get('expires_in', 3600)
    session['expires_at'] = time.time() + int(expires_in)
    if tok.get('refresh_token'):
        session['refresh_token'] = tok.get('refresh_token')
    return True


# ---------------------- TOP TRACKS (long_term) ----------------------

def _parse_top_tracks_items(items, start_rank=1):
    """Convert /me/top/tracks items to our CSV rows, assigning rank starting at start_rank."""
    rows = []
    rank = start_rank
    for it in items:
        artists = ', '.join(a.get('name') for a in it.get('artists', []))
        album = it.get('album', {}) or {}
        images = album.get('images', [])
        album_image = images[0]['url'] if images else None
        rows.append({
            'rank': rank,
            'name': it.get('name'),
            'artists': artists,
            'album': album.get('name'),
            'album_image': album_image,
            'external_url': (it.get('external_urls') or {}).get('spotify'),
            'popularity': it.get('popularity'),
            'album_release_date': album.get('release_date'),
        })
        rank += 1
    return rows


def _fetch_top_tracks_page(headers, offset, limit=50, time_range='long_term'):
    params = {
        'limit': limit,
        'offset': offset,
        'time_range': time_range,
    }
    r = requests.get(f"{API_BASE}/me/top/tracks", headers=headers, params=params)
    if r.status_code != 200:
        print(f"Failed to fetch top tracks page offset={offset}: {r.status_code} {r.text}")
        return [], None
    data = r.json()
    return data.get('items', []), data.get('total')


def _fetch_all_top_tracks(headers, time_range='long_term', max_workers=8):
    """
    Fetch ALL top tracks for the given time_range using offset pagination.
    Uses the first page to read `total`, then fetches remaining pages in parallel.
    Falls back to pure sequential walk if `total` is missing.
    """
    limit = 50

    # First page (offset 0) – also gives us `total` in most cases
    first_items, total = _fetch_top_tracks_page(headers, offset=0, limit=limit, time_range=time_range)
    rows = _parse_top_tracks_items(first_items, start_rank=1)

    if not first_items:
        print(f"No top tracks returned for time_range={time_range}")
        return rows

    # If Spotify didn't return `total`, fall back to the sequential "walk until empty" behavior
    if total is None:
        print("No `total` in response; falling back to sequential pagination.")
        offset = limit
        global_rank = 1 + len(first_items)
        while True:
            items, _ = _fetch_top_tracks_page(headers, offset=offset, limit=limit, time_range=time_range)
            if not items:
                break
            page_rows = _parse_top_tracks_items(items, start_rank=global_rank)
            rows.extend(page_rows)
            global_rank += len(items)
            offset += limit
        print(f"Fetched {len(rows)} top tracks for time_range={time_range} (sequential fallback)")
        return rows

    # Compute remaining offsets based on `total`
    offsets = list(range(limit, total, limit))
    if not offsets:
        print(f"Fetched {len(rows)} top tracks for time_range={time_range} (single page)")
        return rows

    def worker(off):
        items, _ = _fetch_top_tracks_page(headers, offset=off, limit=limit, time_range=time_range)
        # Rank for this page starts at offset+1
        return _parse_top_tracks_items(items, start_rank=off + 1)

    # Fetch remaining pages in parallel
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(worker, off): off for off in offsets}
        for fut in as_completed(futures):
            page_rows = fut.result()
            rows.extend(page_rows)

    # Ensure rows are globally ordered by rank
    rows.sort(key=lambda r: r['rank'])
    print(f"Fetched {len(rows)} top tracks for time_range={time_range} (parallel)")
    return rows


def _save_top_to_csv(rows, filename="top_tracks.csv"):
    fieldnames = [
        'rank',
        'name',
        'artists',
        'album',
        'album_image',
        'external_url',
        'popularity',
        'album_release_date',
    ]
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved {len(rows)} top tracks to {filename}")


def _save_top_range_meta(rows, filename="top_tracks_range.json"):
    total = len(rows)
    meta = {
        'min_rank': 1 if total else 0,
        'max_rank': total,
        'time_range': 'long_term',
    }
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(meta, f)


# ---------------------- LIKED SONGS (kept for /liked route) ----------------------

def _parse_liked_page(data):
    items = []
    for it in data.get('items', []):
        track = it.get('track', {})
        artists = ', '.join([a.get('name') for a in track.get('artists', [])])
        album_images = track.get('album', {}).get('images', [])
        album_image = album_images[0]['url'] if album_images else None
        items.append({
            'name': track.get('name'),
            'artists': artists,
            'album': track.get('album', {}).get('name'),
            'album_image': album_image,
            'external_url': track.get('external_urls', {}).get('spotify'),
            'added_at': it.get('added_at')
        })
    return items


def _fetch_liked_page(headers, offset, limit=50):
    params = {'limit': limit, 'offset': offset}
    r = requests.get(f"{API_BASE}/me/tracks", headers=headers, params=params)
    if r.status_code != 200:
        print(f"Failed to fetch liked tracks page at offset {offset}: {r.status_code} {r.text}")
        return [], None
    data = r.json()
    return _parse_liked_page(data), data.get('total')


# ------------------------- CSV/meta for liked (kept) -------------------------

def _save_liked_to_csv(items, filename="liked_tracks.csv"):
    fieldnames = ['name', 'artists', 'album', 'album_image', 'external_url', 'added_at']
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(items)
    print(f"Saved {len(items)} liked tracks to {filename}")
    _save_range_metadata(items)


def _save_range_metadata(items, filename="liked_tracks_range.json"):
    dates = [item.get('added_at') for item in items if item.get('added_at')]
    if dates:
        earliest = min(dates)
        latest = max(dates)
    else:
        earliest = None
        latest = None
    meta = {'earliest': earliest, 'latest': latest}
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(meta, f)


# --------------------------- routes ---------------------------

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/login')
def login():
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        return 'Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET', 500
    params = {
        'client_id': SPOTIFY_CLIENT_ID,
        'response_type': 'code',
        'redirect_uri': REDIRECT_URI,
        'scope': SCOPE,
        'show_dialog': 'true'
    }
    url = requests.Request('GET', AUTH_URL, params=params).prepare().url
    return redirect(url)


@app.route('/callback')
def callback():
    code = request.args.get('code')
    error = request.args.get('error')
    if error:
        return f'Error: {error}'
    if not code:
        return 'No code provided', 400

    payload = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': REDIRECT_URI,
    }
    auth = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()
    headers = {'Authorization': f'Basic {auth}'}
    r = requests.post(TOKEN_URL, data=payload, headers=headers)
    if r.status_code != 200:
        return f'Token exchange failed: {r.text}', 500

    tok = r.json()
    session['access_token'] = tok.get('access_token')
    session['refresh_token'] = tok.get('refresh_token')
    expires_in = tok.get('expires_in', 3600)
    session['expires_at'] = time.time() + int(expires_in)

    # ---- Fetch ALL top tracks (long_term) and write CSV + meta IF not present ----
    api_headers = _auth_header()
    if api_headers:
        csv_exists = os.path.exists("top_tracks.csv")
        meta_exists = os.path.exists("top_tracks_range.json")

        if not (csv_exists and meta_exists):
            top_rows = _fetch_all_top_tracks(api_headers, time_range='long_term', max_workers=8)
            _save_top_to_csv(top_rows)
            _save_top_range_meta(top_rows)
        else:
            print("top_tracks.csv/top_tracks_range.json already exist; skipping refetch.")

    return redirect('/')



@app.route('/liked')
def liked():
    if 'access_token' not in session:
        return jsonify({'error': 'not_authenticated'}), 401
    if _is_token_expired():
        if not _refresh_token():
            return jsonify({'error': 'token_refresh_failed'}), 401
    headers = _auth_header()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    params = {'limit': 10}
    r = requests.get(f"{API_BASE}/me/tracks", headers=headers, params=params)
    if r.status_code != 200:
        return jsonify({'error': 'spotify_api_failed', 'details': r.text}), r.status_code
    data = r.json()
    items = []
    for it in data.get('items', []):
        track = it.get('track', {})
        artists = ', '.join([a.get('name') for a in track.get('artists', [])])
        album_images = track.get('album', {}).get('images', [])
        album_image = album_images[0]['url'] if album_images else None
        items.append({
            'name': track.get('name'),
            'artists': artists,
            'album': track.get('album', {}).get('name'),
            'album_image': album_image,
            'external_url': track.get('external_urls', {}).get('spotify'),
            'added_at': it.get('added_at')
        })
    return jsonify({'items': items})


@app.route('/logout')
def logout():
    session.clear()
    # best-effort cleanup (you *don't* need this for overwriting – it's just tidy)
    for f in ("liked_tracks.csv", "liked_tracks_range.json", "top_tracks.csv", "top_tracks_range.json"):
        try:
            os.remove(f)
        except OSError:
            pass
    return redirect('/')


if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=8080)
