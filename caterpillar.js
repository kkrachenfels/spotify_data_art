/**
 * caterpillar.js
 * sprite class for drawing the caterpillar head/tail on the vinyl train
 */

class CaterpillarSprite {
  constructor(src, width, height) {
    this._primaryImage = new Image();
    this._primaryImage.src = src;
    this.width = width;
    this.height = height;
    this.ready = false;
    this.position = null;
    this.rotation = 0;
    this.angularVelocity = 0;
    // used to alternate between open/closed mouth for eating animation
    this._alternateImage = null;
    this._alternateReady = false;
    this._useAlternateFrame = false;

    this._primaryImage.crossOrigin = "Anonymous";
    this._primaryImage.onload = () => {
      this.ready = true;
    };
    this._primaryImage.onerror = () => {
      this.ready = false;
    };
  }

  setPosition(point) {
    this.position = point;
  }

  draw(ctx) {
    if (!this.ready || !this.position) return;
    const useAlternate =
      this._useAlternateFrame && this._alternateImage && this._alternateReady;
    const renderImage = useAlternate
      ? this._alternateImage
      : this._primaryImage;
    if (!renderImage?.complete) return;
    const { x, y } = this.position;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.rotation); //rotate head back and forth during eating animation
    ctx.drawImage(
      renderImage,
      -this.width / 2,
      -this.height / 2,
      this.width,
      this.height
    );
    ctx.restore();
  }

  update(deltaSeconds) {
    if (this.angularVelocity) {
      this.rotation =
        (this.rotation + this.angularVelocity * deltaSeconds) % (Math.PI * 2);
    }
  }

  // used to alternate between open/closed mouth for eating animation
  setAlternateImage(src) {
    if (!src) {
      this._alternateImage = null;
      this._alternateReady = false;
      this._useAlternateFrame = false;
      return;
    }
    this._alternateImage = new Image();
    this._alternateImage.src = src;
    this._alternateImage.crossOrigin = "Anonymous";
    this._alternateReady = false;
    this._alternateImage.onload = () => {
      this._alternateReady = true;
    };
    this._alternateImage.onerror = () => {
      this._alternateReady = false;
    };
  }

  useAlternateFrame(enabled) {
    this._useAlternateFrame = Boolean(enabled);
  }
}

if (typeof window !== "undefined") {
  window.CaterpillarSprite = CaterpillarSprite;
}

