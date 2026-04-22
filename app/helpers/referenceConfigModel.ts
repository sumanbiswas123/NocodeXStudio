import type {
  ReferenceAuditIssue,
  ReferenceConfigModel,
  ReferenceKind,
} from "./referenceTypes";

type ConfigLike = Record<string, any>;

const MASTER_KEY_ALIASES: Record<ReferenceKind, string[]> = {
  reference: ["referencesAll"],
  footnote: ["footnotesAll"],
  abbreviation: ["abbreviationsAll", "abbreviationAll"],
};

const PAGE_KEY_ALIASES: Record<ReferenceKind, string[]> = {
  reference: ["pageReferencesAll"],
  footnote: ["pageFootnotesAll"],
  abbreviation: ["pageAbbreviationsAll", "pageAbbreviationAll"],
};

const BOOL_KEYS = [
  "embedReferences",
  "tabReferences",
  "fullScroll",
  "referencesTabFunctionality",
  "embedPopupReferences",
  "allReferencesAlphabetical",
  "abbreviationSingle",
] as const;

function issue(
  id: string,
  severity: ReferenceAuditIssue["severity"],
  title: string,
  detail: string,
): ReferenceAuditIssue {
  return {
    id,
    severity,
    source: "config",
    title,
    detail,
  };
}

function normalizeTextArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function normalizeNumericMatrix(input: unknown, pageCount: number): number[][] {
  const rows = Array.isArray(input) ? input : [];
  const result: number[][] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const row = Array.isArray(rows[index]) ? rows[index] : [];
    result.push(
      row
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    );
  }
  return result;
}

function getFirstDefinedArray(config: ConfigLike, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(config[key])) return { key, value: config[key] };
  }
  return null;
}

export function buildReferenceConfigModel(
  configDraft: ConfigLike | null,
): ReferenceConfigModel {
  const issues: ReferenceAuditIssue[] = [];
  const aliasKeysUsed: string[] = [];
  const pagesAll = Array.isArray(configDraft?.pagesAll)
    ? configDraft?.pagesAll.filter(
        (entry: unknown) => typeof entry === "string",
      )
    : [];

  const masterLists = {
    reference: [] as string[],
    footnote: [] as string[],
    abbreviation: [] as string[],
  };
  const pageMappings = {
    reference: [] as number[][],
    footnote: [] as number[][],
    abbreviation: [] as number[][],
  };

  if (!configDraft) {
    return {
      pagesAll,
      masterLists,
      pageMappings,
      settings: {
        embedReferences: false,
        tabReferences: false,
        fullScroll: false,
        referencesTabFunctionality: false,
        embedPopupReferences: false,
        allReferencesAlphabetical: false,
        abbreviationSingle: false,
        isReferenceOrder: [],
      },
      issues,
      aliasKeysUsed,
    };
  }

  (Object.keys(MASTER_KEY_ALIASES) as ReferenceKind[]).forEach((kind) => {
    const master = getFirstDefinedArray(configDraft, MASTER_KEY_ALIASES[kind]);
    if (master) {
      masterLists[kind] = normalizeTextArray(master.value);
      if (master.key !== MASTER_KEY_ALIASES[kind][0]) {
        aliasKeysUsed.push(master.key);
        issues.push(
          issue(
            `alias-master-${kind}`,
            "warn",
            `Legacy ${kind} config key in use`,
            `Found "${master.key}". The fixer will save back the canonical key "${MASTER_KEY_ALIASES[kind][0]}".`,
          ),
        );
      }
    }

    const page = getFirstDefinedArray(configDraft, PAGE_KEY_ALIASES[kind]);
    pageMappings[kind] = normalizeNumericMatrix(page?.value, pagesAll.length);
    if (page && page.key !== PAGE_KEY_ALIASES[kind][0]) {
      aliasKeysUsed.push(page.key);
      issues.push(
        issue(
          `alias-page-${kind}`,
          "warn",
          `Legacy ${kind} page-mapping key in use`,
          `Found "${page.key}". The fixer will save back the canonical key "${PAGE_KEY_ALIASES[kind][0]}".`,
        ),
      );
    }
  });

  const settings = {
    embedReferences: Boolean(configDraft.embedReferences),
    tabReferences: Boolean(configDraft.tabReferences),
    fullScroll: Boolean(configDraft.fullScroll),
    referencesTabFunctionality: Boolean(configDraft.referencesTabFunctionality),
    embedPopupReferences: Boolean(configDraft.embedPopupReferences),
    allReferencesAlphabetical: Boolean(configDraft.allReferencesAlphabetical),
    abbreviationSingle: Boolean(configDraft.abbreviationSingle),
    isReferenceOrder: Array.isArray(configDraft.isReferenceOrder)
      ? configDraft.isReferenceOrder
          .map((entry: unknown) => String(entry ?? "").trim())
          .filter(Boolean)
      : [],
  };

  if (settings.fullScroll && settings.referencesTabFunctionality) {
    issues.push(
      issue(
        "full-scroll-tabs-conflict",
        "error",
        "Conflicting reference popup settings",
        '"fullScroll" and "referencesTabFunctionality" should not both be enabled under the current Veeva guidelines.',
      ),
    );
  }

  const invalidOrderEntries = settings.isReferenceOrder.filter(
    (entry) => !["references", "footnotes", "abbreviations"].includes(entry),
  );
  if (invalidOrderEntries.length > 0) {
    issues.push(
      issue(
        "invalid-reference-order",
        "warn",
        "Unknown reference order labels",
        `Unsupported values found in "isReferenceOrder": ${invalidOrderEntries.join(", ")}.`,
      ),
    );
  }

  return {
    pagesAll,
    masterLists,
    pageMappings,
    settings,
    issues,
    aliasKeysUsed,
  };
}

