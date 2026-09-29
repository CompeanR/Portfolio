export const SWELL = {
  freqX: 0.55,
  speedX: 1.6,
  ampX: 0.22,
  freqZ: 0.8,
  speedZ: 1.1,
  ampZ: 0.16,
};

export function swellAt(x: number, z: number, t: number): number {
  return (
    Math.sin(x * SWELL.freqX + t * SWELL.speedX) * SWELL.ampX +
    Math.sin(z * SWELL.freqZ - t * SWELL.speedZ) * SWELL.ampZ
  );
}

export const SWELL_GLSL = `
  float swell(vec2 p, float t) {
    return sin(p.x * ${SWELL.freqX.toFixed(2)} + t * ${SWELL.speedX.toFixed(2)}) * ${SWELL.ampX.toFixed(2)}
      + sin(p.y * ${SWELL.freqZ.toFixed(2)} - t * ${SWELL.speedZ.toFixed(2)}) * ${SWELL.ampZ.toFixed(2)};
  }
`;
