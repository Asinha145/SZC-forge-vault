# Manual QA checklist — SZC IFC Viewer

Fixture: `2HWX0208AC1.ifc` (418 elements, IFC2X3).
Date: 2026-07-12. Verified in Microsoft Edge (Chromium). ✅ = confirmed.

Screenshots of the checked states are in `test/qa-screenshots/`
(regenerate with `node test/qa-screenshots.mjs`).

## Loading
- ✅ Load via **Open IFC…** file picker
- ✅ Load via drag-and-drop onto the page (drop overlay highlights)
- ✅ Status bar shows filename + `418 elements`; toolbar buttons enable
- ✅ `window.ifcModel` available in the console with full property hierarchy

## Camera
- ✅ Rotate/orbit (left-drag), pan (right-drag), zoom (wheel) — also covered by the automated test
- ✅ Top / Bottom / Left / Right / Front / Back / Isometric buttons frame the model
- ✅ Perspective ↔ Orthographic toggle (button label follows the active mode)

## Selection
- ✅ Click selects one element and highlights it (blue); empty click clears
- ✅ Ctrl+click adds/removes elements from the selection
- ✅ Shift+drag draws a marquee and selects the elements inside it
- ✅ Selection tree: pset dropdown → property dropdown → value click selects all matching elements (count shown)
- ✅ Selection tree: Ctrl+click toggles multiple distinct values; Shift+click picks a range; 3D selection = union

- ✅ Status bar tracks `N selected`

## Visibility
- ✅ Hide — hides the current selection
- ✅ Hide Unselected — only the selection stays visible (screenshot 3: 417 hidden, 1 visible)
- ✅ Unhide Selected — reveals hidden elements in the selection
- ✅ Unhide All — everything visible again

## Properties
- ✅ Right panel shows one tab per source pset (read-only) + Element tab
- ✅ SZC-ARMF tab present on every element; row 1 Module fixed to "Part Type 2"
- ✅ "+" adds a free-text Module/Value row; "−" removes an added row (row 1 has no remove button)
- ✅ Edits autosave on keystroke; reload restores them (same file + element)

## Round-trip
- ✅ Re-importing an exported `-SZC.ifc` shows a single SZC-ARMF tab, seeded with the exported values
- ✅ Loading a corrupt file leaves the current model intact (error alert only)

## Export
- ✅ Export downloads `2HWX0208AC1-SZC.ifc`
- ✅ File is valid STEP text (`ISO-10303-21` … `END-ISO-10303-21;`)
- ✅ Re-parses in web-ifc; SZC-ARMF pset attached to the correct GlobalId with the entered Module/Value pairs
- ✅ Original entities untouched (same element counts, original psets intact)

## Console
- ✅ No console errors or page errors during any of the above (asserted by the automated test)
