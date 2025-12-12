("""Simple Flask backend to authenticate with Spotify and return user's saved/top tracks.

Environment variables required:
- SPOTIFY_CLIENT_ID
- SPOTIFY_CLIENT_SECRET
- SPOTIFY_REDIRECT_URI (optional, defaults to http://127.0.0.1:8080)
- FLASK_SECRET_KEY (optional)

Run: `FLASK_APP=data.py flask run` from the `spotify_data_art` folder.
""")
import base64
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
def _parse_top_tracks_items(items, start_rank=1, feature_map=None):
    rows = []
    rank = start_rank
    for it in items:
        feature = feature_map.get(it.get('id')) if feature_map else None
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
            'image': album_image,
            'external_url': (it.get('external_urls') or {}).get('spotify'),
            'popularity': it.get('popularity'),
            'energy': feature.get('energy') if feature else None,
            'tempo': feature.get('tempo') if feature else None,
            'preview_url': it.get('preview_url'),
            'album_release_date': album.get('release_date'),
            'kind': 'track',
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


def _parse_top_artists_items(items, start_rank=1):
    rows = []
    rank = start_rank
    for it in items:
        images = it.get('images') or []
        rows.append({
            'rank': rank,
            'name': it.get('name'),
            'genres': it.get('genres') or [],
            'image': images[0]['url'] if images else None,
            'external_url': (it.get('external_urls') or {}).get('spotify'),
            'popularity': it.get('popularity'),
            'kind': 'artist',
        })
        rank += 1
    return rows


def _fetch_top_artists_page(headers, offset, limit=50, time_range='long_term'):
    params = {
        'limit': limit,
        'offset': offset,
        'time_range': time_range,
    }
    r = requests.get(f"{API_BASE}/me/top/artists", headers=headers, params=params)
    if r.status_code != 200:
        print(f"Failed to fetch top artists page offset={offset}: {r.status_code} {r.text}")
        return [], None
    data = r.json()
    return data.get('items', []), data.get('total')


RECCOBEATS_BASE = "https://api.reccobeats.com"

# Simple in-memory cache: spotify_id -> { "tempo": ..., "energy": ..., "_raw": ... }
AUDIO_FEATURE_CACHE = {}


