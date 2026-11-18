// Character card shading (lighting.md 9.2 / 9.5). Replaces the flat emissive "pasted-on" look: the card takes the
// scene light colour as a tint, keeps a bright floor where a cast shadow falls on it (charShade ~.86), and gets a soft
// side gradient toward the real sun (head ~charGrad, torso ~bodyGrad) with a lavender far side.
// Contract with WORLD: LFB (sun shadow visibility inside three's light loop) and CHAR (uniforms world.ts updates from
// LIGHTS every frame) come from shade.ts; the sun direction is three's own directional light 0.
// The drawing already carries a painted crescent (toon.ts shadedFill / gradFill), so the shader adds GRAD_K of the
// preset gradient, and the preset tint (measured on WHITE heads) is applied at TINT_K so peach skin stays clean
// (lighting.md 9.1 note: golden ~[1, .88, .76], day ~[1, .97, .96] for peach skin).
import * as THREE from "three";
import { LFB, CHAR } from "./shade";

const blankInk = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
blankInk.needsUpdate = true;
const blankSdf = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
blankSdf.needsUpdate = true;

export const GRAD_K = 5.5;   // head: preset charGrad x5.5, capped at .4 linear: ~14 % on screen after the grade /
                             // tone-map highlight roll-off (faces sit at ~.96 there; review round 2)
export const GRAD_KB = 1.6;  // torso: preset bodyGrad x1.6 -> ~10-15 % form shade on screen (review round 3)
export const TINT_K = 0.55;

// Card zones in UV (v = 1 at the top of the 600 x 1000 design card): adult chin at y ~420 -> v .58, head centre
// y ~309 -> v .69, head half height ~111 -> .11. Head half width ~118 units -> .2 of the card, torso ~89 -> .15.
const CARD = /* glsl */ `
vec3 tintK = mix( vec3( 1.0 ), uCharTint, uTintK );
tintK /= pow( max( dot( tintK, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.2 ), uNorm );             // same face value day and golden
vec3 outgoingLight = diffuseColor.rgb * tintK;
#if NUM_DIR_LIGHTS > 0
{
  vec3 sunV = directionalLights[ 0 ].direction;                                          // view space, towards the sun
  vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float side = uCharLook > 0.5 ? uCharSide : sign( sunV.x ) * smoothstep( 0.0, 0.35, abs( sunV.x ) ); // + = key on screen right
  float head = smoothstep( 0.565, 0.6, vMapUv.y );                                        // head zone vs body
  float hw = mix( 0.15, 0.2, head );
  float uu = clamp( ( vMapUv.x - 0.5 ) / hw, -1.0, 1.0 ) * sign( dFdx( vMapUv.x ) + 1e-7 ); // -1..1 screen left..right
  float t = uu * side;                                                                     // +1 = edge facing the sun
  float g = mix( uBodyGrad * uGradKB, min( uGrad * uGradK, 0.4 ), head );
  float dark = smoothstep( -0.15, 0.9, -t );                                                 // far side
  vec3 sideK = mix( vec3( 1.0 ), uSideTint, dark * clamp( g / max( min( uGrad * uGradK, 0.4 ), 1e-3 ), 0.0, 1.5 ) * 0.5 );
  float top = uCharLook > 0.5 ? 1.0 : 1.0 + 0.05 * clamp( ( vMapUv.y - 0.69 ) / 0.11, -1.0, 1.0 ) * clamp( dot( sunV, upV ) * 2.0, 0.0, 1.0 ) * head;
  float lift = uCharLook > 0.5 ? 1.0 : 1.0 + 0.04 * smoothstep( 0.0, 0.9, t );
  outgoingLight *= mix( uCharShade, 1.0, sunVis ) * ( 1.0 - g * dark ) * sideK * top * lift * uGain;
  outgoingLight += diffuseColor.rgb * tintK * uFill;
  #ifdef USE_MAP
  if ( uCharLook < 0.5 && uInkOn > 0.5 && uInkLook > 0.5 ) {
    // Look shots: a soft band strictly inside the silhouette and outside the explicit ink/hair mask. d is the
    // SDF distance in card texels; the band starts past the outline and fades before the face centre.
    float ink = texture2D( uInkMask, vMapUv ).r;
    float d = texture2D( uSdf, vMapUv ).r * 255.0 * uSdfScale;
    float keySide = smoothstep( 0.0, 0.35, t );
    float band = smoothstep( uInkW, uInkW + uRimW, d ) * ( 1.0 - smoothstep( uInkW + uRimW, uInkW + 2.0 * uRimW, d ) );
    outgoingLight += uRimCol * keySide * band * ( 1.0 - ink ) * min( uRim, 0.25 );
  } else if ( uCharLook < 0.5 ) {
    // Legacy inner rim (bit-identical path): outermost ~2 px of the head/torso on the sun-facing edge.
    float warm = smoothstep( 0.2, 0.4, 1.0 - uCharTint.b );
    float sl = length( sunV.xy );
    vec2 d2 = sunV.xy / max( sl, 1e-4 );
    vec2 duv = 2.0 * uPx * ( d2.x * dFdx( vMapUv ) + d2.y * dFdy( vMapUv ) );
    float edge = step( texture2D( map, vMapUv + duv ).a, 0.5 );
    vec2 dirU = normalize( duv + vec2( 1e-9 ) );
    vec4 c1 = texture2D( map, vMapUv - dirU * vec2( 0.027, 0.016 ) );
    vec4 c2 = texture2D( map, vMapUv - dirU * vec2( 0.067, 0.04 ) );
    float skin = step( 0.5, c1.a ) * step( 0.3, c1.r ) * step( c1.b + 0.12, c1.r ) * step( c1.g, c1.r + 0.02 );
    float torso = step( 0.27, vMapUv.y ) * step( vMapUv.y, 0.57 ) * step( 0.5, c1.a ) * step( 0.5, c2.a ) * step( 0.04, max( c1.r, max( c1.g, c1.b ) ) );
    float inkHere = smoothstep( 0.28, 0.50, max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) ) );
    float rim = warm * smoothstep( 0.1, 0.4, sl ) * edge * max( skin * head, torso ) * mix( 0.6, 1.0, sunVis );
    rim *= mix( 1.0, inkHere, uRimMask );
    outgoingLight += uRimCol * rim * uRim;
  }
  #endif
}
#endif
`;

