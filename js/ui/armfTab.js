/**
 * The editable "SZC-ARMF" tab: a Module | Value table where row 1's Module is
 * the fixed label "Part Type 2" and every other cell is free text. "+" adds a
 * row; "−" on an added row deletes it (row 1 cannot be deleted). Every
 * keystroke autosaves to localStorage keyed by filename+GlobalId
 * (storage.js) — no save button, and a page reload restores the data.
 * Purely additive: source IFC metadata is never touched.
 */
import { getArmfRows, saveArmfRows, hasSavedArmf } from "../storage.js";

export function renderArmfTab(state, el) {
  const wrap = document.createElement("div");

  if (!el.globalId) {
    // Storage and export are keyed by GlobalId — without one, edits could
    // never round-trip, so surface that instead of silently losing data.
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "This element has no GlobalId in the IFC, so SZC-ARMF data cannot be attached to it.";
    wrap.appendChild(note);
    return wrap;
  }

  const rows = initialRows(state, el);

  const table = document.createElement("table");
  table.className = "props";
  table.id = "armf-table";
  table.innerHTML = `<thead><tr><th>Module</th><th>Value</th><th class="armf-action"></th></tr></thead>`;
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  const save = () => {
    const collected = [...tbody.rows].map((tr, i) => ({
      module: i === 0 ? "Part Type 2" : tr.querySelector(".armf-module-input").value,
      value: tr.querySelector(".armf-value-input").value,
    }));
    saveArmfRows(state.filename, el.globalId, collected);
  };

  const addRow = (row, isFirst) => {
    const tr = document.createElement("tr");

    const tdModule = document.createElement("td");
    if (isFirst) {
      tdModule.className = "fixed-module";
      tdModule.textContent = "Part Type 2";
    } else {
      const input = document.createElement("input");
      input.className = "armf-module-input";
      input.placeholder = "Module";
      input.value = row.module ?? "";
      input.addEventListener("input", save);
      tdModule.appendChild(input);
    }

    const tdValue = document.createElement("td");
    const valueInput = document.createElement("input");
    valueInput.className = "armf-value-input";
    valueInput.placeholder = "Value";
    valueInput.value = row.value ?? "";
    valueInput.addEventListener("input", save);
    tdValue.appendChild(valueInput);

    const tdAction = document.createElement("td");
    tdAction.className = "armf-action";
    if (!isFirst) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "armf-remove-row";
      removeBtn.textContent = "−";
      removeBtn.title = "Remove this row";
      removeBtn.addEventListener("click", () => {
        tr.remove();
        save();
      });
      tdAction.appendChild(removeBtn);
    }

    tr.append(tdModule, tdValue, tdAction);
    tbody.appendChild(tr);
  };

  rows.forEach((row, i) => addRow(row, i === 0));

  const addBtn = document.createElement("button");
  addBtn.className = "btn";
  addBtn.id = "armf-add-row";
  addBtn.textContent = "+";
  addBtn.title = "Add a row";
  addBtn.addEventListener("click", () => {
    addRow({ module: "", value: "" }, false);
    save();
  });

  const note = document.createElement("p");
  note.className = "armf-note";
  note.textContent = "Autosaved locally per element. Rows with both cells filled are written to the exported IFC as an SZC-ARMF property set.";

  wrap.append(table, addBtn, note);
  return wrap;
}

/**
 * Saved rows win; otherwise, when the loaded file already carries an
 * SZC-ARMF pset (a re-imported export), seed the editable table from it so
 * previously exported values round-trip instead of hiding behind a
 * duplicate read-only tab.
 */
function initialRows(state, el) {
  if (hasSavedArmf(state.filename, el.globalId)) {
    return getArmfRows(state.filename, el.globalId);
  }
  const source = el.psets.get("SZC-ARMF");
  if (source && source.size) {
    const rows = [{ module: "Part Type 2", value: String(source.get("Part Type 2") ?? "") }];
    for (const [module, value] of source) {
      if (module === "Part Type 2") continue;
      rows.push({ module, value: String(value ?? "") });
    }
    return rows;
  }
  return getArmfRows(state.filename, el.globalId);
}
