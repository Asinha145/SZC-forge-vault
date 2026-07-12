# SZC Forge Vault — Navisworks-style web IFC viewer

A fully client-side IFC viewer: load an IFC, inspect every property set,
filter/select elements, control visibility, attach **SZC-ARMF** custom
metadata per element, and export a new IFC with that metadata appended as
real `IfcPropertySet` entities. No backend — only a static file server
(WASM cannot load over `file://`).

Built with [web-ifc](https://github.com/ThatOpen/engine_web-ifc) 0.0.77
(parsing **and** writing) and [three.js](https://threejs.org) 0.185
(rendering). All libraries are vendored in `lib/` — no CDN, no build step,
no framework.

## Run it

From this folder:

```
python -m http.server 8000
```

then open <http://localhost:8000>. (Python 3.13 serves `.wasm` with the
correct MIME type; any static server works — `node test/serve.mjs 8000` is a
zero-dependency alternative included here.)

Load a model with **Open IFC…** or by dragging an `.ifc` file onto the page.

## Using the viewer

| Interaction | Effect |
|---|---|
| Left-drag | Orbit |
| Right-drag | Pan |
| Wheel | Zoom |
| Click | Select element (properties open in right panel) |
| Ctrl+click | Add/remove element from selection |
| Shift+drag | Box/marquee select (Ctrl+Shift+drag adds to selection) |
| Top/Bottom/Left/Right/Front/Back/Isometric | Standard views |
| Perspective/Orthographic button | Projection toggle |
| Hide / Hide Unselected / Unhide Selected / Unhide All | Visibility, driven by the current selection |

**Selection tree (left panel):** choose a property set → property → click a
value to select and highlight every matching element. The value list is a
multi-select listbox: **Ctrl+click** toggles individual values in and out of
the pick, **Shift+click** picks the whole range from the last clicked value —
the 3D selection is the union of all picked values' elements.

**Properties (right panel):** one read-only tab per property set found in
the source IFC (source metadata is *never* modified), plus:

**SZC-ARMF tab** — present for every element. A Module | Value table whose
first row's Module is fixed to `Part Type 2`; **+** adds free-text rows and
**−** removes an added row (the Part Type 2 row cannot be removed).
Every keystroke autosaves to `localStorage`, keyed by the loaded filename +
the element's IFC GlobalId, so edits survive page reloads. Rows with both
cells filled are the ones exported.

**Export button:** writes, for each element with SZC-ARMF data, a new
`IfcPropertySet` (Name = `SZC-ARMF`, one `IfcPropertySingleValue` per row)
plus an `IfcRelDefinesByProperties`, appended to a fresh copy of the
original file, and downloads it as `<original-name>-SZC.ifc`. Existing
entities are untouched — the export re-opens the pristine original bytes,
so repeated exports never duplicate psets and the source structure is
preserved exactly (new lines are appended after the existing maximum
express ID).

**Debugging:** after a load, `window.ifcModel` exposes the full model —
`elements` (per-element pset hierarchy), `globalIdToExpress`, `filterIndex`,
`state`, `viewer`, and the raw web-ifc `api`.

## Testing

Automated smoke test (Playwright on the system-installed Edge — no browser
download):

```
cd test
npm install
npx playwright test
```

Covers: load + element count, pset dropdown population, filter-driven
selection, click/ctrl+click, shift+drag box select, orbit/pan/zoom, all
visibility buttons, projection toggle + standard views, SZC-ARMF autosave
surviving a reload, and export validation — the downloaded file is
re-parsed with web-ifc and the SZC-ARMF pset is checked against the correct
GlobalId, values, and original element counts. Console errors fail the test.

`node test/qa-screenshots.mjs` regenerates the manual-QA screenshots in
`test/qa-screenshots/`. The manual checklist is in `MANUAL_QA.md`.

The test fixture is
`..\Solving Dataset\2hwx0208ac1_run\input\2HWX0208AC1.ifc`
(418 elements, IFC2X3, 17 property sets).

## Project structure

```
index.html               layout: toolbar / filter panel / viewport / property tabs
css/style.css
lib/                     vendored: web-ifc 0.0.77 (browser build + wasm), three.js 0.185
js/
  main.js                bootstrap + wiring only (no domain logic)
  state.js               selection/visibility state, pub-sub events
  storage.js             SZC-ARMF localStorage persistence
  ifc/
    modelLoader.js       web-ifc init, geometry -> one merged mesh per element
    propertyIndex.js     pset traversal + duplicate-shadowing fix + filter index
    exporter.js          SZC-ARMF pset writing on a fresh copy, STEP download
  viewer/
    viewer.js            scene, dual cameras, standard views, materials, queries
    picking.js           click / ctrl+click / shift+drag marquee
  ui/
    filterPanel.js       pset -> property -> value selection tree
    propertiesPanel.js   Navisworks-style read-only tabs
    armfTab.js           editable SZC-ARMF table
test/                    Playwright smoke test + static server + QA screenshots
```

## Design notes

- **Property traversal** ports `ifc_property_extractorv3.py`: one pass over
  `IfcRelDefinesByProperties` → `IfcPropertySet` → `IfcPropertySingleValue`
  leaves, with each pset parsed once (cached). It includes the v3
  *duplicate-property shadowing fix*: when a pset holds two same-named
  properties (one populated, one null), the first non-null value wins
  instead of file order silently dropping data.
- **Indexes are built once at load**: `filterIndex`
  (pset → property → value → Set of elements) makes every selection-tree
  lookup O(1); `globalIdToExpress` makes export lookups O(1). Nothing
  re-traverses the IFC after load.
- **Geometry**: one merged `BufferGeometry` per element, colours baked as
  vertex colours, two shared materials (opaque/transparent) + one shared
  highlight material. Selection = material swap; hide = `mesh.visible`.
  No geometry ever rebuilds after load. Models open with
  `COORDINATE_TO_ORIGIN` so large site coordinates keep float precision.
- **IFC is Z-up** — cameras use `up = +Z` (plan views temporarily use +Y to
  avoid a degenerate up vector).

## Extension points

- **More custom psets**: the SZC-ARMF name and row schema live in
  `armfTab.js`/`storage.js`/`exporter.js`; a second custom pset means
  parameterising those three modules by pset name (including the
  localStorage key scheme) — contained, but a deliberate step, not free.
- **Property editing / search / colour overrides**: `propertyIndex.js`
  already holds the full hierarchy in Maps; UI panels are isolated modules
  subscribed to `state` events.
- **Very large models**: swap per-element meshes for `BatchedMesh` /
  instancing inside `modelLoader.js` + `viewer.js` (the `expressID` →
  display-object contract is the only interface), add three-mesh-bvh for
  raycasting, and move SZC-ARMF storage to IndexedDB (swap `storage.js`).
- **Measurement / section planes / BCF**: the viewer exposes
  camera/scene/picking; new tools attach to `state` events without touching
  existing modules.
