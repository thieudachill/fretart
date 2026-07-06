/**
 * Shared GLSL for the "print language": screen-space video sampling through
 * the cover-crop transform, plus the halftone/hash primitives. Every effect
 * that re-renders the feed as screen-print (finger-shape fills, the facet
 * pyramid) includes these snippets so treatments stay identical everywhere.
 *
 * Including shaders must interpolate PRINT_UNIFORMS at the top of the
 * fragment source and PRINT_HELPERS after their own uniform declarations,
 * and bind uVideo/uOff/uScl/uMirror/uAspect (see fingerShapes.ts).
 */
export const PRINT_UNIFORMS = /* glsl */ `
  uniform sampler2D uVideo;
  uniform vec2 uOff;
  uniform vec2 uScl;
  uniform float uMirror;
  uniform float uAspect;
`;

export const PRINT_HELPERS = /* glsl */ `
  float phash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  vec2 videoUV(vec2 s) {
    vec2 uv = vec2(s.x, 1.0 - s.y);
    if (uMirror > 0.5) uv.x = 1.0 - uv.x;
    return uOff + clamp(uv, 0.0, 1.0) * uScl;
  }

  vec3 videoAt(vec2 s) {
    return texture2D(uVideo, videoUV(s)).rgb;
  }

  float lumaAt(vec2 s) {
    return dot(videoAt(s), vec3(0.299, 0.587, 0.114));
  }

  float halftone(vec2 s, float scale, float angle, float coverage) {
    float sn = sin(angle);
    float cs = cos(angle);
    vec2 p = mat2(cs, -sn, sn, cs) * (s * vec2(uAspect, 1.0)) * scale;
    vec2 cell = fract(p) - 0.5;
    float radius = 0.72 * sqrt(clamp(coverage, 0.0, 1.0));
    return 1.0 - smoothstep(radius - 0.09, radius + 0.09, length(cell));
  }
`;
