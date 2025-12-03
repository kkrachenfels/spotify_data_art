("""Simple Flask backend to authenticate with Spotify and return user's saved tracks.

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
SCOPE = 'user-library-read'

print(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, REDIRECT_URI)

AUTH_URL = 'https://accounts.spotify.com/authorize'
TOKEN_URL = 'https://accounts.spotify.com/api/token'
API_BASE = 'https://api.spotify.com/v1'


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

def _fetch_all_liked_tracks(headers):
	"""
	Fetch all saved tracks (liked songs) for the current user.
	Uses Spotify's pagination over /me/tracks.
	"""
	items = []
	url = f"{API_BASE}/me/tracks"
	params = {'limit': 50}  # max allowed by Spotify

	while url:
		r = requests.get(url, headers=headers, params=params)
		if r.status_code != 200:
			print("Failed to fetch liked tracks:", r.status_code, r.text)
			break

		data = r.json()
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

		# Spotify gives a full URL for the next page, or None
		url = data.get('next')
		# params should be None when using the absolute 'next' URL
		params = None

	# sort by added_at (Spotify returns ISO 8601, so string sort is fine)
	items.sort(key=lambda x: x['added_at'] or '')
	return items

def _parse_tracks_page(data):
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
	"""
	Fetch a single page of liked tracks with a given offset.
	"""
	params = {'limit': limit, 'offset': offset}
	r = requests.get(f"{API_BASE}/me/tracks", headers=headers, params=params)
	if r.status_code != 200:
		print(f"Failed to fetch liked tracks page at offset {offset}: {r.status_code} {r.text}")
		return []
	data = r.json()
	return _parse_tracks_page(data), data.get('total')


def _fetch_all_liked_tracks(headers, max_workers=8):
	"""
	Fetch all liked tracks using parallel requests over /me/tracks with offset/limit.
	"""
	limit = 50

	# First page: get initial items + total count
	first_items, total = _fetch_liked_page(headers, offset=0, limit=limit)
	if total is None:
		total = len(first_items)

	items = list(first_items)

	# Compute remaining offsets
	offsets = list(range(limit, total, limit))
	if not offsets:
		# All items fit in the first page
		items.sort(key=lambda x: x['added_at'] or '')
		return items

	def worker(offset):
		page_items, _ = _fetch_liked_page(headers, offset=offset, limit=limit)
		return offset, page_items

	# Fan out in parallel
	with ThreadPoolExecutor(max_workers=max_workers) as executor:
		futures = {executor.submit(worker, offset): offset for offset in offsets}
		for future in as_completed(futures):
			offset, page_items = future.result()
			items.extend(page_items)

	# Sort by added_at
	items.sort(key=lambda x: x['added_at'] or '')
	return items


def _save_liked_to_csv(items, filename="liked_tracks.csv"):
	"""
	Save liked tracks to a CSV file in the current folder.
	"""
	fieldnames = ['name', 'artists', 'album', 'album_image', 'external_url', 'added_at']
	with open(filename, 'w', newline='', encoding='utf-8') as f:
		writer = csv.DictWriter(f, fieldnames=fieldnames)
		writer.writeheader()
		writer.writerows(items)

	print(f"Saved {len(items)} liked tracks to {filename}")
	_save_range_metadata(items)


def _save_range_metadata(items, filename="liked_tracks_range.json"):
	"""
	Store earliest and latest added_at timestamps alongside the CSV.
	"""
	dates = [item.get('added_at') for item in items if item.get('added_at')]
	if dates:
		earliest = min(dates)
		latest = max(dates)
	else:
		earliest = None
		latest = None
	meta = {
		'earliest': earliest,
		'latest': latest
	}
	with open(filename, 'w', encoding='utf-8') as f:
		json.dump(meta, f)


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
	# Spotify may or may not return a new refresh token
	if tok.get('refresh_token'):
		session['refresh_token'] = tok.get('refresh_token')
	return True


@app.route('/')
def index():
	# serve the static index.html in this folder
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

	# Fetch all liked tracks in parallel and save CSV
	api_headers = _auth_header()
	if api_headers:
		all_liked = _fetch_all_liked_tracks(api_headers, max_workers=8)
		_save_liked_to_csv(all_liked)

	return redirect('/')



@app.route('/liked')
def liked():
	# return the user's 10 saved tracks (liked songs)
	if 'access_token' not in session:
		return jsonify({'error': 'not_authenticated'}), 401
	if _is_token_expired():
		ok = _refresh_token()
		if not ok:
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
	os.remove("liked_tracks.csv")
	os.remove("liked_tracks_range.json")
	return redirect('/')


if __name__ == '__main__':
	app.run(debug=True, host='127.0.0.1', port=8080)

