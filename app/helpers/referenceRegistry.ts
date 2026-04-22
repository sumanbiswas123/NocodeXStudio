import type {
  ReferenceConfigModel,
  ReferenceEntry,
  ReferenceKind,
  ReferenceRegistry,
} from "./referenceTypes";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "item"
  );
}

function buildEntry(
  kind: ReferenceKind,
  masterIndex: number,
  text: string,
): ReferenceEntry {
  return {
    stableId: `${kind}:${masterIndex}:${slugify(text)}`,
    kind,
    masterIndex,
    text,
    status: "active",
  };
}

export function buildReferenceRegistry(
  model: ReferenceConfigModel,
): ReferenceRegistry {
  const entries: ReferenceEntry[] = [];
  const byStableId: Record<string, ReferenceEntry> = {};
  const byKind: ReferenceRegistry["byKind"] = {
    reference: [],
    footnote: [],
    abbreviation: [],
  };
  const byKindAndIndex: ReferenceRegistry["byKindAndIndex"] = {
    reference: {},
    footnote: {},
    abbreviation: {},
  };

  (Object.keys(model.masterLists) as ReferenceKind[]).forEach((kind) => {
    model.masterLists[kind].forEach((text, index) => {
      const entry = buildEntry(kind, index + 1, text);
      entries.push(entry);
      byStableId[entry.stableId] = entry;
      byKind[kind].push(entry);
      byKindAndIndex[kind][entry.masterIndex] = entry;
    });
  });

  return {
    entries,
    byStableId,
    byKind,
    byKindAndIndex,
  };
}
