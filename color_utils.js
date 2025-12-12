/**
 * color_utils.js
 * - Utility functions for finding dominant colors in images
 * - Use K-means to set the dominant colors for the vinyls and backgrounds
 */

const colorCache = new Map();
const DEFAULT_SWATCH_COLOR = "#000000";

function getProminentColor(imageUrl) {
  if (!imageUrl) return Promise.resolve([]);
  if (colorCache.has(imageUrl)) return Promise.resolve(colorCache.get(imageUrl));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; //load img without cookies/credentials
    
    // temporarily load an img onto a canvas (not visible to the user) to get the dominant colors
    const size = 64; // a 64x64 canvas should be enough to get main colors
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      // if no context, return empty array
      if (!ctx) {
        colorCache.set(imageUrl, []);
        resolve([]);
        return;
      }

      // draw the img onto the canvas
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const pixels = [];
      for (let i = 0; i < data.length; i += 4) {
        pixels.push([data[i], data[i + 1], data[i + 2]]); // push rgb values, ignore alpha
      }
      // find dominant colors using k-means algorithm
      const dominant = findDominantColor(pixels);
      colorCache.set(imageUrl, dominant);
      resolve(dominant);
    };

    img.onerror = () => {
      colorCache.set(imageUrl, []);
      resolve([]);
    };

    img.src = imageUrl;
  });
}

function findDominantColor(pixels, k = 3, iterations = 6, topN = 2) {
  // if no pixels, return default swatch color
  if (!pixels.length) return Array.from({ length: topN }, () => DEFAULT_SWATCH_COLOR);

  const centers = [];
  // initialize centers with first k pixels
  for (let i = 0; i < k; i++) centers.push(pixels[(i * 3) % pixels.length]);
  let lastBuckets = [];

  // run k-means algorithm for a number of iterations
  for (let it = 0; it < iterations; it++) {
    const buckets = Array.from({ length: k }, () => []);
    pixels.forEach((px) => {
      let bi = 0,
        bd = Infinity;
      // find the closest center for each pixel
      centers.forEach((c, idx) => {
        const d =
          (px[0] - c[0]) ** 2 + (px[1] - c[1]) ** 2 + (px[2] - c[2]) ** 2;
        
        // if the distance is less than the current closest distance, update the closest center
        if (d < bd) {
          bd = d;
          bi = idx;
        }
      });
      buckets[bi].push(px);
    });
    
    buckets.forEach((bucket, idx) => {
      // if no pixels in bucket, set center to a random pixel
      if (!bucket.length) {
        centers[idx] = pixels[Math.floor(Math.random() * pixels.length)];
        return;
      }
      // calculate the average color of the bucket
      const sum = bucket.reduce(
        (a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]],
        [0, 0, 0]
      );
      centers[idx] = [
        Math.round(sum[0] / bucket.length),
        Math.round(sum[1] / bucket.length),
        Math.round(sum[2] / bucket.length),
      ];
    });
    lastBuckets = buckets;
  }
  // sort the centers by the number of pixels in each bucket
  const bucketStats = centers.map((center, idx) => ({
    color: `rgb(${center[0]}, ${center[1]}, ${center[2]})`,
    count: lastBuckets[idx]?.length ?? 0,
  }));
  bucketStats.sort((a, b) => b.count - a.count);

  // return the top N colors
  const result = [];
  for (let i = 0; i < topN; i += 1) {
    if (bucketStats[i]) result.push(bucketStats[i].color);
    else result.push(DEFAULT_SWATCH_COLOR);
  }
  return result;
}