export function applyReferenceConfigModelToDraft(
  draft: ConfigLike,
  model: ReferenceConfigModel,
): ConfigLike {
  const next = { ...draft };

  next.referencesAll = [...model.masterLists.reference];
  next.footnotesAll = [...model.masterLists.footnote];
  next.abbreviationsAll = [...model.masterLists.abbreviation];
  next.pageReferencesAll = model.pageMappings.reference.map((row) => [...row]);
  next.pageFootnotesAll = model.pageMappings.footnote.map((row) => [...row]);
  next.pageAbbreviationsAll = model.pageMappings.abbreviation.map((row) => [
    ...row,
  ]);
  next.embedReferences = model.settings.embedReferences;
  next.tabReferences = model.settings.tabReferences;
  next.fullScroll = model.settings.fullScroll;
  next.referencesTabFunctionality = model.settings.referencesTabFunctionality;
  next.embedPopupReferences = model.settings.embedPopupReferences;
  next.allReferencesAlphabetical = model.settings.allReferencesAlphabetical;
  next.abbreviationSingle = model.settings.abbreviationSingle;
  next.isReferenceOrder = [...model.settings.isReferenceOrder];

  delete next.abbreviationAll;
  delete next.pageAbbreviationAll;

  return next;
}

export function cloneReferenceConfigModel(
  model: ReferenceConfigModel,
): ReferenceConfigModel {
  return {
    pagesAll: [...model.pagesAll],
    masterLists: {
      reference: [...model.masterLists.reference],
      footnote: [...model.masterLists.footnote],
      abbreviation: [...model.masterLists.abbreviation],
    },
    pageMappings: {
      reference: model.pageMappings.reference.map((row) => [...row]),
      footnote: model.pageMappings.footnote.map((row) => [...row]),
      abbreviation: model.pageMappings.abbreviation.map((row) => [...row]),
    },
    settings: {
      ...model.settings,
      isReferenceOrder: [...model.settings.isReferenceOrder],
    },
    issues: [...model.issues],
    aliasKeysUsed: [...model.aliasKeysUsed],
  };
}
