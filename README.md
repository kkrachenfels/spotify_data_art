# Spotify Data-Based Generative Artwork

### What we plan to build:

Use Spotify data and different trends and filters to view statistics about a user and use the different filter/query/trend parameters to create a series of generative works

### Technical Considerations:

Use Spotify API and javascript to get user listening data and preprocess it.

### Design Considerations:

- User experience - provide different filters (e.g. time window, metric such as most played artists, songs, or albums over a period, tempo (BPM), number of songs listened or minutes listened per period)
- Aesthetic qualities - use album art or color palettes generated from album art to build the image, and use sonic qualities such as bpm or “energy” to characterize the texture of parts of the image

### Successful Result

We would want to have a fully functioning deployed website on which users are able to log in and link to their Spotify account, filter their data and see creative generative works based on the data they selected to view

### Potential biggest challenges:

Making the design easy to understand/intuitive considering all the different filters and functionalities we want to incorporate.

### Choosing the final set of filtering parameters

Integrating P5 (and maybe potentially other js libraries) to make the design in line with classic Spotify “design.”

## Local run instructions (development)

To try the Spotify login + liked-songs demo locally:

- Create a Spotify app at https://developer.spotify.com/dashboard and set its Redirect URI to `http://localhost:8080/callback` (or set `SPOTIFY_REDIRECT_URI` to your callback URL).
- In the `spotify_data_art` folder set environment variables:

```bash
export SPOTIFY_CLIENT_ID=your_client_id
export SPOTIFY_CLIENT_SECRET=your_client_secret
export FLASK_SECRET_KEY=a_random_secret
# optionally: export SPOTIFY_REDIRECT_URI=http://localhost:8080/
```

- Install Python dependencies and run the Flask app:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd spotify_data_art
FLASK_APP=data.py flask run
```

- Open `http://localhost:8080` in your browser. Click "Login with Spotify", authorize the app, then click "Load Liked Songs" to fetch your 10 most recently saved songs.

Note: This demo stores access tokens in the Flask session cookie for simplicity; do not use this approach for production apps without appropriate security review.

env:

```conda env create -f env.yml
conda activate spotify-backend
```
