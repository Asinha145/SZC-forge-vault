/**
 * Central application state: the loaded model's data plus selection and
 * visibility sets. All mutations go through methods that emit events, so the
 * viewer and UI panels stay in sync without referencing each other.
 *
 * Events dispatched (on the instance, an EventTarget) — listeners read the
 * current state directly off the instance, events carry no payload:
 *   "model-loaded", "model-cleared", "selection-changed", "visibility-changed"
 */
export class AppState extends EventTarget {
  constructor() {
    super();
    this.api = null;          // web-ifc IfcAPI instance
    this.modelID = -1;
    this.filename = null;     // original file name (persistence + export key)
    this.originalBuffer = null; // pristine Uint8Array of the loaded file
    this.elements = new Map();  // expressID -> element info (see propertyIndex)
    this.globalIdToExpress = new Map();
    this.filterIndex = new Map(); // psetName -> propName -> valueStr -> Set<expressID>
    this.selection = new Set();   // expressIDs
    this.hidden = new Set();      // expressIDs
    this.lastSelected = null;     // expressID whose properties are displayed
  }

  get hasModel() { return this.modelID !== -1; }

  clearModel() {
    if (this.hasModel) {
      try { this.api.CloseModel(this.modelID); } catch { /* already closed */ }
    }
    this.modelID = -1;
    this.filename = null;
    this.originalBuffer = null;
    this.elements = new Map();
    this.globalIdToExpress = new Map();
    this.filterIndex = new Map();
    this.selection = new Set();
    this.hidden = new Set();
    this.lastSelected = null;
    this.dispatchEvent(new Event("model-cleared"));
  }

  setModel({ modelID, filename, originalBuffer, elements, globalIdToExpress, filterIndex }) {
    this.modelID = modelID;
    this.filename = filename;
    this.originalBuffer = originalBuffer;
    this.elements = elements;
    this.globalIdToExpress = globalIdToExpress;
    this.filterIndex = filterIndex;
    this.dispatchEvent(new Event("model-loaded"));
  }

  // ---------- selection ----------

  #emitSelection() {
    this.dispatchEvent(new Event("selection-changed"));
  }

  setSelection(ids) {
    this.selection = new Set(ids);
    this.lastSelected = ids.length ? ids[ids.length - 1] : null;
    this.#emitSelection();
  }

  addToSelection(ids) {
    for (const id of ids) this.selection.add(id);
    if (ids.length) this.lastSelected = ids[ids.length - 1];
    this.#emitSelection();
  }

  /** Ctrl+click semantics: add if absent, remove if present. */
  toggleSelection(id) {
    if (this.selection.has(id)) {
      this.selection.delete(id);
      if (this.lastSelected === id) {
        this.lastSelected = this.selection.size ? [...this.selection].at(-1) : null;
      }
    } else {
      this.selection.add(id);
      this.lastSelected = id;
    }
    this.#emitSelection();
  }

  clearSelection() {
    if (!this.selection.size) return;
    this.selection = new Set();
    this.lastSelected = null;
    this.#emitSelection();
  }

  // ---------- visibility ----------

  #emitVisibility() {
    this.dispatchEvent(new Event("visibility-changed"));
  }

  hideSelected() {
    for (const id of this.selection) this.hidden.add(id);
    this.#emitVisibility();
  }

  hideUnselected() {
    for (const id of this.elements.keys()) {
      if (!this.selection.has(id)) this.hidden.add(id);
    }
    this.#emitVisibility();
  }

  unhideSelected() {
    for (const id of this.selection) this.hidden.delete(id);
    this.#emitVisibility();
  }

  unhideAll() {
    this.hidden = new Set();
    this.#emitVisibility();
  }
}
