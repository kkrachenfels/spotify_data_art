let vinyl;
let lastTime;

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Use the underlying 2D context via p5's drawingContext
  vinyl = new Vinyl(width / 2, height / 2, 150, 60);

  // Example "Spotify" info — plug your real BPM + track name here
  vinyl.setTrackMeta({
    title: "Starving Artist",
    artist: "Kay&Ofir",
    bpm: 120,
    spinsPerBeat: 0.09,
  });

  lastTime = millis();
}

function draw() {
  background(255);

  const now = millis();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // update hover BEFORE drawing
  const hovering = vinyl.updateHover(mouseX, mouseY);
  cursor(hovering ? "pointer" : "default");

  vinyl.update(dt);
  vinyl.draw(drawingContext);
}
