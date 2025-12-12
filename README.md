# Spotify Data-Based Generative Artwork

## Local run instructions (development)

To try the Spotify login + liked-songs demo locally:

- Create a Spotify app at https://developer.spotify.com/dashboard and set its Redirect URI to `http://127.0.0.1:8080/callback` (or set `SPOTIFY_REDIRECT_URI` to your callback URL).
- In the `spotify_data_art` folder set environment variables:

```bash
export SPOTIFY_CLIENT_ID=your_client_id
export SPOTIFY_CLIENT_SECRET=your_client_secret
export FLASK_SECRET_KEY=a_random_secret
# optionally: export SPOTIFY_REDIRECT_URI=http://127.0.0.1:8080/
```

- Install Python dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd spotify_data_art
```

- Finally, to run the app itself (if you used an alternative callback port rather than 8080, specify that one instead):

```bash
FLASK_APP=data.py flask run --port=8080
```

- Then open `http://127.0.0.1:8080` in your browser. Click "Login with Spotify", authorize the app, then you should be able to use filters and run different visualizations. 


## Report and Retrospective

### Original project goal
Our original project goal was fairly open-ended, with the our main idea involving use of Spotify listening data. We wanted to look at different trends and filters for listening statistics, using those different filtering and querying parameters to create data visualization that could also serve as generative artwork. 

We originally drew inspiration from Spotify's yearly "wrapped" as well as existing third-party generative Spotify tools and features, such as one project that creates a flower visualization from top tracks in the past month, and a visualization that draws the track's audio waveform in the shape of a heart. 

In terms of the types of filters to use for building the visualizations, we originally wanted to use time window and category such as most played artist, songs, albums, genres, etc. We also were interested in metrics such as number of songs or minutes listened to over a period of time, but the metric we were most interested in was BPM/tempo. We were sure we wanted to incorporate tempo as a way to make the visualizations more dynamic or animated, to keep the data visualization more interesting and not static (drawing inspiration from our project 2, where we had to make interactive data visualizations). 

For the visualization we wanted color to play a large role too. Originally we planned to create visualizations with the original album/artist art, but decided (also based on Spotify's terms of service and use) to use the dominant colors in the album and artist art instead. For the UI, we wanted to mostly align this with Spotify's overall look, since we originally planned to deploy this publically.

Finally, we also wanted the visualization to still be informative while being fun and dynamic. Since both of us use Spotify as our primary music streaming service, we were curious about our own statistics, so we wanted to be able to get sufficient information from the visualization in addition to being able to create different images.


### Final result
The final application takes user request parameters for selection between top tracks or top artists, looks at data over various periods of time (long term - the last year, medium term - the last 6 months, and short term - the last month), and allows the user to select between groupings of 10 tracks or artists at a given time. For example, the user could ask to look at their top ranked #21-30 artists over the last 6 months. 

We went through quite a few iterations of type of visualization before settling on our final view. For this we drew inspiration from a book we had both read from our childhood, the Hungry Caterpillar. We built a caterpillar from vinyls, and have the colors of the vinyls be based on album/artist color. We also had the vinyls' angular rotation be based on BPM for tracks, and popularity for artists.

Since the vinyl caterpillar wasn't as colorful as we liked, we also created more generative-style backgrounds to accompany it. The backgrounds are wave-based; for each selected range of top tracks or artists, a background wave with the dominant art color for that album/artist is created. We allow the users to select between wave shape (sine, square, saw, triangle) and vary wave opacity as this creates different shades when waves are layered atop each other. We also add labels to the background wave, and these have toggleable visibility. The wave amplitude and frequencies are determined by the rank of the track/artist (increasing both parameters with a lower/larger rank) to initially look cohesive, and then the speed of the waves is determined primarily by the BPM or popularity of the associated track/artist. This allows the waves to go out of phase after some period of time and create a more dynamic/generative background.

When the user initially submits a new filter, we send queries to the Spotify and other external APIs, parse the response and run K-means to extract colors, and then build the wave background first. Then the user can click the "eat" button to create the vinyl caterpillar. For the caterpillar animation, we generate a fruit for each track/artist, pulse it based on BPM/popularity until it appears to reach the caterpillar's mouth, at which point the fruit is 'consumed' and a new vinyl is added to the train. This proceeds until the range of 10 tracks/artists is reached and the full caterpillar is built. 


### Challenges and limitations
Since we worked as a pair, we wanted to mitigate challenges when writing code itself. We went with an object oriented design to better isolate each element of the project in its own class or file, splitting out Vinyl, Fruit, CaterpillarSprite, background generation, and K-Means color picking into their own files. That way this allowed us to have work sessions where we worked together but pushed changes to separate files to better avoid push/merge conflicts. However, when refining the app and making edits, we worked mostly one-person-at-a-time as the main app.js file still ended up quite big for creating the overal layout and dictating the animation and control flow. 

Earlier in the development phase, we also ran into challenges with the type of user data to use and possible storage of user data. Originally, we thought about calculating statistics with the user's library of liked songs. This originally worked fine when testing with Ofir (she only had ~35 liked songs, and Spotify allows you to retrieve up to 50 songs in one query), but quickly became an issue when I tested, as I have >2000 liked songs. We first tried parallelizing requests, which made the entire library retreival fairly fast, but then we faced a new problem - how would we store this data? We didn't want to query possibly thousands of songs each time the user selected new parameters, but if we stored data locally this could be a security hazard, especially since we originally wanted to deploy the app publically. Therefore, we changed to looking at the user's top track and artist information instead; we also limited this to the top 100 tracks/items, which allows us to just make a new request to Spotify with each new parameter change and removes the problem of needing some storage for data.

We also still wanted to display more concrete textual information, so we created hover displays for the vinyls, which show more information about the track or artist being displayed. 

Finally, we faced quite a few challenges with the Spotify developer terms of use and licensing. The first issue is that we had been considering using the album and artist art itself, but Spotify dictactes that these can only be used in certain dimensions and without distortion, which was too restrictive for our project. Therefore, we decided to go with K-means for color extraction from art instead. 

Another issue is that we had planned to deploy our app publically, but earlier this year Spotify stopped allowing individual developers to publish applications... it turns out that now you have to be a registered company, and be launched to the public and have >250k monthly users. Because of that, we pivoted the project to being personal and also then drew inspiration from the Hungry Caterpillar (which then also necessitates keeping the project personal as it would contain trademarked image assets, although these could be reworked to not be use the original images).

The last challenge that we did not realize until late in development is that Spotify had actually deprecated their audio features API endpoint (also a change that occured earlier this year). Because we had already builtin a fallback to use popularity if BPM wasn't available, we only later realized that popularity had been used for track information as well. Therefore, we couldn't get information from Spotify's spectral analysis of a song, which included an estimated BPM and features like energy, danceability, acousticness, etc. We found an alternative third-party API, called Reccobeats, which we now query alternatively, and this helps get BPM information for some songs, but not all songs are available on this API, so we unfortunately have to fallback to popularity for some track information and animation as well.


### Next steps or future works





## Original proposal outline
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
