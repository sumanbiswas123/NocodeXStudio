export type ReferenceKind = "reference" | "footnote" | "abbreviation";

export type ReferenceEntryStatus = "active" | "orphaned";

export type ReferenceScopeType =
  | "slide"
  | "localPopup"
  | "sharedPopup"
  | "superscript";

export type ReferenceOperationType =
  | "removeLocal"
  | "removeGlobal"
  | "replace"
  | "add"
  | "moveScope"
  | "reorder"
  | "keepMasterEntry";

export type ReferenceSeverity = "info" | "warn" | "error";

export type ReferenceConfidence = "high" | "medium" | "low";

export interface ReferenceAuditIssue {
  id: string;
  severity: ReferenceSeverity;
  source: "config" | "html" | "annotation" | "workflow";
  title: string;
  detail: string;
  filePath?: string | null;
  selector?: string | null;
  slideId?: string | null;
  candidateId?: string;
}

export interface ReferenceEntry {
  stableId: string;
  kind: ReferenceKind;
  masterIndex: number;
  text: string;
  status: ReferenceEntryStatus;
}

export interface ReferenceTargetRef {
  stableId: string;
  kind: ReferenceKind;
  token: string;
  masterIndex: number;
  localOrder: number;
  rawToken: string;
}

export interface ReferenceUsageNode {
  nodeId: string;
  scopeType: ReferenceScopeType;
  containerScope: "slide" | "localPopup" | "sharedPopup";
  slideId: string | null;
  filePath: string;
  popupId: string | null;
  selector: string | null;
  selectorText: string;
  rawText: string;
  rawDataRefTarget: string;
  targetRefs: ReferenceTargetRef[];
}

export interface ReferenceSettingsSnapshot {
  embedReferences: boolean;
  tabReferences: boolean;
  fullScroll: boolean;
  referencesTabFunctionality: boolean;
  embedPopupReferences: boolean;
  allReferencesAlphabetical: boolean;
  abbreviationSingle: boolean;
  isReferenceOrder: string[];
}

export interface ReferenceConfigModel {
  pagesAll: string[];
  masterLists: Record<ReferenceKind, string[]>;
  pageMappings: Record<ReferenceKind, number[][]>;
  settings: ReferenceSettingsSnapshot;
  issues: ReferenceAuditIssue[];
  aliasKeysUsed: string[];
}

export interface ReferenceRegistry {
  entries: ReferenceEntry[];
  byStableId: Record<string, ReferenceEntry>;
  byKind: Record<ReferenceKind, ReferenceEntry[]>;
  byKindAndIndex: Record<ReferenceKind, Record<number, ReferenceEntry>>;
}

export interface SuperscriptRenderResult {
  tokens: string[];
  dataRefTarget: string;
  visibleText: string;
  issues: ReferenceAuditIssue[];
}

export interface HtmlPatchSuggestion {
  id: string;
  filePath: string;
  selector: string | null;
  scopeLabel: string;
  oldDataRefTarget: string;
  newDataRefTarget: string;
  oldVisibleText: string;
  newVisibleText: string;
  notes: string[];
}

export interface ReferenceImpactReport {
  scopeLabel: string;
  isGlobal: boolean;
  affectedSlides: string[];
  affectedFiles: string[];
  affectedNodeIds: string[];
  usageCountBefore: number;
  usageCountAfter: number;
  affectsSharedPopup: boolean;
}

export interface ReferenceOperationScope {
  scopeMode: "page" | "popup" | "superscript" | "global";
  slideId?: string | null;
  filePath?: string | null;
  popupId?: string | null;
  nodeId?: string | null;
}

export interface ReferenceOperation {
  type: ReferenceOperationType;
  kind: ReferenceKind;
  stableId?: string;
  scope?: ReferenceOperationScope;
  replacementText?: string;
  newText?: string;
  targetNodeId?: string | null;
}

export interface ConfigPatchPreview {
  key: string;
  before: string;
  after: string;
}

export interface ReferencePatchPlan {
  id: string;
  title: string;
  summary: string;
  confidence: ReferenceConfidence;
  operation: ReferenceOperation;
  configPatchPreview: ConfigPatchPreview[];
  htmlSuggestions: HtmlPatchSuggestion[];
  impact: ReferenceImpactReport;
  issues: ReferenceAuditIssue[];
  nextModel: ReferenceConfigModel;
}

export interface ReferenceResolutionOption {
  id: string;
  label: string;
  description: string;
  plan: ReferencePatchPlan | null;
  recommended: boolean;
}

export interface ReferenceChangeCandidate {
  id: string;
  annotationId: string;
  title: string;
  summary: string;
  confidence: ReferenceConfidence;
  matchedNodeIds: string[];
  matchedStableIds: string[];
  issues: ReferenceAuditIssue[];
  resolutionOptions: ReferenceResolutionOption[];
}

export interface ReferenceWorkspace {
  model: ReferenceConfigModel;
  registry: ReferenceRegistry;
  usageNodes: ReferenceUsageNode[];
  issues: ReferenceAuditIssue[];
}
