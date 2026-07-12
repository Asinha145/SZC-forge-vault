/**
 * IFC export with SZC-ARMF property sets appended.
 *
 * Strategy: open a FRESH model from the pristine original file bytes, append
 * one IfcPropertySet (Name = "SZC-ARMF") + IfcRelDefinesByProperties per
 * element that has SZC-ARMF rows, save, close. GlobalIds are resolved
 * against the export model itself (web-ifc's guid map), so the psets attach
 * to the right elements even if the viewer model ever diverges; the viewer's
 * map is only a fallback. Working on a copy guarantees the in-viewer model
 * is never mutated and repeated exports never accumulate duplicate psets.
 *
 * All new entities are appended after the existing maximum express ID
 * (web-ifc's WriteLine assigns max+1); existing lines are never rewritten.
 */
import { WebIFC } from "./modelLoader.js";

/**
 * @param api        initialised IfcAPI
 * @param buffer     pristine Uint8Array of the original file
 * @param armfByGid  { GlobalId: [{ module, value }, ...] }
 * @param gidToExpr  Map<GlobalId, expressID> from the viewer model (fallback)
 * @returns { bytes: Uint8Array, psetsWritten: number, skipped: string[] }
 */
export function buildExport(api, buffer, armfByGid, gidToExpr) {
  if (!buffer) throw new Error("No model is loaded.");
  const modelID = api.OpenModel(buffer.slice()); // slice: OpenModel may transfer the buffer
  try {
    const schemaName = api.GetModelSchema(modelID);
    const ns = WebIFC[schemaName] ?? WebIFC.IFC2X3;

    // Reuse the file's first owner history — mandatory field in IFC2X3.
    const ohIDs = api.GetLineIDsWithType(modelID, WebIFC.IFCOWNERHISTORY);
    const ownerHistory = ohIDs.size() ? new WebIFC.Handle(ohIDs.get(0)) : null;

    let psetsWritten = 0;
    const skipped = [];

    for (const [globalId, rows] of Object.entries(armfByGid)) {
      const expressID = api.GetExpressIdFromGuid(modelID, globalId) ?? gidToExpr.get(globalId);
      if (!expressID) { skipped.push(globalId); continue; }

      const props = rows
        .filter((r) => (r.module ?? "").trim() !== "" && (r.value ?? "").trim() !== "")
        .map((r) => new ns.IfcPropertySingleValue(
          new ns.IfcIdentifier(r.module.trim()),
          null,
          new ns.IfcLabel(String(r.value).trim()),
          null,
        ));
      if (!props.length) continue;

      const pset = new ns.IfcPropertySet(
        api.CreateIFCGloballyUniqueId(modelID),
        ownerHistory,
        new ns.IfcLabel("SZC-ARMF"),
        null,
        props,
      );
      api.WriteLine(modelID, pset); // writes nested props too, assigns express IDs

      const rel = new ns.IfcRelDefinesByProperties(
        api.CreateIFCGloballyUniqueId(modelID),
        ownerHistory,
        null,
        null,
        [new WebIFC.Handle(expressID)],
        new WebIFC.Handle(pset.expressID),
      );
      api.WriteLine(modelID, rel);
      psetsWritten++;
    }

    const bytes = api.SaveModel(modelID);
    return { bytes, psetsWritten, skipped };
  } finally {
    api.CloseModel(modelID);
  }
}

/** Browser download of the exported bytes as <original>-SZC.ifc. */
export function downloadExport(bytes, originalFilename) {
  const base = originalFilename.replace(/\.ifc$/i, "");
  const name = `${base}-SZC.ifc`;
  const blob = new Blob([bytes], { type: "application/x-step" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return name;
}