def _fetch_audio_features(track_ids):
    """
    Given a list of Spotify track IDs, fetch tempo/energy via ReccoBeats.

    Steps:
      1. Use /v1/track?ids=... to map Spotify IDs -> Recco IDs
      2. For Recco IDs that we *don't* already have cached, call
         /v1/track/{reccoId}/audio-features in parallel.
      3. Return a dict keyed by spotify_id -> {tempo, energy, _raw}
    """
    if not track_ids:
        return {}

    # Dedup while preserving order
    seen = set()
    unique_spotify_ids = []
    for tid in track_ids:
        if tid and tid not in seen:
            seen.add(tid)
            unique_spotify_ids.append(tid)

    # ------------- STEP 1: use Recco /v1/track to get Recco IDs -------------
    # Some may already be completely cached; we still need their Recco IDs
    # but they may not show up again if we don't request them.
    # We ask Recco about *all* track IDs, but they might return fewer.
    params = [("ids", tid) for tid in unique_spotify_ids]
    try:
        r = requests.get(
            f"{RECCOBEATS_BASE}/v1/track",
            params=params,
            headers={"Accept": "application/json"},
            timeout=8,
        )
        print("DEBUG Recco /v1/track URL:", r.url, "status:", r.status_code)
    except Exception as e:
        print("ERROR calling Recco /v1/track:", e)
        return {}

    if r.status_code != 200:
        print("ERROR Recco /v1/track:", r.status_code, r.text[:200])
        return {}

    try:
        data = r.json()
    except Exception as e:
        print("ERROR parsing Recco /v1/track JSON:", e)
        return {}

    content = data.get("content") or []
    if content:
        try:
            print("DEBUG Recco /v1/track first item:", json.dumps(content[0], indent=2)[:500])
        except Exception:
            pass

    # Build mapping spotify_id -> recco_id (using href field)
    spotify_to_recco = {}
    for item in content:
        recco_id = item.get("id")
        href = item.get("href") or ""
        # href looks like https://open.spotify.com/track/<spotify_id>
        spotify_id = None
        if "open.spotify.com/track/" in href:
            spotify_id = href.rsplit("/", 1)[-1].split("?")[0]

        if spotify_id and recco_id:
            spotify_to_recco[spotify_id] = recco_id

    print("DEBUG spotify->recco mapping:", spotify_to_recco)

    # If Recco doesn't know about some tracks, that's fine – we skip them.
    missing_spotify_ids = [
        tid for tid in unique_spotify_ids if tid not in spotify_to_recco
    ]
    for tid in missing_spotify_ids:
        print(f"DEBUG no Recco id for Spotify track {tid}")

    # ------------- STEP 2: decide which tracks actually need network calls -------------
    # We might already have cached audio features for some Spotify IDs.
    spotify_ids_needing_fetch = []
    for sp_id, recco_id in spotify_to_recco.items():
        if sp_id not in AUDIO_FEATURE_CACHE:
            spotify_ids_needing_fetch.append(sp_id)

    # Edge case: everything is cached already
    if not spotify_ids_needing_fetch:
        print("DEBUG ReccoBeats: all requested tracks already cached")
        # Build map from cache only for the requested track_ids
        return {
            tid: AUDIO_FEATURE_CACHE[tid]
            for tid in track_ids
            if tid in AUDIO_FEATURE_CACHE
        }

    # ------------- STEP 3: fetch /audio-features in parallel for missing ones -------------

    def fetch_one_audio_features(recco_id, sp_id):
        url = f"{RECCOBEATS_BASE}/v1/track/{recco_id}/audio-features"
        try:
            resp = requests.get(
                url,
                headers={"Accept": "application/json"},
                timeout=5,
            )
        except Exception as e:
            print(f"ERROR calling ReccoBeats audio-features for {sp_id} ({recco_id}): {e}")
            return None

        if resp.status_code != 200:
            print(
                f"ReccoBeats audio-features failed for {sp_id} ({recco_id}): "
                f"{resp.status_code} {resp.text[:200]}"
            )
            return None

        try:
            return resp.json()
        except Exception as e:
            print(f"ERROR parsing ReccoBeats audio-features JSON for {sp_id}: {e}")
            return None

    # Parallel fetch
    future_to_spotify = {}
    with ThreadPoolExecutor(max_workers=5) as executor:
        for sp_id in spotify_ids_needing_fetch:
            recco_id = spotify_to_recco.get(sp_id)
            if not recco_id:
                continue
            fut = executor.submit(fetch_one_audio_features, recco_id, sp_id)
            future_to_spotify[fut] = sp_id

        for fut in as_completed(future_to_spotify):
            sp_id = future_to_spotify[fut]
            result = fut.result()
            if not result:
                continue

            # Adjust field names based on actual Recco JSON structure
            tempo = (
                result.get("tempo")
                or result.get("bpm")
                or result.get("BPM")
            )
            energy = (
                result.get("energy")
                or result.get("Energy")
            )

            AUDIO_FEATURE_CACHE[sp_id] = {
                "tempo": tempo,
                "energy": energy,
                "_raw": result,
            }

    # ------------- STEP 4: build final map for *this* call only -------------
    feature_map = {}
    for tid in track_ids:
        if tid in AUDIO_FEATURE_CACHE:
            feature_map[tid] = AUDIO_FEATURE_CACHE[tid]

    print("DEBUG ReccoBeats audio-features parsed count:", len(feature_map))
    return feature_map


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

    # read time_range from query (?time_range=short_term|medium_term|long_term)
    requested_time_range = request.args.get('time_range', 'long_term')
    if requested_time_range not in ('short_term', 'medium_term', 'long_term'):
        requested_time_range = 'long_term'

    feature_map = {}
    try:
        items, _ = _fetch_top_tracks_page(
            headers,
            offset=spotify_offset,
            limit=TOP_TRACKS_WINDOW,
            time_range=requested_time_range,
        )

        track_ids = [it.get('id') for it in items if it.get('id')]
        print("DEBUG top_tracks: got", len(items), "items, first ID:", track_ids[0] if track_ids else None)
        print("DEBUG top_tracks track_ids:", track_ids)
        feature_map = _fetch_audio_features(track_ids)
    except Exception as err:
        print("ERROR in /top_tracks while fetching audio features:", err)
        feature_map = {}  # gracefully fall back


    rows = _parse_top_tracks_items(
        items,
        start_rank=start_rank,
        feature_map=feature_map
    )

    # peek at the first parsed row
    if rows:
        print("DEBUG first top_tracks row:", json.dumps(rows[0], indent=2))

    return jsonify({
        'items': rows,
        'min_rank': start_rank,
        'max_rank': start_rank + len(rows) - 1,
        'total': len(rows),
    })



@app.route('/top_artists')
def top_artists():
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

        # read time_range from query (?time_range=short_term|medium_term|long_term)
    requested_time_range = request.args.get('time_range', 'long_term')
    if requested_time_range not in ('short_term', 'medium_term', 'long_term'):
        requested_time_range = 'long_term'

    try:
        items, _ = _fetch_top_artists_page(
            headers,
            offset=spotify_offset,
            limit=TOP_TRACKS_WINDOW,
            time_range=requested_time_range,
        )

    except Exception as err:
        return jsonify({'error': 'spotify_api_failed', 'details': str(err)}), 500

    rows = _parse_top_artists_items(items, start_rank=start_rank)
    return jsonify({
        'items': rows,
        'min_rank': start_rank,
        'max_rank': start_rank + len(rows) - 1,
        'total': len(rows),
    })




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


@app.route('/logout')
def logout():
    session.clear()
    for f in ("liked_tracks.csv", "liked_tracks_range.json", "top_tracks.csv", "top_tracks_range.json"):
        try:
            os.remove(f)
        except OSError:
            pass
    return redirect('/')


if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=8080)