const DECL = "#include <common>\nuniform vec3 uCharTint; uniform float uCharShade; uniform float uGrad; uniform float uBodyGrad; uniform vec3 uSideTint;"
  + " uniform float uGradK; uniform float uGradKB; uniform float uTintK; uniform float uNorm; uniform float uGain; uniform float uPx; uniform float uRim; uniform vec3 uRimCol; uniform float uRimMask; uniform float uFill;"
  + " uniform sampler2D uInkMask; uniform sampler2D uSdf; uniform float uSdfScale; uniform float uInkW; uniform float uRimW; uniform float uInkOn; uniform float uInkLook; uniform float uCharLook; uniform float uCharSide; uniform float uCharUp;";
/** card-only constants (not per light): gradient share, tint share, overall gain (calibrated: faces ~.93 V) */
export const CARD_K = { uGradK: { value: GRAD_K }, uGradKB: { value: GRAD_KB }, uTintK: { value: TINT_K }, uNorm: { value: 0.7 }, uGain: { value: 1.03 }, uPx: { value: 0.5 } }; // uPx = render height / 1920 (set per draw in cast.ts)

/** MeshLambertMaterial -> lit card: no emissive, scene tint, bright floor, side gradient toward the sun. */
export function cardShade(m: THREE.MeshLambertMaterial) {
  m.emissive.set(0x000000); m.emissiveIntensity = 0; m.emissiveMap = null;
  const U = {
    uInkMask: { value: blankInk as THREE.Texture }, uSdf: { value: blankSdf as THREE.Texture },
    uSdfScale: { value: 1 }, uInkW: { value: 10 }, uRimW: { value: 20 }, uInkOn: { value: 0 },
  };
  m.userData.cardU = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CHAR, CARD_K, U);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", DECL)
      .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB + "\nsunVis = mix(sunVis, 1.0, uCharLook);")
      .replace("vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;", CARD);
  };
  m.customProgramCacheKey = () => "card16";
  return m;
}

/** ground contact blob: multiplies what is already drawn (the ground); drawn after the ground and before the cards */
export const blobMaterial = (map: THREE.Texture) => new THREE.MeshBasicMaterial({
  map, transparent: false, depthWrite: false, fog: false, toneMapped: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
});
