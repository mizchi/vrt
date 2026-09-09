/**
 * `check --expect`: the figure against its facts. The two v13 pictures that were green and wrong — a walk that
 * highlighted the wrong edge (gc) and a map that drew the forbidden dependency as a real one and deleted a true
 * one to make the layout happy (fe) — are the cases the check exists for, so they are the first tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";
import { compileScene } from "./compile/index.ts";
import { checkExpectation, EXPECT_FORMAT, formatCompared, parseEdge, validateExpectation, type Expectation } from "./expect.ts";
import { workspaceExpectation, workspaceScene } from "./generators/git.ts";
import { SCENE_FORMAT, type ModulesScene, type Scene } from "./types.ts";
import { formatDiagnostics } from "./validate.ts";

const SCENARIO = resolve(import.meta.dirname!, "../../../fixtures/anim-scenario");
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf-8")) as T;
const attempt = (letter: string): Scene => readJson(resolve(SCENARIO, "attempts", letter, "scene.json"));
const facts = (name: string): Expectation => readJson(resolve(SCENARIO, "briefs/facts", `${name}.expect.json`));

const run = (exp: Expectation, scene: Scene) => checkExpectation(exp, scene, compileScene(scene));
const messages = (exp: Expectation, scene: Scene): string[] => run(exp, scene).diagnostics.map((d) => d.message);

const ports: ModulesScene = {
  format: SCENE_FORMAT,
  kind: "modules",
  modules: ["http", "cli", "app", "domain", "port", "postgres", "memory"],
  deps: [["http", "app"], ["cli", "app"], ["app", "domain"], ["app", "port"], ["port", "domain"], ["postgres", "port"], ["memory", "port"], { from: "domain", to: "postgres", style: "forbidden" }],
  groups: [
    { id: "driving", modules: ["http", "cli"] },
    { id: "core", modules: ["app", "domain", "port"] },
    { id: "adapters", modules: ["postgres", "memory"] },
  ],
};

describe("expect: the v13 pictures that were green and wrong", () => {
  it("gc (haiku, request walk): the two wrong edges lit and the asked one dark are three errors, nothing else", () => {
    const r = run(facts("modules-request-walk"), attempt("gc"));
    const msgs = r.diagnostics.map((d) => d.message);
    assert.equal(msgs.length, 3, formatDiagnostics(r.diagnostics));
    assert.ok(msgs.some((m) => m.includes('"orders->queue" is not highlighted')));
    assert.ok(msgs.some((m) => m.includes('"checkout->orders" is highlighted in the final frame but the facts do not point at it')));
    assert.ok(msgs.some((m) => m.includes('"checkout->payments" is highlighted')));
    assert.equal(formatCompared(r.compared), "8 module(s) · 9 dependencies · 2 highlighted · 3 group(s)");
  });

  it("gb (import cycle): all seventeen imports and the three lit cycle edges match — no error", () => {
    const r = run(facts("depgraph-import-cycle"), attempt("gb"));
    assert.deepEqual(r.diagnostics, [], formatDiagnostics(r.diagnostics));
  });

  it("fe's mistake: the forbidden dependency drawn as a real one is named as such, in the sheet's own words", () => {
    const scene: ModulesScene = { ...ports, deps: ports.deps!.map((d) => ("from" in d ? { from: d.from, to: d.to, style: "line" as const } : d)) };
    const msgs = messages(facts("modules-ports-adapters"), scene);
    assert.ok(msgs.some((m) => m === "domain->postgres is drawn as a real dependency; the facts say it must not exist"), msgs.join("\n"));
  });

  it("fe's repair: deleting the true dependency the layout complained about is a missing dependency", () => {
    const scene: ModulesScene = { ...ports, deps: ports.deps!.filter((d) => !(Array.isArray(d) && d[0] === "port")) };
    const msgs = messages(facts("modules-ports-adapters"), scene);
    assert.deepEqual(msgs, ["dependency port->domain is missing from the picture"]);
  });

  it("a scene that matches its facts has nothing to say", () => {
    assert.deepEqual(run(facts("modules-ports-adapters"), ports).diagnostics, []);
  });
});

describe("expect: what else it reads", () => {
  it("an edge drawn the other way round is one error that says so, not a missing plus an invented", () => {
    const scene: ModulesScene = { ...ports, deps: ports.deps!.map((d) => (Array.isArray(d) && d[0] === "http" ? (["app", "http"] as const) : d)) };
    const msgs = messages(facts("modules-ports-adapters"), scene);
    assert.deepEqual(msgs, ["dependency http->app is drawn the other way round, as app->http"]);
  });

  it("a dependency on no list is invented; a forbidden one missing from the picture is missing", () => {
    const withExtra: ModulesScene = { ...ports, deps: [...ports.deps!, ["cli", "domain"]] };
    assert.deepEqual(messages(facts("modules-ports-adapters"), withExtra), ["dependency cli->domain is drawn but the facts do not have it"]);
    const noForbidden: ModulesScene = { ...ports, deps: ports.deps!.filter((d) => Array.isArray(d)) };
    assert.deepEqual(messages(facts("modules-ports-adapters"), noForbidden), ["the forbidden dependency domain->postgres is not in the picture"]);
  });

  it("ids spelt differently are reported once each, and the dependencies naming them wait in one line", () => {
    const scene: ModulesScene = {
      ...ports,
      modules: ports.modules.map((m) => (m === "app" ? "app-svc" : m)),
      deps: ports.deps!.map((d) => (Array.isArray(d) ? ([d[0] === "app" ? "app-svc" : d[0], d[1] === "app" ? "app-svc" : d[1]] as const) : d)),
      groups: ports.groups!.map((g) => ({ ...g, modules: g.modules.map((m) => (m === "app" ? "app-svc" : m)) })),
    };
    const msgs = messages(facts("modules-ports-adapters"), scene);
    assert.ok(msgs.includes('module "app" is not drawn'));
    assert.ok(msgs.includes('module "app-svc" is drawn but the facts do not have it'));
    // Four facts name "app" and four drawn edges name "app-svc": one line for the eight, not eight lines.
    assert.ok(msgs.some((m) => /^8 dependencies name a module id the picture and the facts spell differently/.test(m)), msgs.join("\n"));
    assert.ok(!msgs.some((m) => m.includes("http->app is missing")), "the dependency on the misspelt id is not also reported as missing");
    // The group holding the misspelt id is still compared: it is one line and it names the fix.
    assert.ok(msgs.some((m) => m.startsWith('group "core" holds')));
  });

  it("groups: a container with the wrong members, a missing one, and one the facts do not know", () => {
    const scene: ModulesScene = { ...ports, groups: [{ id: "driving", modules: ["http"] }, { id: "core", modules: ["app", "domain", "port", "cli"] }, { id: "infra", modules: ["postgres", "memory"] }] };
    const msgs = messages(facts("modules-ports-adapters"), scene);
    assert.ok(msgs.includes('group "driving" holds "http"; the facts say "http", "cli"'));
    assert.ok(msgs.includes('group "adapters" is not drawn'));
    assert.ok(msgs.includes('group "infra" is drawn but the facts do not have it'));
    assert.equal(msgs.length, 4, msgs.join("\n"));
  });

  it("highlighted is read from the final frame: a flow leaves nothing lit, a highlight then unhighlight leaves nothing lit", () => {
    const exp: Expectation = { format: EXPECT_FORMAT, highlighted: ["app->domain"] };
    const flowOnly: ModulesScene = { ...ports, sequence: [{ flow: "app->domain" }] };
    assert.deepEqual(messages(exp, flowOnly), ['dependency "app->domain" is not highlighted in the final frame']);
    const toggled: ModulesScene = { ...ports, sequence: [{ highlight: "app->domain" }, { unhighlight: "app->domain" }] };
    assert.deepEqual(messages(exp, toggled), ['dependency "app->domain" is not highlighted in the final frame']);
    const lit: ModulesScene = { ...ports, sequence: [{ highlight: ["app->domain", "core"] }] };
    assert.deepEqual(messages(exp, lit), ['"core" is highlighted in the final frame but the facts do not point at it']);
    assert.deepEqual(messages({ ...exp, highlighted: ["app->domain", "core"] }, lit), []);
  });

  it("a hidden module no step shows is not drawn for the reader, and a fact that names nothing drawn says so", () => {
    const hidden: ModulesScene = { ...ports, modules: ports.modules.map((m) => (m === "memory" ? { id: "memory", hidden: true } : m)) };
    const msgs = messages(facts("modules-ports-adapters"), hidden);
    assert.ok(msgs.includes('module "memory" is hidden at the end: the reader never sees it'));
    assert.deepEqual(messages({ format: EXPECT_FORMAT, highlighted: ["nowhere->here"] }, ports), ['"nowhere->here" is not in the picture, so it cannot be highlighted']);
  });

  it("a diagram scene is compared the same way, with its own field names", () => {
    const scene: Scene = { format: SCENE_FORMAT, kind: "diagram", nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "b", to: "a" }], sequence: [{ highlight: "a" }] };
    const r = run({ format: EXPECT_FORMAT, deps: ["a->b"], highlighted: ["a"] }, scene);
    assert.deepEqual(r.diagnostics.map((d) => [d.path, d.message]), [["edges(b->a)", "edge a->b is drawn the other way round, as b->a"]]);
  });

  it("any other kind is one error: the facts have nothing to compare with", () => {
    const sort: Scene = { format: SCENE_FORMAT, kind: "sort", values: [3, 1, 2], algorithm: "bubble" };
    const msgs = messages({ format: EXPECT_FORMAT, deps: ["a->b"] }, sort);
    assert.deepEqual(msgs, ['--expect reads a "modules", "diagram", "graph", "flowchart", "state-machine", "distributed", "sequence" scene; this scene is a "sort"']);
  });

  it("an absent field is not checked: an empty sheet passes anything and says so", () => {
    const r = run({ format: EXPECT_FORMAT }, ports);
    assert.deepEqual(r.diagnostics, []);
    assert.equal(formatCompared(r.compared), "an empty fact sheet (nothing to compare)");
  });
});

describe("expect: the file itself", () => {
  it("validates shape: format, known fields, arrays of strings, edges written a->b, groups as an object", () => {
    assert.deepEqual(validateExpectation({ format: EXPECT_FORMAT, deps: ["a->b"], groups: { g: ["a"] } }), []);
    const bad = validateExpectation({ format: "nope", deps: ["a-b", 3], highlighted: "a", groups: ["a"], extra: 1 });
    const paths = bad.map((d) => d.path).sort();
    assert.deepEqual(paths, ["deps", "extra", "format", "groups", "highlighted"]);
    assert.deepEqual(validateExpectation({ format: EXPECT_FORMAT, forbidden: ["a->"] }).map((d) => d.message), ['"a->" is not an edge']);
    assert.equal(validateExpectation([]).length, 1);
  });

  it("parseEdge keeps ids with hyphens and spaces whole", () => {
    assert.deepEqual(parseEdge("repo-port->domain"), ["repo-port", "domain"]);
    assert.deepEqual(parseEdge("vlmkit (cli) -> animation-eval"), ["vlmkit (cli)", "animation-eval"]);
    assert.equal(parseEdge("a->b->c"), undefined);
    assert.equal(parseEdge("ab"), undefined);
  });

  it("the workspace's own facts come from its package.json files and its own map passes them", () => {
    const root = resolve(import.meta.dirname!, "../../..");
    const exp = workspaceExpectation(root);
    assert.deepEqual(validateExpectation(exp), []);
    assert.ok(exp.modules!.includes("core") && exp.modules!.includes("vlmkit (cli)"));
    assert.ok(exp.deps!.includes("anim->animation-eval"));
    // The generator's own scene walks the layers, so every module and edge is shown by the end.
    const r = run(exp, workspaceScene(root));
    assert.deepEqual(r.diagnostics, [], formatDiagnostics(r.diagnostics));
  });
});
