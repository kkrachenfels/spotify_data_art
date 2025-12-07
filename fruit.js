class Fruit {
  /**
   * @param {number} x            Center x
   * @param {number} y            Center y
   * @param {HTMLImageElement|p5.Image} img  Fruit image
   * @param {number} baseSize     Drawn width in pixels (height auto-kept by aspect ratio)
   */
  constructor(x, y, img, baseSize = 160) {
    this.position = { x, y };
    this.img = img; // HTMLImageElement or p5.Image
    this.baseSize = baseSize; // width in px; height scales to keep aspect
    this.age = 0; // seconds

    // motion (optional drift)
    this.velocity = { x: 0, y: 0 };

    // pulse settings
    this.bpm = 0;
    this.pulsesPerBeat = 1; // 1 pulse per beat by default
    this.minScale = 0.84;
    this.maxScale = 1;
    this.phase = 0; // radians offset

    // track meta (not displayed)
    this.trackName = "";
  }

  /** Update kinematics + pulse clock */
  update(deltaSeconds) {
    this.age += deltaSeconds;
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
  }

  /** Current scale factor based on BPM-driven sinusoid */
  _currentScale() {
    if (!this.bpm) return 1;
    const bps = this.bpm / 60;
    const freq = bps * this.pulsesPerBeat; // pulses per second
    // normalized osc in [0,1]
    const t = 0.5 * (1 + Math.sin(2 * Math.PI * freq * this.age + this.phase));
    return this.minScale + t * (this.maxScale - this.minScale);
  }

  /**
   * Draw the fruit. Pass a CanvasRenderingContext2D (in p5, use `drawingContext`).
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (!this.img) return;

    const scale = this._currentScale();

    // figure out final draw size keeping the image aspect ratio
    const src = this.img.canvas || this.img; // supports p5.Image or HTMLImageElement
    const iw = src.width;
    const ih = src.height;
    if (!iw || !ih) return;

    const drawW = this.baseSize * scale;
    const drawH = (ih / iw) * drawW;

    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    // center the image
    ctx.drawImage(src, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  /** Optional drift */
  setVelocity(vx, vy) {
    this.velocity.x = vx;
    this.velocity.y = vy;
  }

  /**
   * Set BPM and (optionally) pulses per beat.
   * @param {number} bpm
   * @param {number} pulsesPerBeat default 1
   */
  setBpm(bpm, pulsesPerBeat = 1) {
    this.bpm = bpm || 0;
    this.pulsesPerBeat = pulsesPerBeat;
  }

  /**
   * Control pulse intensity.
   * @param {number} minScale smallest scale (e.g., 0.9)
   * @param {number} maxScale largest scale (e.g., 1.1)
   * @param {number} phase optional radians offset
   */
  setPulseStyle(minScale, maxScale, phase = 0) {
    this.minScale = minScale;
    this.maxScale = maxScale;
    this.phase = phase;
  }

  /** Track meta (not displayed) */
  setTrackInfo(name, bpm, pulsesPerBeat = 1) {
    this.trackName = name || "";
    this.setBpm(bpm, pulsesPerBeat);
  }

  /** Swap the image (e.g., choose different fruit) */
  setImage(img) {
    this.img = img;
  }

  /** Convenience factory for a small preset family of fruits by name */
  static pickImageFromMap(name, imageMap) {
    // imageMap example: { apple: p5Image, pear: p5Image, ... }
    // naive mapping: pick by key if exists, else first in map
    if (!imageMap) return null;
    if (name && imageMap[name]) return imageMap[name];
    const first = Object.values(imageMap)[0];
    return first || null;
  }
}

if (typeof window !== "undefined") {
  window.Fruit = Fruit;
}
