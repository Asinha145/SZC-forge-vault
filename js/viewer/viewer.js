/**
 * three.js scene, cameras, controls and per-element display state.
 *
 * - IFC is Z-up, so camera.up is +Z (except plan views, where the up vector
 *   must not be parallel to the view direction).
 * - Perspective and orthographic cameras coexist; toggling swaps which one
 *   the single OrbitControls instance drives, syncing position/target/size
 *   (accumulated orthographic zoom converts back into camera distance).
 * - Selection highlight = material swap to one shared "selected" material;
 *   hide = mesh.visible. Both are applied as deltas against the previous
 *   sets, so a one-element change touches one mesh — no geometry rebuilds.
 * - Rendering is on-demand: frames are drawn only after camera movement or
 *   a display-state change, so an idle tab does no GPU work.
 */
import * as THREE from "three";
import { OrbitControls } from "../../lib/OrbitControls.js";

const ISO_DIR = new THREE.Vector3(1, -1, 1).normalize();

const VIEW_DIRS = {
  top: { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  bottom: { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
  left: { dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
  right: { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
  front: { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  back: { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) },
  iso: { dir: ISO_DIR, up: new THREE.Vector3(0, 0, 1) },
};

export class Viewer {
  #prevSelected = new Set();
  #prevHidden = new Set();
  #needsRender = true;

  constructor(container) {
    this.container = container;
    this.meshes = new Map(); // expressID -> THREE.Mesh
    this.modelCenter = new THREE.Vector3();
    this.modelRadius = 10;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e2126);

    this.materials = {
      baseOpaque: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      baseTransparent: new THREE.MeshLambertMaterial({
        vertexColors: true, side: THREE.DoubleSide,
        transparent: true, opacity: 0.45, depthWrite: false,
      }),
      selected: new THREE.MeshLambertMaterial({
        color: 0x2f8ef7, emissive: 0x2f8ef7, emissiveIntensity: 0.5, side: THREE.DoubleSide,
      }),
    };

    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    this.perspCamera = new THREE.PerspectiveCamera(50, w / h, 0.01, 10000);
    this.orthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, -10000, 10000);
    this.perspCamera.up.set(0, 0, 1);
    this.orthoCamera.up.set(0, 0, 1);
    this.camera = this.perspCamera;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => { this.#needsRender = true; });

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.0));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dir1.position.set(1, -1, 2);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dir2.position.set(-1, 1, -0.5);
    this.scene.add(dir1, dir2);

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    this.raycaster = new THREE.Raycaster();

    new ResizeObserver(() => this.#onResize()).observe(container);

    const animate = () => {
      requestAnimationFrame(animate);
      this.controls.update();
      if (this.#needsRender) {
        this.#needsRender = false;
        this.renderer.render(this.scene, this.camera);
      }
    };
    animate();
  }

  get isOrthographic() { return this.camera === this.orthoCamera; }

  #onResize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.perspCamera.aspect = w / h;
    this.perspCamera.updateProjectionMatrix();
    this.#fitOrthoFrustum();
    this.#needsRender = true;
  }

  // ---------- model ----------

  setModel(meshes, bbox) {
    this.clearModel();
    this.meshes = meshes;
    for (const mesh of meshes.values()) this.modelGroup.add(mesh);
    bbox.getCenter(this.modelCenter);
    this.modelRadius = Math.max(bbox.getSize(new THREE.Vector3()).length() / 2, 0.1);
    this.setStandardView("iso");
  }

  clearModel() {
    for (const mesh of this.meshes.values()) {
      this.modelGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes = new Map();
    this.#prevSelected = new Set();
    this.#prevHidden = new Set();
    this.#needsRender = true;
  }

  // ---------- cameras / views ----------

  #fitDistance() {
    return (this.modelRadius / Math.tan(THREE.MathUtils.degToRad(this.perspCamera.fov / 2))) * 1.2;
  }

  #fitOrthoFrustum() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const aspect = w / h;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const halfH = Math.max(dist * Math.tan(THREE.MathUtils.degToRad(this.perspCamera.fov / 2)), 0.01);
    this.orthoCamera.top = halfH;
    this.orthoCamera.bottom = -halfH;
    this.orthoCamera.left = -halfH * aspect;
    this.orthoCamera.right = halfH * aspect;
    this.orthoCamera.zoom = this.isOrthographic ? this.orthoCamera.zoom : 1;
    this.orthoCamera.updateProjectionMatrix();
  }

  setStandardView(name) {
    const view = VIEW_DIRS[name];
    if (!view) return;
    const dist = this.#fitDistance();
    const pos = this.modelCenter.clone().addScaledVector(view.dir, dist);
    for (const cam of [this.perspCamera, this.orthoCamera]) {
      cam.up.copy(view.up);
      cam.position.copy(pos);
      cam.lookAt(this.modelCenter);
    }
    this.controls.target.copy(this.modelCenter);
    this.orthoCamera.zoom = 1;
    this.#fitOrthoFrustum();
    this.controls.update();
    this.#needsRender = true;
  }

  /**
   * Swaps perspective <-> orthographic, preserving position, target and the
   * effective zoom level. OrbitControls dollies the ortho camera via
   * camera.zoom (not position), so that zoom is folded back into camera
   * distance when returning to perspective.
   */
  toggleProjection() {
    const from = this.camera;
    const to = this.isOrthographic ? this.perspCamera : this.orthoCamera;
    to.position.copy(from.position);
    to.up.copy(from.up);
    if (this.isOrthographic) {
      // ortho -> persp: convert accumulated ortho zoom into camera distance
      const dir = from.position.clone().sub(this.controls.target);
      const dist = dir.length() / (this.orthoCamera.zoom || 1);
      to.position.copy(this.controls.target).addScaledVector(dir.normalize(), dist);
    }
    this.camera = to;
    if (this.isOrthographic) {
      this.orthoCamera.zoom = 1;
      this.#fitOrthoFrustum();
    } else {
      this.perspCamera.updateProjectionMatrix();
    }
    this.controls.object = to;
    this.controls.update();
    this.#needsRender = true;
    return this.isOrthographic ? "Orthographic" : "Perspective";
  }

  // ---------- display state ----------

  /** Applies selection as a delta against the previous set — O(changed). */
  applySelection(selection) {
    for (const id of this.#prevSelected) {
      if (selection.has(id)) continue;
      const mesh = this.meshes.get(id);
      if (mesh) mesh.material = mesh.userData.baseMaterial;
    }
    for (const id of selection) {
      if (this.#prevSelected.has(id)) continue;
      const mesh = this.meshes.get(id);
      if (mesh) mesh.material = this.materials.selected;
    }
    this.#prevSelected = new Set(selection);
    this.#needsRender = true;
  }

  /** Applies visibility as a delta against the previous set — O(changed). */
  applyVisibility(hidden) {
    for (const id of this.#prevHidden) {
      if (hidden.has(id)) continue;
      const mesh = this.meshes.get(id);
      if (mesh) mesh.visible = true;
    }
    for (const id of hidden) {
      if (this.#prevHidden.has(id)) continue;
      const mesh = this.meshes.get(id);
      if (mesh) mesh.visible = false;
    }
    this.#prevHidden = new Set(hidden);
    this.#needsRender = true;
  }

  // ---------- queries used by picking ----------

  /** Raycast at client coords; returns expressID or null. Hidden meshes excluded. */
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    // Raycaster does not skip invisible meshes itself, so take the nearest
    // visible hit (hits come back sorted by distance).
    const hits = this.raycaster.intersectObjects(this.modelGroup.children, false);
    for (const hit of hits) {
      if (hit.object.visible) return hit.object.userData.expressID;
    }
    return null;
  }

  /**
   * Elements whose projected screen-space AABB intersects the marquee
   * rectangle (client coords). Hidden elements are excluded. For the
   * perspective camera, bbox corners at or behind the near plane are
   * discarded (they would project to near-infinite screen coordinates); an
   * element is skipped entirely when all its corners are behind the camera.
   */
  elementsInRect(x1, y1, x2, y2) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const [minX, maxX] = x1 < x2 ? [x1, x2] : [x2, x1];
    const [minY, maxY] = y1 < y2 ? [y1, y2] : [y2, y1];

    this.camera.updateMatrixWorld();
    const viewMatrix = this.camera.matrixWorldInverse;
    const projMatrix = this.camera.projectionMatrix;
    const cullNear = !this.isOrthographic;
    const nearZ = -this.camera.near; // camera space looks down -Z
    const v = new THREE.Vector3(); // scratch, reused for every corner
    const result = [];

    for (const mesh of this.meshes.values()) {
      if (!mesh.visible) continue;
      const bb = mesh.geometry.boundingBox;
      if (!bb) continue;

      let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
      let usable = 0;

      for (const x of [bb.min.x, bb.max.x]) {
        for (const y of [bb.min.y, bb.max.y]) {
          for (const z of [bb.min.z, bb.max.z]) {
            v.set(x, y, z).applyMatrix4(viewMatrix); // world -> camera space
            if (cullNear && v.z >= nearZ) continue;  // at/behind the near plane
            v.applyMatrix4(projMatrix);              // camera -> NDC (divides by w)
            const sx = rect.left + ((v.x + 1) / 2) * rect.width;
            const sy = rect.top + ((1 - v.y) / 2) * rect.height;
            sMinX = Math.min(sMinX, sx); sMaxX = Math.max(sMaxX, sx);
            sMinY = Math.min(sMinY, sy); sMaxY = Math.max(sMaxY, sy);
            usable++;
          }
        }
      }
      if (!usable) continue;

      const intersects = sMaxX >= minX && sMinX <= maxX && sMaxY >= minY && sMinY <= maxY;
      if (intersects) result.push(mesh.userData.expressID);
    }
    return result;
  }
}
