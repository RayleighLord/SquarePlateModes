import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { MembraneMode, PlaybackRate } from "../types";
import { createBerlinTexture } from "./berlin";

const MESH_SEGMENTS = 128;
const MAX_PIXEL_RATIO = 2;
const MAX_DRAWING_BUFFER_PIXELS = 2_500_000;
const CYCLE_SECONDS = 4;
const TWO_PI = 2 * Math.PI;
const DEFAULT_CAMERA_DIRECTION = new THREE.Vector3(1.28, 1.02, 1.38).normalize();
const DEFAULT_CAMERA_DISTANCE = 2.15;
const DEFAULT_MODE: MembraneMode = { nx: 2, ny: 3 };

export const MEMBRANE_AMPLITUDE = 0.09;

export interface ThreeMembraneRendererOptions {
  readonly onContextLost?: () => void;
  readonly onContextRestored?: () => void;
}

interface MembraneUniforms {
  readonly [name: string]: THREE.IUniform;
  readonly uAmplitude: THREE.IUniform<number>;
  readonly uBerlin: THREE.IUniform<THREE.DataTexture>;
  readonly uNx: THREE.IUniform<number>;
  readonly uNy: THREE.IUniform<number>;
  readonly uPhase: THREE.IUniform<number>;
}

/**
 * Retained WebGL renderer for a fixed-edge square membrane.
 *
 * The geometry never changes after construction. Mode indices and animation
 * phase are shader uniforms, and frames are requested only while animation or
 * damped camera motion is active.
 */
