const colorCache = new Map();
const DEFAULT_SWATCH_COLOR = "#555";

function getProminentColor(imageUrl) {
  if (!imageUrl) return Promise.resolve([]);
  if (colorCache.has(imageUrl)) return Promise.resolve(colorCache.get(imageUrl));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    const size = 32;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        colorCache.set(imageUrl, []);
        resolve([]);
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const pixels = [];
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 30) continue;
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }
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
  if (!pixels.length) return Array.from({ length: topN }, () => DEFAULT_SWATCH_COLOR);
  const centers = [];
  for (let i = 0; i < k; i++) centers.push(pixels[(i * 3) % pixels.length]);
  let lastBuckets = [];
  for (let it = 0; it < iterations; it++) {
    const buckets = Array.from({ length: k }, () => []);
    pixels.forEach((px) => {
      let bi = 0,
        bd = Infinity;
      centers.forEach((c, idx) => {
        const d =
          (px[0] - c[0]) ** 2 + (px[1] - c[1]) ** 2 + (px[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = idx;
        }
      });
      buckets[bi].push(px);
    });
    buckets.forEach((bucket, idx) => {
      if (!bucket.length) {
        centers[idx] = pixels[Math.floor(Math.random() * pixels.length)];
        return;
      }
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
  const bucketStats = centers.map((center, idx) => ({
    color: `rgb(${center[0]}, ${center[1]}, ${center[2]})`,
    count: lastBuckets[idx]?.length ?? 0,
  }));
  bucketStats.sort((a, b) => b.count - a.count);
  const result = [];
  for (let i = 0; i < topN; i += 1) {
    if (bucketStats[i]) result.push(bucketStats[i].color);
    else result.push(DEFAULT_SWATCH_COLOR);
  }
  return result;
}

