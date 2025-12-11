/**
 * Fruit class for representing a fruit image
 * - Functions to help with animating the movement and BPM-driven pulsing
 * - Images from the `assets/` folder are passed in from the main app.js when creating fruits
 */


class Fruit {
  /**
   * @param {number} x            Center x
   * @param {number} y            Center y
   * @param {HTMLImageElement|p5.Image} img  Fruit image
   * @param {number} baseSize     Drawn width in pixels (height auto-kept by aspect ratio)
   */

  constructor(x, y, img, baseSize = 160) {
    this.position = { x, y };
    this.img = img;
    this.baseSize = baseSize;
    this.age = 0; // seconds (since the fruit only stays on screen until 'eaten')

    // motion
    this.velocity = { x: 0, y: 0 };

    // pulse settings, played around with scale/timing for values
    this.bpm = 0;
    this.pulsesPerBeat = 1; // 1 pulse per beat by default
    this.minScale = 0.84;
    this.maxScale = 1;
    this.phase = 0; // radians offset
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
    // we actually pulse along a sine wave for smoother animation
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
    const src = this.img.canvas || this.img;
    const iw = src.width;
    const ih = src.height;
    if (!iw || !ih) return;

    const drawW = this.baseSize * scale;
    const drawH = (ih / iw) * drawW;

    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    // center the image in the fruit canvas
    // (we overlaid the fruit canvas transparently on top of the vinyl canvas)
    ctx.drawImage(src, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  /** Set velocity of fruit */
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

  // initial fruit pulse/size when it's set onscreen
  setPulsePhase(phase = 0) {
    this.phase = phase;
  }
}

if (typeof window !== "undefined") {
  window.Fruit = Fruit;
}
