/**
 * Right panel — Navisworks-style tabbed properties for the last-selected
 * element: an "Element" tab (base attributes), one read-only tab per pset
 * present in the source IFC, and the editable "SZC-ARMF" tab (armfTab.js).
 * Source psets are display-only and never mutated.
 */
import { formatValue } from "../ifc/propertyIndex.js";
import { escapeHtml } from "./filterPanel.js";
import { renderArmfTab } from "./armfTab.js";

const ARMF_TAB = "SZC-ARMF";
const ELEMENT_TAB = "Element";

export class PropertiesPanel {
  constructor(state) {
    this.state = state;
    this.title = document.getElementById("props-title");
    this.tabsNav = document.getElementById("tabs");
    this.content = document.getElementById("tab-content");
    this.activeTab = ELEMENT_TAB; // sticky across element changes when possible

    state.addEventListener("selection-changed", () => this.render());
    state.addEventListener("model-cleared", () => this.render());
  }

  render() {
    const el = this.state.lastSelected !== null
      ? this.state.elements.get(this.state.lastSelected)
      : null;

    if (!el) {
      this.title.textContent = "Properties";
      this.tabsNav.innerHTML = "";
      this.content.innerHTML = `<p class="hint">Click an element in the 3D view, or filter from the selection tree.</p>`;
      return;
    }

    this.title.textContent = `Properties — ${el.name ?? el.globalId}`;
    // A re-imported export may contain a source pset named SZC-ARMF; the
    // editable tab (seeded from it, see armfTab.js) is the single tab for it.
    const sourceTabs = [...el.psets.keys()]
      .filter((n) => n !== ARMF_TAB)
      .sort((a, b) => a.localeCompare(b));
    const tabNames = [ELEMENT_TAB, ...sourceTabs, ARMF_TAB];
    if (!tabNames.includes(this.activeTab)) this.activeTab = ELEMENT_TAB;

    this.tabsNav.innerHTML = "";
    for (const name of tabNames) {
      const btn = document.createElement("button");
      btn.className = "tab" + (name === this.activeTab ? " active" : "");
      btn.textContent = name;
      btn.title = name;
      btn.dataset.tab = name;
      btn.addEventListener("click", () => {
        this.activeTab = name;
        this.render();
      });
      this.tabsNav.appendChild(btn);
    }

    this.content.innerHTML = "";
    if (this.activeTab === ARMF_TAB) {
      this.content.appendChild(renderArmfTab(this.state, el));
    } else if (this.activeTab === ELEMENT_TAB) {
      this.content.appendChild(propsTable([
        ["IFC Class", el.ifcClass],
        ["Name", el.name],
        ["GlobalId", el.globalId],
        ["ObjectType", el.objectType],
        ["Express ID", el.expressID],
      ]));
    } else {
      const props = el.psets.get(this.activeTab);
      this.content.appendChild(propsTable(props ? [...props.entries()] : []));
    }
  }
}

function propsTable(entries) {
  const table = document.createElement("table");
  table.className = "props";
  table.innerHTML =
    `<thead><tr><th>Property</th><th>Value</th></tr></thead><tbody>` +
    entries.map(([k, v]) =>
      `<tr><td class="prop-name">${escapeHtml(k)}</td><td>${escapeHtml(formatValue(v))}</td></tr>`,
    ).join("") +
    `</tbody>`;
  return table;
}
