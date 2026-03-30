import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectWhiteout, detectEmptyContent } from "./heatmap.ts";

function makePngData(
  width: number,
  height: number,
  fill: [number, number, number, number]
) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = fill[3];
  }
  return { width, height, data };
}

describe("detectWhiteout", () => {
  it("should detect all-white image", () => {
    const result = detectWhiteout(makePngData(100, 100, [255, 255, 255, 255]));
    assert.equal(result.isWhiteout, true);
    assert.equal(result.whiteRatio, 1.0);
  });

  it("should not flag colorful image", () => {
    const data = makePngData(100, 100, [100, 50, 200, 255]);
    const result = detectWhiteout(data);
    assert.equal(result.isWhiteout, false);
    assert.equal(result.whiteRatio, 0);
  });

  it("should respect threshold", () => {
    // 96% white, 4% colored
    const png = makePngData(100, 100, [255, 255, 255, 255]);
    for (let i = 0; i < 400; i++) {
      png.data[i * 4] = 0;
      png.data[i * 4 + 1] = 0;
      png.data[i * 4 + 2] = 0;
    }
    const result = detectWhiteout(png, { threshold: 0.97 });
    assert.equal(result.isWhiteout, false);
  });
});

describe("detectEmptyContent", () => {
  it("should detect single-color image", () => {
    const result = detectEmptyContent(makePngData(100, 100, [128, 128, 128, 255]));
    assert.equal(result.isEmpty, true);
    assert.equal(result.uniqueColors, 1);
  });

  it("should not flag multi-color image", () => {
    const png = makePngData(200, 200, [0, 0, 0, 255]);
    // add many colors
    for (let i = 0; i < 200 * 200; i++) {
      png.data[i * 4] = i % 256;
      png.data[i * 4 + 1] = (i * 3) % 256;
      png.data[i * 4 + 2] = (i * 7) % 256;
    }
    const result = detectEmptyContent(png);
    assert.equal(result.isEmpty, false);
    assert.ok(result.uniqueColors > 8);
  });
});
