let vinyl;
let lastTime;

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Use the underlying 2D context via p5's drawingContext
  vinyl = new Vinyl(width / 2, height / 2, 150, 60);

  // Example "Spotify" info — plug your real BPM + track name here
  vinyl.setTrackInfo("Hungry artist", 120); // 120 BPM

  lastTime = millis();
}

function draw() {
  background(255);

  const now = millis();
  const deltaSeconds = (now - lastTime) / 1000.0;
  lastTime = now;

  vinyl.update(deltaSeconds);
  vinyl.draw(drawingContext); // p5's canvas 2D context
}
