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
MAX_TOP_TRACKS = 100
TOP_TRACKS_WINDOW = 10


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


@app.route('/top_tracks')
def top_tracks():
    if 'access_token' not in session:
        return jsonify({'error': 'not_authenticated'}), 401
    if _is_token_expired():
        if not _refresh_token():
            return jsonify({'error': 'token_refresh_failed'}), 401
    headers = _auth_header()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401

    try:
        requested_start = int(request.args.get('offset', 1))
    except (ValueError, TypeError):
        requested_start = 1
    max_start = max(1, MAX_TOP_TRACKS - TOP_TRACKS_WINDOW + 1)
    start_rank = max(1, min(requested_start, max_start))
    spotify_offset = max(0, start_rank - 1)

    try:
        items, _ = _fetch_top_tracks_page(
            headers,
            offset=spotify_offset,
            limit=TOP_TRACKS_WINDOW,
            time_range='long_term'
        )
    except Exception as err:
        return jsonify({'error': 'spotify_api_failed', 'details': str(err)}), 500

    rows = _parse_top_tracks_items(items, start_rank=start_rank)
    return jsonify({
        'items': rows,
        'min_rank': start_rank,
        'max_rank': start_rank + len(rows) - 1,
        'total': len(rows),
    })


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