export class MembraneRenderer {
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.05, 20);
  private readonly controls: OrbitControls;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly membrane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly berlinTexture: THREE.DataTexture;
  private readonly uniforms: MembraneUniforms;
  private readonly perimeter: THREE.Group;
  private readonly perimeterGeometry: THREE.BoxGeometry;
  private readonly perimeterMaterial: THREE.MeshBasicMaterial;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly onContextLostCallback: (() => void) | undefined;
  private readonly onContextRestoredCallback: (() => void) | undefined;

  private mode: MembraneMode = DEFAULT_MODE;
  private phase = 0;
  private playbackRate: PlaybackRate = 1;
  private playing = false;
  private pageVisible = true;
  private contextLost = false;
  private destroyed = false;
  private rafId = 0;
  private previousFrameTime: number | null = null;
  private frameSequence = 0;

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.destroyed) return;
    this.contextLost = true;
    this.previousFrameTime = null;
    this.cancelFrame();
    this.host.dataset.membraneStatus = "context-lost";
    this.host.dispatchEvent(new CustomEvent("membrane-context-lost", { bubbles: true }));
    this.onContextLostCallback?.();
  };

  private readonly handleContextRestored = (): void => {
    if (this.destroyed) return;
    this.contextLost = false;
    this.previousFrameTime = null;
    this.host.dataset.membraneStatus = "ready";
    this.host.dispatchEvent(new CustomEvent("membrane-context-restored", { bubbles: true }));
    this.onContextRestoredCallback?.();
    this.requestFrame();
  };

  constructor(host: HTMLElement, options: ThreeMembraneRendererOptions = {}) {
    this.host = host;
    this.onContextLostCallback = options.onContextLost;
    this.onContextRestoredCallback = options.onContextRestored;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.dataset.membraneCanvas = "true";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.replaceChildren(this.renderer.domElement);

    this.berlinTexture = createBerlinTexture();
    this.uniforms = {
      uAmplitude: { value: MEMBRANE_AMPLITUDE },
      uBerlin: { value: this.berlinTexture },
      uNx: { value: DEFAULT_MODE.nx },
      uNy: { value: DEFAULT_MODE.ny },
      uPhase: { value: 0 }
    };
    this.geometry = new THREE.PlaneGeometry(1, 1, MESH_SEGMENTS, MESH_SEGMENTS);
    // PlaneGeometry begins in XY; the mathematical square is rendered in XZ.
    this.geometry.rotateX(Math.PI / 2);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.78);
    this.material = new THREE.ShaderMaterial({
      name: "signed-membrane-berlin",
      uniforms: this.uniforms,
      vertexShader: MEMBRANE_VERTEX_SHADER,
      fragmentShader: MEMBRANE_FRAGMENT_SHADER,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.membrane = new THREE.Mesh(this.geometry, this.material);
    this.membrane.name = "square-membrane";
    this.membrane.frustumCulled = false;
    this.scene.add(this.membrane);

    const perimeter = createPerimeter();
    this.perimeter = perimeter.group;
    this.perimeterGeometry = perimeter.geometry;
    this.perimeterMaterial = perimeter.material;
    this.scene.add(this.perimeter);

    this.camera.position.copy(DEFAULT_CAMERA_DIRECTION).multiplyScalar(DEFAULT_CAMERA_DISTANCE);
    this.camera.lookAt(0, 0, 0);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.95;
    this.controls.maxDistance = 5;
    // Permit a complete orbit, including a view of the membrane underside.
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.rotateSpeed = 0.68;
    this.controls.zoomSpeed = 0.8;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener("change", this.requestFrame);
    this.controls.addEventListener("change", this.updateCameraData);
    this.controls.update();

    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.handleContextRestored);
    if (typeof ResizeObserver === "undefined") {
      this.resizeObserver = null;
    } else {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(host);
    }

    this.host.dataset.rendererReady = "true";
    this.host.dataset.membraneStatus = "ready";
    this.host.dataset.meshSegments = `${MESH_SEGMENTS}`;
    this.host.dataset.frame = "0";
    this.host.dataset.playing = "false";
    this.host.dataset.playbackRate = "1";
    this.host.dataset.pageVisible = "true";
    this.host.dataset.amplitude = `${MEMBRANE_AMPLITUDE}`;
    this.host.dataset.gridVisible = "true";
    this.host.dataset.axisMarkers = "false";
    this.host.dataset.cameraFullRotation = "true";
    this.host.setAttribute("aria-busy", "false");
    this.updateModeData();
    this.updatePhaseData();
    this.updateCameraData();
    this.resize();
  }

  setMode(mode: MembraneMode): void {
    if (this.destroyed) return;
    assertMode(mode);
    if (mode.nx === this.mode.nx && mode.ny === this.mode.ny) return;
    this.mode = mode;
    this.uniforms.uNx.value = mode.nx;
    this.uniforms.uNy.value = mode.ny;
    this.updateModeData();
    this.resetPhase();
  }

  setPlaying(playing: boolean): void {
    if (this.destroyed || playing === this.playing) return;
    this.playing = playing;
    this.previousFrameTime = null;
    this.host.dataset.playing = `${playing}`;
    if (playing && this.pageVisible && !this.contextLost) {
      this.requestFrame();
    }
  }

  setPlaybackRate(rate: PlaybackRate): void {
    if (this.destroyed) return;
    if (rate !== 0.5 && rate !== 1 && rate !== 2) {
      throw new RangeError(`Playback rate must be 0.5, 1, or 2; got ${String(rate)}`);
    }
    this.playbackRate = rate;
    this.host.dataset.playbackRate = `${rate}`;
    this.requestFrame();
  }

  setPageVisible(visible: boolean): void {
    if (this.destroyed || visible === this.pageVisible) return;
    this.pageVisible = visible;
    this.previousFrameTime = null;
    this.host.dataset.pageVisible = `${visible}`;
    if (visible) {
      this.requestFrame();
    } else {
      this.cancelFrame();
    }
  }

  resetPhase(): void {
    if (this.destroyed) return;
    this.phase = 0;
    this.previousFrameTime = null;
    this.uniforms.uPhase.value = 0;
    this.updatePhaseData();
    this.requestFrame();
  }

  resetView(): void {
    if (this.destroyed) return;
    const dampingWasEnabled = this.controls.enableDamping;
    // Clear any residual damped rotation so reset is exact and repeatable.
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(DEFAULT_CAMERA_DIRECTION).multiplyScalar(DEFAULT_CAMERA_DISTANCE);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.controls.enableDamping = dampingWasEnabled;
    this.updateCameraData();
    this.requestFrame();
  }

  rotateBy(deltaAzimuth: number, deltaPolar: number): void {
    if (this.destroyed || !Number.isFinite(deltaAzimuth) || !Number.isFinite(deltaPolar)) return;
    this.controls.rotateLeft(deltaAzimuth);
    this.controls.rotateUp(deltaPolar);
    this.controls.update();
    this.requestFrame();
  }

  zoomBy(scale: number): void {
    if (this.destroyed || !Number.isFinite(scale) || scale <= 0) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(
      offset.length() * scale,
      this.controls.minDistance,
      this.controls.maxDistance
    );
    offset.setLength(distance);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.requestFrame();
  }

  /** Handle camera-only keyboard shortcuts when the stage owns focus. */
  handleKeyboard(event: KeyboardEvent): boolean {
    if (this.destroyed || event.altKey || event.ctrlKey || event.metaKey) return false;
    let handled = true;
    switch (event.key) {
      case "ArrowLeft":
        this.rotateBy(0.1, 0);
        break;
      case "ArrowRight":
        this.rotateBy(-0.1, 0);
        break;
      case "ArrowUp":
        this.rotateBy(0, 0.075);
        break;
      case "ArrowDown":
        this.rotateBy(0, -0.075);
        break;
      case "+":
      case "=":
        this.zoomBy(0.88);
        break;
      case "-":
      case "_":
        this.zoomBy(1.14);
        break;
      case "0":
      case "Home":
        this.resetView();
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
    return handled;
  }

  resize(): void {
    if (this.destroyed) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const requestedRatio = Math.max(1, window.devicePixelRatio || 1);
    const bufferLimitedRatio = Math.sqrt(MAX_DRAWING_BUFFER_PIXELS / (width * height));
    const pixelRatio = Math.min(requestedRatio, MAX_PIXEL_RATIO, bufferLimitedRatio);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.host.dataset.pixelRatio = pixelRatio.toFixed(3);
    this.requestFrame();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelFrame();
    this.resizeObserver?.disconnect();
    this.controls.removeEventListener("change", this.requestFrame);
    this.controls.removeEventListener("change", this.updateCameraData);
    this.controls.dispose();
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.geometry.dispose();
    this.material.dispose();
    this.berlinTexture.dispose();
    this.perimeterGeometry.dispose();
    this.perimeterMaterial.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    delete this.host.dataset.rendererReady;
    this.host.dataset.membraneStatus = "destroyed";
  }

  private readonly requestFrame = (): void => {
    if (this.destroyed || this.contextLost || !this.pageVisible || this.rafId !== 0) return;
    this.rafId = window.requestAnimationFrame(this.renderFrame);
  };

  private readonly renderFrame = (time: number): void => {
    this.rafId = 0;
    if (this.destroyed || this.contextLost || !this.pageVisible) return;

    if (this.playing) {
      if (this.previousFrameTime !== null) {
        const elapsedSeconds = Math.min(0.1, Math.max(0, (time - this.previousFrameTime) / 1000));
        this.phase = (this.phase + (elapsedSeconds * TWO_PI * this.playbackRate) / CYCLE_SECONDS) % TWO_PI;
        this.uniforms.uPhase.value = this.phase;
        this.updatePhaseData();
      }
      this.previousFrameTime = time;
    } else {
      this.previousFrameTime = null;
    }

    const cameraMoving = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frameSequence += 1;
    this.host.dataset.frame = `${this.frameSequence}`;
    const memory = this.renderer.info.memory;
    this.host.dataset.geometryCount = `${memory.geometries}`;
    this.host.dataset.textureCount = `${memory.textures}`;
    this.host.dataset.programCount = `${this.renderer.info.programs?.length ?? 0}`;
    if (this.playing || cameraMoving) this.requestFrame();
  };

  private readonly updateCameraData = (): void => {
    if (this.destroyed) return;
    const { x, y, z } = this.camera.position;
    this.host.dataset.camera = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
  };

  private updateModeData(): void {
    this.host.dataset.mode = `${this.mode.nx},${this.mode.ny}`;
    this.host.dataset.nodalXCount = `${this.mode.nx - 1}`;
    this.host.dataset.nodalYCount = `${this.mode.ny - 1}`;
  }

  private updatePhaseData(): void {
    this.host.dataset.phase = this.phase.toFixed(6);
  }

  private cancelFrame(): void {
    if (this.rafId === 0) return;
    window.cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }
}

