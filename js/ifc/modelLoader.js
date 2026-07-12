/**
 * web-ifc initialisation and geometry extraction.
 *
 * Geometry strategy: one merged THREE.BufferGeometry (and one THREE.Mesh) per
 * IFC product. Colours are baked as vertex colours so every opaque element
 * shares a single material — draw calls scale with element count, materials
 * don't. Models are opened with COORDINATE_TO_ORIGIN so large site
 * coordinates (HPC models are hundreds of metres from origin) don't destroy
 * float precision in the viewport. This setting affects viewing geometry
 * only; export re-opens the pristine original bytes (see exporter.js).
 */
import * as WebIFC from "../../lib/web-ifc-api.js";
import * as THREE from "three";

export { WebIFC };

export async function initIfcApi() {
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath("./lib/");
  await api.Init();
  api.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_ERROR);
  return api;
}

export function openModel(api, buffer) {
  return api.OpenModel(buffer, { COORDINATE_TO_ORIGIN: true });
}

/**
 * Builds one THREE.Mesh per element that has geometry.
 * Returns { meshes: Map<expressID, THREE.Mesh>, bbox: THREE.Box3 }.
 */
export function buildMeshes(api, modelID, materials) {
  const meshes = new Map();
  const bbox = new THREE.Box3();
  const tmpMatrix = new THREE.Matrix4();

  api.StreamAllMeshes(modelID, (flatMesh) => {
    const parts = [];
    let transparent = false;
    const placed = flatMesh.geometries;

    for (let i = 0; i < placed.size(); i++) {
      const p = placed.get(i);
      const geomHandle = api.GetGeometry(modelID, p.geometryExpressID);
      const verts = api.GetVertexArray(geomHandle.GetVertexData(), geomHandle.GetVertexDataSize()).slice();
      const indices = api.GetIndexArray(geomHandle.GetIndexData(), geomHandle.GetIndexDataSize()).slice();
      geomHandle.delete();

      // verts are interleaved [x y z nx ny nz]
      const n = verts.length / 6;
      const positions = new Float32Array(n * 3);
      const normals = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) {
        positions[v * 3] = verts[v * 6];
        positions[v * 3 + 1] = verts[v * 6 + 1];
        positions[v * 3 + 2] = verts[v * 6 + 2];
        normals[v * 3] = verts[v * 6 + 3];
        normals[v * 3 + 1] = verts[v * 6 + 4];
        normals[v * 3 + 2] = verts[v * 6 + 5];
        colors[v * 3] = p.color.x;
        colors[v * 3 + 1] = p.color.y;
        colors[v * 3 + 2] = p.color.z;
      }
      if (p.color.w < 1) transparent = true;

      tmpMatrix.fromArray(p.flatTransformation);
      parts.push({ positions, normals, colors, indices, matrix: tmpMatrix.clone() });
    }

    if (!parts.length) return;

    const geometry = mergeParts(parts);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, transparent ? materials.baseTransparent : materials.baseOpaque);
    mesh.userData.expressID = flatMesh.expressID;
    mesh.userData.baseMaterial = mesh.material;
    mesh.matrixAutoUpdate = false; // geometry is baked in world coordinates
    meshes.set(flatMesh.expressID, mesh);
    bbox.union(geometry.boundingBox);
  });

  return { meshes, bbox };
}

/** Concatenates transformed parts into a single indexed BufferGeometry. */
function mergeParts(parts) {
  let vTotal = 0, iTotal = 0;
  for (const p of parts) { vTotal += p.positions.length / 3; iTotal += p.indices.length; }

  const positions = new Float32Array(vTotal * 3);
  const normals = new Float32Array(vTotal * 3);
  const colors = new Float32Array(vTotal * 3);
  const indices = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);

  const pos = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  let vOff = 0, iOff = 0;
  for (const p of parts) {
    const n = p.positions.length / 3;
    normalMatrix.getNormalMatrix(p.matrix);
    for (let v = 0; v < n; v++) {
      pos.fromArray(p.positions, v * 3).applyMatrix4(p.matrix);
      nrm.fromArray(p.normals, v * 3).applyMatrix3(normalMatrix).normalize();
      const o = (vOff + v) * 3;
      positions[o] = pos.x; positions[o + 1] = pos.y; positions[o + 2] = pos.z;
      normals[o] = nrm.x; normals[o + 1] = nrm.y; normals[o + 2] = nrm.z;
    }
    colors.set(p.colors, vOff * 3);
    for (let i = 0; i < p.indices.length; i++) indices[iOff + i] = p.indices[i] + vOff;
    vOff += n;
    iOff += p.indices.length;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}
