import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAnnotationWithMl,
  computeMetrics,
} from "../utils/ai/AnnotationMLPipeline.ts";
import { domAnalyzer } from "../utils/ai/DomAnalyzer.ts";
import { AIPipeline } from "../utils/ai/AIPipeline.ts";
import { auditPopupDomQueries } from "../utils/ai/PopupWorkflowGuard.ts";
import { VirtualElement } from "../types.ts";

const fixtureRoot: VirtualElement = {
  id: "root",
  type: "div",
  name: "Root",
  styles: { width: "1024px", height: "768px", left: "0px", top: "0px" },
  attributes: { role: "region" },
  children: [
    {
      id: "slideTitle",
      type: "h1",
      name: "Heading",
      content: "Argentina",
      styles: { left: "40px", top: "20px", width: "480px", zIndex: "10" },
      attributes: { role: "heading", onClick: "noop" },
      children: [],
    },
    {
      id: "popupHost",
      type: "div",
      name: "PopupHost",
      content: "",
      styles: { left: "50px", top: "150px", width: "520px", height: "300px", zIndex: "20" },
      attributes: { className: "popup annotation", "data-popup-id": "dialog1" },
      children: [],
    },
  ],
};

const fixtureHtml = {
  slide:
    '<div class="canvas"><button class="annotation" data-id="a1">Update text</button><div class="popup" data-popup-id="dialog1"><p>Reference popup</p></div></div>',
  shared:
    '<section class="popup"><div class="annotation" data-popup-id="ref-1">Prescribing information reference list</div></section>',
};

test("ML pipeline classifies subtype, intent, and popup ownership with confidence scores", () => {
  const result = classifyAnnotationWithMl({
    subtype: "Popup",
    text: "Open reference popup and review PI text",
    threadText: ["Open reference popup", "Review PI"],
    foundSelector: ".annotation",
    mappedFilePath: "shared/media/content/references.html",
    locationType: "Reference",
    matchMethod: "Shared text match",
  });
  assert.equal(result.annotationType.label, "Popup");
  assert.ok(result.annotationType.confidence > 0.6);
  assert.equal(result.popupOwnership.label, "shared-popup");
  assert.ok(result.annotationIntent.confidence > 0.2);
  const mediaIntent = classifyAnnotationWithMl({
    subtype: "Text",
    text: "replace logo in hero area",
    threadText: ["replace logo"],
    foundSelector: "img.hero-logo",
    mappedFilePath: "slide1/index.html",
    locationType: "Slide",
    matchMethod: "dHash direct",
    targetTagName: "img",
  });
  assert.equal(mediaIntent.annotationIntent.label, "textInImage");
  const textIntent = classifyAnnotationWithMl({
    subtype: "Text",
    text: "replace title text to Argentina",
    threadText: ["replace title text"],
    foundSelector: "h1.title",
    mappedFilePath: "slide1/index.html",
    locationType: "Slide",
    matchMethod: "dHash direct",
    targetTagName: "h1",
  });
  assert.equal(textIntent.annotationIntent.label, "textualChange");
});

test("Popup workflow audit logs target selectors and blocks popup-opening DOM actions", () => {
  const reports = [
    auditPopupDomQueries(fixtureHtml.slide, "slide-canvas"),
    auditPopupDomQueries(fixtureHtml.shared, "shared-popup"),
  ];
  for (const report of reports) {
    const selectors = report.queries.map((entry) => entry.selector);
    assert.ok(selectors.includes(".popup"));
    assert.ok(selectors.includes(".annotation"));
    assert.ok(selectors.includes("[data-popup-id]"));
    assert.equal(report.actionAttempts.length, 0);
    assert.equal(report.assertionPassed, true);
  }
});

test("Classifier metrics on the entire fixture dataset produce precision recall and F1", () => {
  const fixture = [
    { truth: "Text", pred: "Text" },
    { truth: "Popup", pred: "Popup" },
    { truth: "Highlight", pred: "Highlight" },
    { truth: "FreeText", pred: "FreeText" },
    { truth: "Circle", pred: "Circle" },
    { truth: "Line", pred: "Line" },
  ];
  const metrics = computeMetrics(
    fixture.map((entry) => entry.truth),
    fixture.map((entry) => entry.pred),
  );
  assert.equal(metrics.micro.precision, 1);
  assert.equal(metrics.micro.recall, 1);
  assert.equal(metrics.micro.f1, 1);
});

test("DOM intelligence layer indexes, reasons, analyzes, generates commands, and executes in sandbox", () => {
  const index = domAnalyzer.analyze(fixtureRoot);
  const target = index.find((entry) => entry.id === "slideTitle");
  assert.ok(target);
  assert.ok(target?.xpath.includes("h1"));
  const graph = domAnalyzer.queryGraph(index, "slideTitle");
  assert.equal(graph.parent?.id, "root");
  assert.equal(graph.children.length, 0);
  const actionable = domAnalyzer.extractActionableAttributes(index, "slideTitle");
  assert.ok(actionable);
  assert.ok((actionable?.eventListeners.length || 0) > 0);
  const commands = domAnalyzer.generateCommands(actionable!, { allowClick: false });
  const execution = domAnalyzer.executeInSandbox(fixtureRoot, commands);
  assert.equal(execution.validationPassed, true);
  assert.ok(execution.mutations.length >= 2);
});

test("Popup workflow does not request popup opening by default in AI pipeline", () => {
  const pipeline = new AIPipeline();
  const response = pipeline.process("open dialog1 popup", fixtureRoot, {} as any);
  assert.notEqual(response.actionRequired, "OPEN_POPUP");
});