/** Compatibility alias for callers that prefer the explicit Three.js name. */
export { MembraneRenderer as ThreeMembraneRenderer };

function assertMode(mode: MembraneMode): void {
  if (
    !Number.isInteger(mode.nx) ||
    !Number.isInteger(mode.ny) ||
    mode.nx < 1 ||
    mode.nx > 8 ||
    mode.ny < 1 ||
    mode.ny > 8
  ) {
    throw new RangeError(`Mode indices must be integers from 1 to 8; got (${mode.nx}, ${mode.ny})`);
  }
}

interface PerimeterResources {
  readonly group: THREE.Group;
  readonly geometry: THREE.BoxGeometry;
  readonly material: THREE.MeshBasicMaterial;
}

function createPerimeter(): PerimeterResources {
  // A small solid frame is reliable across WebGL implementations, unlike
  // LineBasicMaterial linewidth, which is commonly clamped to one pixel.
  const geometry = new THREE.BoxGeometry(1.012, 0.008, 0.01);
  const material = new THREE.MeshBasicMaterial({
    color: 0xdde8f5,
    toneMapped: false
  });
  const group = new THREE.Group();
  group.name = "fixed-boundary-perimeter";

  const north = new THREE.Mesh(geometry, material);
  const south = new THREE.Mesh(geometry, material);
  const east = new THREE.Mesh(geometry, material);
  const west = new THREE.Mesh(geometry, material);
  north.position.z = -0.5;
  south.position.z = 0.5;
  east.position.x = 0.5;
  west.position.x = -0.5;
  east.rotation.y = Math.PI / 2;
  west.rotation.y = Math.PI / 2;
  for (const edge of [north, south, east, west]) {
    edge.renderOrder = 2;
    group.add(edge);
  }

  return { group, geometry, material };
}

