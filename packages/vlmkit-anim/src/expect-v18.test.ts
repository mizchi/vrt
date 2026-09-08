/**
 * v18 — `check --expect` for the walked kinds. A graph sheet reads nodes, edges, the order of visits, the path
 * lit at the end and the labels; a state-machine sheet reads states, transitions with events, initial, final,
 * the walked states and the end state; a distributed sheet reads lanes, the messages in order, which are lost
 * and each node's final status. Each fixture is checked against a true sheet (nothing to say) and against one
 * wrong line at a time (one error, naming it).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { compileScene } from "./compile/index.ts";
import { checkExpectation, EXPECT_FORMAT, formatCompared, parseLink, validateExpectation, type Expectation } from "./expect.ts";
import type { Scene } from "./types.ts";
import { formatDiagnostics } from "./validate.ts";

const fixture = (name: string): Scene => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")) as Scene;
const run = (exp: Expectation, scene: Scene) => checkExpectation(exp, scene, compileScene(scene));
const messages = (exp: Expectation, scene: Scene): string[] => run(exp, scene).diagnostics.map((d) => d.message);

describe("parseLink", () => {
  it("reads the pair, the direction and the tag", () => {
    assert.deepEqual(parseLink("a->b"), { from: "a", to: "b", undirected: false });
    assert.deepEqual(parseLink("a<->b"), { from: "a", to: "b", undirected: true });
    assert.deepEqual(parseLink("a->b:write x=1"), { from: "a", to: "b", undirected: false, tag: "write x=1" });
    assert.deepEqual(parseLink("SYN_SENT->CLOSED:timeout"), { from: "SYN_SENT", to: "CLOSED", undirected: false, tag: "timeout" });
    assert.deepEqual(parseLink("a->b:c:d"), { from: "a", to: "b", undirected: false, tag: "c:d" });
    assert.equal(parseLink("a"), undefined);
  });

  it("the validator accepts the new fields and names a bad edge", () => {
    assert.deepEqual(validateExpectation({ format: EXPECT_FORMAT, nodes: ["a"], edges: ["a<->b"], transitions: ["a->b:go"], messages: ["a->b:hi"], status: { a: "down" }, initial: "a", end: "b" }), []);
    const bad = validateExpectation({ format: EXPECT_FORMAT, edges: ["a b"], status: { a: 1 }, initial: 3 });
    assert.deepEqual(bad.map((d) => d.path), ["edges[0]", "initial", "status"]);
  });
});

describe("expect: graph", () => {
  const dijkstra = fixture("graph-dijkstra");
  const truth: Expectation = {
    format: EXPECT_FORMAT,
    nodes: ["A", "B", "C", "D", "E"],
    edges: ["A->B", "A->C", "C->B", "B->D", "C->D", "D->E"],
    visited: ["A", "C", "B", "D", "E"],
    path: ["A", "C", "B", "D", "E"],
    labels: { E: "7", A: "0" },
    highlighted: [],
  };

  it("the fixture matches its facts, and the line says what was compared", () => {
    const r = run(truth, dijkstra);
    assert.deepEqual(r.diagnostics, [], formatDiagnostics(r.diagnostics));
    assert.equal(formatCompared(r.compared), "5 nodes · 6 edges · 5 visits · 5 path nodes · 2 labels");
  });

  it("an undirected graph matches either direction, and `a<->b` reads the same", () => {
    const r = run({ format: EXPECT_FORMAT, edges: ["B->A", "C<->A", "B->C", "D->B", "D->C", "E->D"] }, dijkstra);
    assert.deepEqual(r.diagnostics, [], formatDiagnostics(r.diagnostics));
  });

  it("a wrong visit order, a wrong path, a wrong label and an invented edge are each one line", () => {
    assert.deepEqual(messages({ format: EXPECT_FORMAT, visited: ["A", "B", "C", "D", "E"] }, dijkstra), ["the order of visits differs at position 2: the facts say A → B → C → D → E, the scene does A → C → B → D → E"]);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, path: ["A", "C", "D", "E"] }, dijkstra), ["the path shown at the end differs at position 3: the facts say A → C → D → E, the scene does A → C → B → D → E"]);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, labels: { E: "8" } }, dijkstra), ['node "E" ends labelled "7"; the facts say "8"']);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, edges: ["A->B", "A->C", "C->B", "B->D", "C->D"] }, dijkstra), ["edge D->E is drawn but the facts do not have it"]);
  });

  it("no path shown when the facts expect one; a directed edge the other way round", () => {
    const bfs: Scene = { ...(dijkstra as Extract<Scene, { kind: "graph" }>), algorithm: "bfs", goal: undefined, directed: true };
    assert.deepEqual(messages({ format: EXPECT_FORMAT, path: ["A", "C", "B"] }, bfs), ["no path is shown at the end; the facts expect A → C → B"]);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, edges: ["B->A", "A->C", "C->B", "B->D", "C->D", "D->E"] }, bfs), ["edge B->A is drawn the other way round, as A->B"]);
  });

  it("highlighted reads the final frame: a visited node is green, not lit", () => {
    const g: Scene = { ...(dijkstra as Extract<Scene, { kind: "graph" }>), algorithm: undefined, ops: [{ visit: "A" }, { highlight: "C" }] };
    assert.deepEqual(messages({ format: EXPECT_FORMAT, highlighted: ["C"] }, g), []);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, highlighted: ["A"] }, g), ['node "A" is not highlighted in the final frame', 'node "C" is highlighted in the final frame but the facts do not point at it']);
  });

  it("a field the kind does not have is said once and not compared", () => {
    assert.deepEqual(messages({ format: EXPECT_FORMAT, deps: ["A->B"] }, dijkstra), ['"deps" is not a fact a "graph" scene has; it is not compared']);
  });
});

describe("expect: state-machine", () => {
  const tcp = fixture("state-tcp");
  const truth: Expectation = {
    format: EXPECT_FORMAT,
    states: ["CLOSED", "SYN_SENT", "ESTABLISHED", "FIN_WAIT"],
    transitions: ["CLOSED->SYN_SENT:connect", "SYN_SENT->ESTABLISHED:SYN+ACK", "SYN_SENT->CLOSED:timeout", "ESTABLISHED->FIN_WAIT:close"],
    initial: "CLOSED",
    final: ["FIN_WAIT"],
    visited: ["CLOSED", "SYN_SENT", "CLOSED", "SYN_SENT", "ESTABLISHED", "FIN_WAIT"],
    end: "FIN_WAIT",
  };

  it("the fixture matches its facts", () => {
    const r = run(truth, tcp);
    assert.deepEqual(r.diagnostics, [], formatDiagnostics(r.diagnostics));
    assert.equal(formatCompared(r.compared), "4 states · 4 transitions · 1 initial state · 1 final state · 6 visits · 1 end state");
  });

  it("transitions without an event match any event; with one, it must agree", () => {
    assert.deepEqual(messages({ format: EXPECT_FORMAT, transitions: ["CLOSED->SYN_SENT", "SYN_SENT->ESTABLISHED", "SYN_SENT->CLOSED", "ESTABLISHED->FIN_WAIT"] }, tcp), []);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, transitions: ["CLOSED->SYN_SENT:open", "SYN_SENT->ESTABLISHED", "SYN_SENT->CLOSED", "ESTABLISHED->FIN_WAIT"] }, tcp), ['transition CLOSED->SYN_SENT fires on "connect"; the facts say "open"']);
  });

  it("a missing transition, an invented one, the wrong initial, a state not drawn final, the wrong end", () => {
    assert.deepEqual(messages({ format: EXPECT_FORMAT, transitions: ["CLOSED->SYN_SENT", "SYN_SENT->ESTABLISHED", "SYN_SENT->CLOSED", "ESTABLISHED->FIN_WAIT", "FIN_WAIT->CLOSED:timeout"] }, tcp), ["transition FIN_WAIT->CLOSED:timeout is missing from the picture"]);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, transitions: ["CLOSED->SYN_SENT", "SYN_SENT->ESTABLISHED", "ESTABLISHED->FIN_WAIT"] }, tcp), ["transition SYN_SENT->CLOSED:timeout is drawn but the facts do not have it"]);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, initial: "SYN_SENT" }, tcp), ['the machine starts in "CLOSED"; the facts say "SYN_SENT"']);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, final: ["FIN_WAIT", "CLOSED"] }, tcp), ['state "CLOSED" is not drawn as final (double ring)']);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, end: "ESTABLISHED" }, tcp), ['the token ends in "FIN_WAIT"; the facts say "ESTABLISHED"']);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, visited: ["CLOSED", "SYN_SENT", "ESTABLISHED", "FIN_WAIT"] }, tcp), ["the states the token walked differs at position 3: the facts say CLOSED → SYN_SENT → ESTABLISHED → FIN_WAIT, the scene does CLOSED → SYN_SENT → CLOSED → SYN_SENT → ESTABLISHED → FIN_WAIT"]);
  });
});

describe("expect: distributed", () => {
  const repl = fixture("distributed-replication");
  const truth: Expectation = {
    format: EXPECT_FORMAT,
    nodes: ["client", "primary", "replica"],
    messages: ["client->primary:write x=1", "primary->replica:replicate x=1", "replica->primary:ack", "primary->client:ok", "client->primary:write x=2", "client->replica:retry x=2"],
    lost: ["client->primary:write x=2"],
    status: { primary: "down", replica: "leader", client: "up" },
  };

  it("the fixture matches its facts", () => {
    const r = run(truth, repl);
    assert.deepEqual(r.diagnostics, [], formatDiagnostics(r.diagnostics));
    assert.equal(formatCompared(r.compared), "3 nodes · 6 messages · 1 lost · 3 statuses");
  });

  it("messages without labels match by ends; a wrong order is one line at the first difference; a count mismatch names the rest", () => {
    assert.deepEqual(messages({ format: EXPECT_FORMAT, messages: ["client->primary", "primary->replica", "replica->primary", "primary->client", "client->primary", "client->replica"] }, repl), []);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, messages: ["client->primary", "replica->primary", "primary->replica", "primary->client", "client->primary", "client->replica"] }, repl), ["message 2 is primary->replica:replicate x=1; the facts say replica->primary"]);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, messages: ["client->primary", "primary->replica", "replica->primary", "primary->client"] }, repl), ["the scene sends 6 message(s); the facts list 4"]);
  });

  it("lost is exact both ways, and status is read from the final frame", () => {
    assert.deepEqual(messages({ format: EXPECT_FORMAT, lost: ["client->replica:retry x=2"] }, repl), ["message client->replica:retry x=2 is delivered; the facts say it is lost", "message client->primary:write x=2 is lost but the facts do not have it lost"]);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, status: { primary: "leader" } }, repl), ['node "primary" ends down; the facts say leader']);
    assert.deepEqual(messages({ format: EXPECT_FORMAT, status: { nobody: "up" } }, repl), ['"nobody" is not a node, so it has no status']);
  });
});
