/**
 * Left panel — selection tree. Pset dropdown -> property dropdown -> value
 * list; picking values selects (and highlights) every matching element.
 *
 * The value list is a multi-select listbox:
 *   click        -> select just that value
 *   ctrl+click   -> toggle a value in/out of the picked set
 *   shift+click  -> select the range from the last clicked value
 * The element selection is the union of all picked values' element sets.
 *
 * All lookups hit the prebuilt filterIndex, so nothing here scales with
 * model size beyond the number of distinct values displayed.
 */
export class FilterPanel {
  constructor(state) {
    this.state = state;
    this.psetSelect = document.getElementById("pset-select");
    this.propSelect = document.getElementById("prop-select");
    this.valueList = document.getElementById("value-list");
    this.status = document.getElementById("filter-status");
    this.clearBtn = document.getElementById("btn-clear-filter");

    this.valueItems = [];      // [{ li, ids, key }] in render order
    this.pickedKeys = new Set(); // value keys currently picked
    this.anchorIndex = null;   // range anchor for shift+click
    this.applying = false;     // true while this panel itself sets the selection

    this.psetSelect.addEventListener("change", () => this.#renderProps());
    this.propSelect.addEventListener("change", () => this.#renderValues());
    this.clearBtn.addEventListener("click", () => {
      this.state.clearSelection();
      this.#resetPicks();
      this.#applyPickClasses();
      this.status.textContent = "";
    });

    state.addEventListener("model-loaded", () => this.populate());
    state.addEventListener("model-cleared", () => this.reset());
    // A selection made elsewhere (canvas click, box select) invalidates the
    // picked values — otherwise the next ctrl/shift+click would silently
    // re-impose them over the user's newer selection.
    state.addEventListener("selection-changed", () => {
      if (this.applying) return;
      this.#resetPicks();
      this.#applyPickClasses();
      this.status.textContent = "";
    });
  }

  reset() {
    this.psetSelect.innerHTML = `<option value="">— load a model —</option>`;
    this.psetSelect.disabled = true;
    this.propSelect.innerHTML = `<option value="">—</option>`;
    this.propSelect.disabled = true;
    this.valueList.innerHTML = "";
    this.status.textContent = "";
    this.valueItems = [];
    this.#resetPicks();
  }

  populate() {
    const psetNames = [...this.state.filterIndex.keys()].sort((a, b) => a.localeCompare(b));
    this.psetSelect.innerHTML =
      `<option value="">— choose a property set —</option>` +
      psetNames.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    this.psetSelect.disabled = false;
    this.propSelect.disabled = false;
    this.#renderProps();
  }

  #renderProps() {
    const propIndex = this.state.filterIndex.get(this.psetSelect.value);
    const names = propIndex ? [...propIndex.keys()].sort((a, b) => a.localeCompare(b)) : [];
    this.propSelect.innerHTML =
      `<option value="">— choose a property —</option>` +
      names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    this.#renderValues();
  }

  #renderValues() {
    const valueIndex = this.state.filterIndex
      .get(this.psetSelect.value)?.get(this.propSelect.value);
    this.valueList.innerHTML = "";
    this.status.textContent = "";
    this.valueItems = [];
    this.#resetPicks();
    if (!valueIndex) return;

    const entries = [...valueIndex.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }));
    entries.forEach(([valueStr, ids], index) => {
      const li = document.createElement("li");
      li.className = "value-item";
      li.innerHTML = `<span class="v">${escapeHtml(valueStr)}</span><span class="count">${ids.size}</span>`;
      li.addEventListener("click", (e) => this.#onValueClick(e, index));
      this.valueList.appendChild(li);
      this.valueItems.push({ li, ids, key: valueStr });
    });
  }

  #onValueClick(e, index) {
    const item = this.valueItems[index];
    if (e.shiftKey && this.anchorIndex !== null) {
      // range replaces the picked set (standard listbox behaviour)
      const [from, to] = this.anchorIndex < index
        ? [this.anchorIndex, index] : [index, this.anchorIndex];
      this.pickedKeys = new Set(this.valueItems.slice(from, to + 1).map((it) => it.key));
    } else if (e.ctrlKey || e.metaKey) {
      if (this.pickedKeys.has(item.key)) this.pickedKeys.delete(item.key);
      else this.pickedKeys.add(item.key);
      this.anchorIndex = index;
    } else {
      this.pickedKeys = new Set([item.key]);
      this.anchorIndex = index;
    }
    this.#applyPicks();
  }

  #applyPicks() {
    this.#applyPickClasses();
    const union = new Set();
    let pickedCount = 0;
    for (const it of this.valueItems) {
      if (!this.pickedKeys.has(it.key)) continue;
      pickedCount++;
      for (const id of it.ids) union.add(id);
    }
    this.applying = true;
    try {
      this.state.setSelection([...union]);
    } finally {
      this.applying = false;
    }
    this.status.textContent = union.size
      ? `${union.size} element${union.size === 1 ? "" : "s"} from ${pickedCount} value${pickedCount === 1 ? "" : "s"}`
      : "";
  }

  #applyPickClasses() {
    for (const it of this.valueItems) {
      it.li.classList.toggle("active", this.pickedKeys.has(it.key));
    }
  }

  #resetPicks() {
    this.pickedKeys = new Set();
    this.anchorIndex = null;
  }
}

/** Escapes text for both element content and (double-quoted) attributes. */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
