/**
 * Application bootstrap and wiring. Owns no domain logic — it connects the
 * loader, property index, viewer, panels, storage and exporter together and
 * exposes window.ifcModel for console debugging and automated tests.
 */
import { initIfcApi, openModel, buildMeshes } from "./ifc/modelLoader.js";
import { buildPropertyIndex } from "./ifc/propertyIndex.js";
import { buildExport, downloadExport } from "./ifc/exporter.js";
import { AppState } from "./state.js";
import { Viewer } from "./viewer/viewer.js";
import { attachPicking } from "./viewer/picking.js";
import { FilterPanel } from "./ui/filterPanel.js";
import { PropertiesPanel } from "./ui/propertiesPanel.js";
import { loadAllArmf } from "./storage.js";

const $ = (id) => document.getElementById(id);

const state = new AppState();
const viewer = new Viewer($("viewport"));
new FilterPanel(state);
new PropertiesPanel(state);
attachPicking(viewer, state, $("marquee"));

// Debug/inspection handle (also used by the automated smoke test). Defined
// once with live getters so it can never go stale across model reloads.
window.ifcModel = {
  state,
  viewer,
  get api() { return state.api; },
  get modelID() { return state.modelID; },
  get filename() { return state.filename; },
  get elements() { return state.elements; },
  get globalIdToExpress() { return state.globalIdToExpress; },
  get filterIndex() { return state.filterIndex; },
  selection: () => [...state.selection],
  hidden: () => [...state.hidden],
};

const MODEL_BUTTONS = [
  "btn-hide", "btn-hide-unselected", "btn-unhide-selected", "btn-unhide-all",
  "btn-view-top", "btn-view-bottom", "btn-view-left", "btn-view-right",
  "btn-view-front", "btn-view-back", "btn-view-iso", "btn-projection", "btn-export",
];

// ---------- status bar ----------

function updateStatus() {
  $("status-file").textContent = state.filename ?? "No model loaded";
  $("status-elements").textContent = state.hasModel ? `${state.elements.size} elements` : "";
  $("status-selected").textContent = state.selection.size ? `${state.selection.size} selected` : "";
  $("status-hidden").textContent = state.hidden.size ? `${state.hidden.size} hidden` : "";
}

state.addEventListener("selection-changed", () => {
  viewer.applySelection(state.selection);
  updateStatus();
});
state.addEventListener("visibility-changed", () => {
  viewer.applyVisibility(state.hidden);
  updateStatus();
});
state.addEventListener("model-loaded", updateStatus);
state.addEventListener("model-cleared", updateStatus);

// ---------- loading ----------

const apiReady = initIfcApi().then((api) => { state.api = api; });

// Monotonic token: a newer load supersedes any in-flight one, so overlapping
// drops can't finish out of order or fight over shared state.
let loadToken = 0;

async function loadFile(file) {
  const token = ++loadToken;
  const loading = $("loading");
  loading.hidden = false;
  $("loading-text").textContent = `Loading ${file.name}…`;

  let modelID = -1;
  try {
    await apiReady;
    const api = state.api;
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (token !== loadToken) return; // superseded by a newer load

    // Build everything for the new file BEFORE touching the current model,
    // so a corrupt file leaves the loaded model fully intact.
    modelID = openModel(api, buffer.slice()); // keep `buffer` pristine for export
    const { meshes, bbox } = buildMeshes(api, modelID, viewer.materials);
    const { elements, globalIdToExpress, filterIndex } =
      buildPropertyIndex(api, modelID, [...meshes.keys()]);

    if (token !== loadToken) { // superseded mid-parse — discard this model
      api.CloseModel(modelID);
      return;
    }

    if (state.hasModel) state.clearModel(); // closes the previous modelID
    state.setModel({
      modelID, filename: file.name, originalBuffer: buffer,
      elements, globalIdToExpress, filterIndex,
    });
    viewer.setModel(meshes, bbox); // disposes the previous scene meshes

    for (const id of MODEL_BUTTONS) $(id).disabled = false;
    $("dropzone").classList.add("hidden");
    console.log(`Loaded ${file.name}: ${elements.size} elements, ${filterIndex.size} property sets (window.ifcModel available)`);
  } catch (err) {
    if (modelID !== -1) {
      try { state.api.CloseModel(modelID); } catch { /* already closed */ }
    }
    console.error("Failed to load IFC:", err);
    alert(`Failed to load IFC file:\n${err.message ?? err}`);
  } finally {
    if (token === loadToken) loading.hidden = true;
  }
}

$("file-input").addEventListener("change", (e) => {
  if (e.target.files.length) loadFile(e.target.files[0]);
  e.target.value = ""; // allow re-loading the same file
});

// Drag & drop — listen on the whole window so drops work after the initial
// dropzone overlay is hidden.
const dropzone = $("dropzone");
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.remove("hidden");
  dropzone.classList.add("dragover");
});
window.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) {
    dropzone.classList.remove("dragover");
    if (state.hasModel) dropzone.classList.add("hidden");
  }
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (state.hasModel) dropzone.classList.add("hidden");
  const file = [...e.dataTransfer.files].find((f) => /\.ifc$/i.test(f.name));
  if (file) loadFile(file);
});

// ---------- toolbar ----------

$("btn-hide").addEventListener("click", () => state.hideSelected());
$("btn-hide-unselected").addEventListener("click", () => state.hideUnselected());
$("btn-unhide-selected").addEventListener("click", () => state.unhideSelected());
$("btn-unhide-all").addEventListener("click", () => state.unhideAll());

for (const name of ["top", "bottom", "left", "right", "front", "back", "iso"]) {
  $(`btn-view-${name}`).addEventListener("click", () => viewer.setStandardView(name));
}
$("btn-projection").addEventListener("click", (e) => {
  e.target.textContent = viewer.toggleProjection();
});

$("btn-export").addEventListener("click", () => {
  try {
    if (!state.hasModel) return;
    const armfByGid = loadAllArmf(state.filename);
    const { bytes, psetsWritten, skipped } =
      buildExport(state.api, state.originalBuffer, armfByGid, state.globalIdToExpress);
    const name = downloadExport(bytes, state.filename);
    if (skipped.length) console.warn("Export: GlobalIds not found in model:", skipped);
    console.log(`Exported ${name}: ${psetsWritten} SZC-ARMF property set(s) written`);
    if (!psetsWritten) {
      alert("Export created, but no SZC-ARMF data was found to append.\nFill in the SZC-ARMF tab for at least one element first (both Module and Value cells).");
    }
  } catch (err) {
    console.error("Export failed:", err);
    alert(`Export failed:\n${err.message ?? err}`);
  }
});
