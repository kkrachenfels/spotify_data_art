// preload fruit images (place your png/jpgs under ./assets/)
let IMAGES = {};
let fruits = [];
let lastTime;

function preload() {
  IMAGES.apple = loadImage("assets/caterpillar_apple.png", null, () =>
    console.warn("apple.png failed to load")
  );
  IMAGES.pear = loadImage("assets/caterpillar_pear.png");
  IMAGES.plum = loadImage("assets/caterpillar_grape.png");
  IMAGES.strawberry = loadImage("assets/caterpillar_strawberry.png");
  IMAGES.orange = loadImage("assets/caterpillar_orange.png");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(255);

  // create a few fruit instances with (x, y, img, baseSize)
  const y = height * 0.75;
  const spacing = width / 6;

  const f1 = new Fruit(spacing * 1, y, IMAGES.apple, 140);
  f1.setTrackInfo("song A", 120, 1); // pulses once per beat
  f1.setPulseStyle(0.94, 1.1);

  const f2 = new Fruit(spacing * 2, y, IMAGES.pear, 150);
  f2.setTrackInfo("song B", 96, 1);
  f2.setPulseStyle(0.9, 1.12, Math.PI / 4); // slight phase offset

  const f3 = new Fruit(spacing * 3, y, IMAGES.plum, 150);
  f3.setTrackInfo("song C", 130, 0.5); // every other beat

  const f4 = new Fruit(spacing * 4, y, IMAGES.strawberry, 130);
  f4.setTrackInfo("song D", 80, 2); // two pulses per beat (more bouncy)

  const f5 = new Fruit(spacing * 5, y, IMAGES.orange, 160);
  f5.setTrackInfo("song E", 110, 1);

  fruits = [f1, f2, f3, f4, f5];
  lastTime = millis();
}

function draw() {
  background(255);

  const now = millis();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  for (const f of fruits) {
    f.update(dt);
    f.draw(drawingContext); // p5's 2D context
  }
}
