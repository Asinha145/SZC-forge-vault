/**
 * Property extraction and indexing.
 *
 * Traversal mirrors ifc_property_extractorv3.py: a single pass over every
 * IfcRelDefinesByProperties resolves IfcPropertySet -> HasProperties ->
 * IfcPropertySingleValue leaves, keyed by element. Each IfcPropertySet line
 * is parsed once and cached, so shared psets cost nothing extra.
 *
 * Duplicate-property shadowing fix (ported from the v3 Python script): some
 * psets contain two properties with the SAME name — one populated, one null.
 * Naive dict-building lets whichever comes last silently overwrite the other.
 * Here inserts follow "first non-null wins": a null never overwrites a value,
 * and a later non-null fills a null placeholder.
 *
 * Output indexes:
 *   elements:          expressID -> { expressID, globalId, name, objectType,
 *                                     ifcClass, psets: Map<pset, Map<prop, value>> }
 *   globalIdToExpress: GlobalId -> expressID
 *   filterIndex:       psetName -> propName -> valueString -> Set<expressID>
 *                      (drives the selection tree with O(1) lookups)
 */
import { WebIFC } from "./modelLoader.js";

const EMPTY_VALUE_LABEL = "(empty)";

export function buildPropertyIndex(api, modelID, elementIDs) {
  const elements = new Map();
  const globalIdToExpress = new Map();

  for (const id of elementIDs) {
    const line = api.GetLine(modelID, id);
    const globalId = line.GlobalId?.value ?? null;
    const el = {
      expressID: id,
      globalId,
      name: line.Name?.value ?? null,
      objectType: line.ObjectType?.value ?? null,
      ifcClass: api.GetNameFromTypeCode(api.GetLineType(modelID, id)),
      psets: new Map(),
    };
    elements.set(id, el);
    if (globalId) globalIdToExpress.set(globalId, id);
  }

  const psetCache = new Map(); // pset expressID -> { name, props: [name, value][] }
  const rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);

  for (let i = 0; i < rels.size(); i++) {
    const rel = api.GetLine(modelID, rels.get(i));
    const pdefID = rel.RelatingPropertyDefinition?.value;
    if (!pdefID || api.GetLineType(modelID, pdefID) !== WebIFC.IFCPROPERTYSET) continue;

    let parsed = psetCache.get(pdefID);
    if (!parsed) {
      parsed = parsePset(api, modelID, pdefID);
      psetCache.set(pdefID, parsed);
    }
    if (!parsed.name) continue;

    for (const ref of rel.RelatedObjects ?? []) {
      const el = elements.get(ref.value);
      if (!el) continue; // element without geometry — not shown in the viewer
      let propMap = el.psets.get(parsed.name);
      if (!propMap) {
        propMap = new Map();
        el.psets.set(parsed.name, propMap);
      }
      for (const [pName, pValue] of parsed.props) {
        const existing = propMap.get(pName);
        // first non-null wins; a later non-null may fill a null placeholder
        if (existing === undefined || (existing === null && pValue !== null)) {
          propMap.set(pName, pValue);
        }
      }
    }
  }

  const filterIndex = buildFilterIndex(elements);
  return { elements, globalIdToExpress, filterIndex };
}

function parsePset(api, modelID, pdefID) {
  const pset = api.GetLine(modelID, pdefID);
  const props = [];
  for (const h of pset.HasProperties ?? []) {
    if (api.GetLineType(modelID, h.value) !== WebIFC.IFCPROPERTYSINGLEVALUE) continue;
    const p = api.GetLine(modelID, h.value);
    const name = p.Name?.value;
    if (name === undefined || name === null) continue;
    props.push([name, p.NominalValue?.value ?? null]);
  }
  return { name: pset.Name?.value ?? null, props };
}

export function formatValue(value) {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE_LABEL;
  return String(value);
}

function buildFilterIndex(elements) {
  const index = new Map();
  for (const el of elements.values()) {
    for (const [psetName, props] of el.psets) {
      let propIndex = index.get(psetName);
      if (!propIndex) { propIndex = new Map(); index.set(psetName, propIndex); }
      for (const [propName, value] of props) {
        let valueIndex = propIndex.get(propName);
        if (!valueIndex) { valueIndex = new Map(); propIndex.set(propName, valueIndex); }
        const key = formatValue(value);
        let set = valueIndex.get(key);
        if (!set) { set = new Set(); valueIndex.set(key, set); }
        set.add(el.expressID);
      }
    }
  }
  return index;
}