const MEMBRANE_VERTEX_SHADER = /* glsl */ `
  uniform float uAmplitude;
  uniform float uNx;
  uniform float uNy;
  uniform float uPhase;

  varying vec2 vUv;
  varying float vDisplacement;
  varying vec3 vViewNormal;

  const float PI = 3.141592653589793;

  void main() {
    float sx = sin(PI * uNx * uv.x);
    float sy = sin(PI * uNy * uv.y);
    float temporal = cos(uPhase);
    float displacement = sx * sy * temporal;

    vec3 displaced = position;
    displaced.y = uAmplitude * displacement;

    float dydx = uAmplitude * temporal * PI * uNx * cos(PI * uNx * uv.x) * sy;
    float dydz = uAmplitude * temporal * PI * uNy * sx * cos(PI * uNy * uv.y);
    vec3 objectNormal = normalize(vec3(-dydx, 1.0, -dydz));

    vUv = uv;
    vDisplacement = displacement;
    vViewNormal = normalize(normalMatrix * objectNormal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const MEMBRANE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uBerlin;
  uniform float uNx;
  uniform float uNy;

  varying vec2 vUv;
  varying float vDisplacement;
  varying vec3 vViewNormal;

  const float PI = 3.141592653589793;
  const float GRID_DIVISIONS = 16.0;

  float interiorNode(float wave, float coordinate) {
    float waveWidth = max(fwidth(wave), 0.00001);
    float line = 1.0 - smoothstep(0.2 * waveWidth, 1.05 * waveWidth, abs(wave));
    float edgeDistance = min(coordinate, 1.0 - coordinate);
    float boundaryMask = smoothstep(1.25 * fwidth(coordinate), 2.75 * fwidth(coordinate), edgeDistance);
    return line * boundaryMask;
  }

  float surfaceGrid(float coordinate) {
    float gridCoordinate = coordinate * GRID_DIVISIONS;
    float cellPosition = fract(gridCoordinate);
    float lineDistance = min(cellPosition, 1.0 - cellPosition);
    float pixelWidth = max(fwidth(gridCoordinate), 0.00001);
    float line = 1.0 - smoothstep(0.25 * pixelWidth, 0.9 * pixelWidth, lineDistance);
    float edgeDistance = min(coordinate, 1.0 - coordinate);
    float boundaryMask = smoothstep(1.25 * fwidth(coordinate), 2.75 * fwidth(coordinate), edgeDistance);
    return line * boundaryMask;
  }

  void main() {
    float paletteCoordinate = clamp(vDisplacement * 0.5 + 0.5, 0.0, 1.0);
    // uBerlin is uploaded as an sRGB texture, so WebGL sampling has already
    // converted the published lookup-table values into the linear work space.
    vec3 baseColor = texture2D(uBerlin, vec2(paletteCoordinate, 0.5)).rgb;

    vec3 normal = normalize(vViewNormal);
    if (!gl_FrontFacing) normal = -normal;
    float diffuse = 0.5 + 0.5 * max(0.0, dot(normal, normalize(vec3(0.28, 0.78, 0.56))));
    baseColor *= 0.88 + 0.12 * diffuse;

    float xGrid = surfaceGrid(vUv.x);
    float yGrid = surfaceGrid(vUv.y);
    // max() also prevents grid intersections from accumulating brightness.
    float grid = max(xGrid, yGrid);
    vec3 gridColor = sRGBTransferEOTF(vec4(0.72, 0.78, 0.85, 1.0)).rgb;
    vec3 color = mix(baseColor, gridColor, grid * 0.28);

    float xNode = interiorNode(sin(PI * uNx * vUv.x), vUv.x);
    float yNode = interiorNode(sin(PI * uNy * vUv.y), vUv.y);
    // max() keeps line brightness constant where two nodal lines intersect.
    float node = max(xNode, yNode);
    vec3 nodeColor = sRGBTransferEOTF(vec4(0.34, 0.40, 0.48, 1.0)).rgb;
    color = mix(color, nodeColor, node * 0.22);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;
