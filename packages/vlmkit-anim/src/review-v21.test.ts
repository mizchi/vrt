/**
 * v21: a still figure read back. `sceneFacts` says what the figure claims; a reader's `Reading` is
 * scored against it name by name — labels resolve to ids, a reversed arrow and a misplaced module are
 * their own findings, and a name that is nothing drawn is reported, not silently dropped.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { compileScene } from "./compile/index.ts";
import { checkExpectation, sceneFacts } from "./expect.ts";
import { formatReading, parseReading, scoreReading, stillBrief, type Reading } from "./review.ts";
import type { ModulesScene, Scene } from "./types.ts";

const fixture = <T extends Scene>(name: string): T => JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", `${name}.json`), "utf8")) as T;

describe("sceneFacts: what a module map claims", () => {
  const s = fixture<ModulesScene>("modules-nested");
  const tl = compileScene(s);
  const facts = sceneFacts(s, tl)!;

  it("modules, deps, own group members, nesting and labels — and the sheet it writes passes check --expect", () => {
    assert.deepEqual(facts.modules, ["web", "mobile", "gateway", "orders", "billing", "domain", "postgres", "events"]);
    assert.equal(facts.deps!.length, 10);
    assert.ok(facts.deps!.includes("orders->domain"));
    assert.deepEqual(facts.groups!.backend, ["gateway"], "own members, not descendants");
    assert.deepEqual(facts.parents, { services: "backend", core: "backend" });
    assert.equal(facts.labels.gateway, "API gateway");
    assert.equal(facts.labels.infra, "infrastructure");
    assert.deepEqual(facts.highlighted, []);
    const { labels: _l, parents: _p, ...sheet } = facts;
    assert.deepEqual(checkExpectation(sheet, s, tl).diagnostics, []);
  });

  it("is undefined for a kind that is not a figure", () => {
    const sort = fixture<Scene>("sort-bubble");
    assert.equal(sceneFacts(sort, compileScene(sort)), undefined);
  });
});

describe("a reading, parsed and scored", () => {
  const s = fixture<ModulesScene>("modules-nested");
  const tl = compileScene(s);
  const facts = sceneFacts(s, tl)!;
  const perfect: Reading = {
    modules: ["web app", "mobile app", "API gateway", "orders", "billing", "domain model", "Postgres", "event bus"],
    deps: ["web app->API gateway", "mobile app -> API gateway", "API gateway → orders", "API gateway->billing", "orders->domain model", "billing->domain model", "orders->Postgres", "billing->Postgres", "orders->event bus", "billing->event bus"],
    forbidden: [],
    groups: { clients: ["web app", "mobile app"], backend: ["API gateway"], services: ["orders", "billing"], core: ["domain model"], infrastructure: ["Postgres", "event bus"] },
    nesting: { services: "backend", core: "backend" },
    highlighted: [],
    issues: [],
  };

  it("labels resolve to ids, arrows in three spellings, and a perfect reading scores fidelity 1", () => {
    const score = scoreReading(facts, perfect);
    assert.deepEqual(score.unknown, []);
    assert.equal(score.totals.fidelity, 1, JSON.stringify(score.totals));
    assert.equal(score.totals.facts, 8 + 10 + 8 + 2);
    assert.deepEqual(score.deps.reversed, []);
    assert.deepEqual(score.groups.misplaced, []);
  });

  it("a reversed arrow, a misplaced module, a missed group and a name that is nothing drawn are each named", () => {
    const r: Reading = {
      ...perfect,
      deps: [...perfect.deps.filter((d) => d !== "orders->Postgres"), "Postgres->orders", "billing->ledger"],
      groups: { clients: ["web app", "mobile app"], backend: ["API gateway", "orders"], services: ["billing"], core: ["domain model"] },
      nesting: { services: "backend" },
    };
    const score = scoreReading(facts, r);
    assert.deepEqual(score.deps.reversed, ["orders->postgres"]);
    assert.deepEqual(score.deps.missed, ["orders->postgres"]);
    assert.deepEqual(score.unknown, ["ledger"]);
    assert.deepEqual(score.groups.misplaced, ["orders read in backend, drawn in services"]);
    assert.deepEqual(score.groups.groupsMissed, ["infra"]);
    assert.deepEqual(score.nesting.missed, ["core in backend"]);
    assert.ok(score.totals.fidelity < 1);
    const text = formatReading(score, facts, r, []);
    assert.match(text, /reversed: orders->postgres/);
    assert.match(text, /misplaced: orders read in backend, drawn in services/);
    assert.match(text, /groups not read: infra/);
    assert.match(text, /names that resolve to nothing drawn: "ledger"/);
  });

  it("a short name that is one label's whole word resolves; an ambiguous one does not", () => {
    const score = scoreReading(facts, { ...perfect, modules: [...perfect.modules.filter((m) => m !== "API gateway" && m !== "web app"), "gateway", "app"] });
    assert.ok(score.modules.read.includes("gateway"), "gateway is one label's word");
    assert.ok(score.modules.missed.includes("web"), "'app' is in two labels: not resolved");
    assert.deepEqual(score.unknown, ["app"]);
  });

  it("the brief asks for every field by the kind's words; a fenced reading parses and missing fields are empty", () => {
    const brief = stillBrief("A shop", {});
    assert.match(brief, /\*\*groups\*\*: for every container/);
    assert.match(brief, /"nesting": \{ "services": "backend" \}/);
    const diagram = stillBrief("Flow", { nodeWord: "node", groupWord: "group", depWord: "edge" });
    assert.match(diagram, /each a node/);
    const r = parseReading('Here:\n```json\n{"modules": ["a"], "deps": ["a->b"], "issues": [{"kind": "smudge", "what": "x"}]}\n```');
    assert.deepEqual(r.groups, {});
    assert.deepEqual(r.nesting, {});
    assert.equal(r.issues[0].kind, "other");
    assert.throws(() => parseReading('{"modules": "a"}'), /"modules" must be an array/);
    assert.throws(() => parseReading('{"nesting": {"a": 1}}'), /nesting.a/);
  });
});
