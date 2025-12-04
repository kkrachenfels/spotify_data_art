class Fruit {
  constructor(x, y, img, baseSize = 160) {
    this.position = { x, y };
    this.img = img;
    this.baseSize = baseSize; // target square size in px
    this.age = 0;
    this.velocity = { x: 0, y: 0 };

    // pulse settings
    this.bpm = 0;
    this.pulsesPerBeat = 1;
    this.minScale = 0.92;
    this.maxScale = 1.12;
    this.phase = 0;

    // track meta
    this.trackName = "";

    // how to fit the image into the square: "contain" | "cover" | "stretch"
    this.fitMode = "contain";
  }

  // ... update(), _currentScale(), setBpm(), setPulseStyle(), setTrackInfo(), setImage() unchanged ...

  draw(ctx) {
    if (!this.img) return;

    const src = this.img.canvas || this.img; // p5.Image or HTMLImageElement
    const iw = src.width,
      ih = src.height;
    if (!iw || !ih) return;

    const scale = this._currentScale();
    const target = this.baseSize * scale; // square box we draw into

    let drawW, drawH;
    const r = iw / ih;

    if (this.fitMode === "stretch") {
      // ignore aspect ratio
      drawW = target;
      drawH = target;
    } else if (this.fitMode === "cover") {
      // fill the square, possibly cropping (we'll clip to a square)
      // compute scale so the smallest dimension fills the square
      const s = r > 1 ? target / ih : target / iw;
      drawW = iw * s;
      drawH = ih * s;

      ctx.save();
      ctx.translate(this.position.x, this.position.y);
      // clip to a square so overflow is hidden
      ctx.beginPath();
      ctx.rect(-target / 2, -target / 2, target, target);
      ctx.clip();
      ctx.drawImage(src, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
      return;
    } else {
      // "contain" (default): fit inside square, no cropping
      if (r > 1) {
        // wider than tall
        drawW = target;
        drawH = target / r;
      } else {
        // taller than wide
        drawH = target;
        drawW = target * r;
      }
    }

    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.drawImage(src, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }
}
