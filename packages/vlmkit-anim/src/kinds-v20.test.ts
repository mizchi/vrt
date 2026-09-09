/**
 * v20 — `sequence` (participants, ordered messages, activations, loop / alt frames) and nested groups on
 * `modules` / `diagram` (a `parent` on a group). The fixtures compile clean; activations follow calls and returns
 * and start over per alt branch; a parent's container wraps its children's; the validator names a cycle.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { checkAnimation } from "./check.ts";
import { compileScene } from "./compile/index.ts";
import { flattenSequence } from "./compile/sequence.ts";
import { checkExpectation, EXPECT_FORMAT } from "./expect.ts";
import { layoutReport } from "./layout.ts";
import { sampleFrame, timelineDuration } from "./timeline.ts";
import { SCENE_FORMAT, type ModulesScene, type SequenceScene, type Timeline } from "./types.ts";
import { formatDiagnostics, validateScene } from "./validate.ts";

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")) as T;
const issues = (tl: Timeline) => {
  const r = layoutReport(tl);
  return r.frames.flatMap((f) => f.issues.map((i) => `frame ${f.index}: ${i.kind} ${i.texts.join(" / ")}`)).join("\n") || "clean";
};
const box = (tl: Timeline, id: string, t: number) => {
  const st = sampleFrame(tl, t).get(id)!;
  const n = tl.nodes.find((x) => x.id === id)!;
  const [w, h] = (st.size as [number, number] | undefined) ?? n.size!;
  const [x, y] = st.pos as [number, number];
  return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
};

describe("sequence", () => {
  const login = () => fixture<SequenceScene>("sequence-login");

  it("compiles clean, one beat per message, returns read backwards, frames flatten in order", () => {
    const s = login();
    const tl = compileScene(s);
    assert.equal(issues(tl), "clean");
    const diags = checkAnimation(tl, s);
    assert.deepEqual(diags, [], formatDiagnostics(diags));
    const captions = (tl.steps ?? []).map((st) => st.caption);
    assert.ok(captions.includes("web → auth: verify(token)"), captions.join(" | "));
    assert.ok(captions.includes("web ← auth: ok (cached)"));
    assert.ok(captions.includes("web → auth: audit(login) (async)"));
    assert.deepEqual(tl.meta?.messages, ["user->web:POST /login", "web->auth:verify(token)", "auth->web:ok (cached)", "auth->db:SELECT user", "db->auth:row", "auth->web:ok", "web->user:200 + cookie", "web->auth:audit(login)"]);
    const rows = flattenSequence(s.messages).map((r) => r.type);
    assert.deepEqual(rows, ["msg", "msg", "open", "msg", "else", "msg", "msg", "msg", "close", "msg", "msg"]);
  });

  it("a call activates its receiver until it returns; an alt's branches each start from the activations at the frame", () => {
    const s = login();
    const tl = compileScene(s);
    const end = timelineDuration(tl);
    const frame = sampleFrame(tl, end);
    // web is activated by POST /login and returns at "200 + cookie"; auth by verify(token), returned in both branches
    // — one bar, spanning to the last branch's return; db by SELECT user, returned by "row".
    const bars = tl.nodes.filter((n) => n.id.startsWith("act-"));
    assert.equal(bars.length, 3, bars.map((b) => b.id).join(", "));
    for (const b of bars) assert.ok((frame.get(b.id)!.size as number[])[1] > 20, `${b.id} has height at the end`);
    const auth = bars.find((b) => Math.abs(b.pos![0] - tl.nodes.find((n) => n.id === "part-auth")!.pos![0]) < 1)!;
    const okRow = tl.nodes.find((n) => n.id === "msg-5")!; // auth -> web: ok (the miss branch's return)
    const authBox = box(tl, auth.id, end);
    assert.ok(Math.abs(authBox.y1 - (okRow.points?.[0]?.[1] ?? 0)) < 2, `auth's bar ends at the last return (${authBox.y1} vs ${okRow.points?.[0]?.[1]})`);
    // The alt frame and its dashed separator exist and are visible at the end.
    assert.equal(frame.get("frame-0")!.opacity, 1);
    assert.equal(frame.get("frame-0-else-0")!.opacity, 1);
    assert.equal(tl.nodes.find((n) => n.id === "frame-0-label")!.text, "alt [cached]");
  });

  it("the check: a return nothing activated, a participant that is never messaged, one still activated at the end", () => {
    const s: SequenceScene = {
      format: SCENE_FORMAT,
      kind: "sequence",
      participants: ["a", "b", "c"],
      messages: [{ from: "b", to: "a", label: "x", kind: "return" }, { from: "a", to: "b", label: "go" }],
    };
    const diags = checkAnimation(compileScene(s), s);
    assert.ok(diags.some((d) => /"b" returns to "a" but no call activated it/.test(d.message)), formatDiagnostics(diags));
    assert.ok(diags.some((d) => /participant "c" sends and receives nothing/.test(d.message)));
    assert.ok(diags.some((d) => /"b" is still activated at the end/.test(d.message)));
  });

  it("the validator: an unknown participant, a bad kind, an alt with one branch (a warning)", () => {
    const s = login();
    const d = validateScene({ ...s, messages: [{ from: "user", to: "nobody", label: "hi", kind: "shout" as never }, { alt: [{ when: "only", items: [] }] }] });
    assert.ok(d.some((x) => x.path === "messages[0].to"), formatDiagnostics(d));
    assert.ok(d.some((x) => x.path === "messages[0].kind"));
    assert.ok(d.some((x) => x.path === "messages[1].alt" && x.severity === "warn"));
  });

  it("a fact sheet reads the participants and the messages in order", () => {
    const s = login();
    const tl = compileScene(s);
    const ok = checkExpectation({ format: EXPECT_FORMAT, nodes: ["user", "web", "auth", "db"], messages: ["user->web:POST /login", "web->auth", "auth->web", "auth->db:SELECT user", "db->auth", "auth->web:ok", "web->user", "web->auth:audit(login)"] }, s, tl);
    assert.deepEqual(ok.diagnostics, [], formatDiagnostics(ok.diagnostics));
    const bad = checkExpectation({ format: EXPECT_FORMAT, messages: ["user->web", "auth->web"] }, s, tl);
    assert.equal(bad.diagnostics.length, 1);
    assert.match(bad.diagnostics[0].message, /message 2 is web->auth:verify\(token\); the facts say auth->web/);
  });
});

describe("nested groups", () => {
  const shop = () => fixture<ModulesScene>("modules-nested");

  it("a parent's container wraps its children's, with room for their labels, and the picture is clean", () => {
    const s = shop();
    const tl = compileScene(s);
    assert.equal(issues(tl), "clean");
    const end = timelineDuration(tl);
    const backend = box(tl, "backend", end);
    for (const child of ["services", "core"]) {
      const c = box(tl, child, end);
      assert.ok(c.x0 > backend.x0 && c.x1 < backend.x1 && c.y0 > backend.y0 && c.y1 < backend.y1, `${child} sits inside backend`);
    }
    const clients = box(tl, "clients", end);
    assert.ok(clients.y1 <= backend.y0 + 1 || clients.x1 <= backend.x0 || clients.x0 >= backend.x1 || clients.y0 >= backend.y1, "clients does not overlap backend's box beyond a shared edge");
    // The gateway (backend's own module) is inside backend but outside both children.
    const gw = box(tl, "gateway", end);
    assert.ok(gw.x0 > backend.x0 && gw.x1 < backend.x1 && gw.y0 > backend.y0 && gw.y1 < backend.y1);
    const svc = box(tl, "services", end);
    assert.ok(gw.y1 <= svc.y0 || gw.x1 <= svc.x0 || gw.x0 >= svc.x1, "gateway is not inside services");
    assert.deepEqual(checkAnimation(tl, s).filter((d) => d.severity === "error"), []);
  });

  it("the validator: a parent that is not a group, a group that is its own parent, and a circle", () => {
    const s = shop();
    const d1 = validateScene({ ...s, groups: [...s.groups!.slice(0, 2), { ...s.groups![2], parent: "nowhere" }, ...s.groups!.slice(3)] });
    assert.ok(d1.some((x) => x.path === "groups[2].parent"), formatDiagnostics(d1));
    const d2 = validateScene({ ...s, groups: s.groups!.map((g) => (g.id === "core" ? { ...g, parent: "core" } : g)) });
    assert.ok(d2.some((x) => /cannot be its own parent/.test(x.message)), formatDiagnostics(d2));
    const d3 = validateScene({ ...s, groups: s.groups!.map((g) => (g.id === "backend" ? { ...g, parent: "core" } : g)) });
    assert.ok(d3.some((x) => /nest in a circle/.test(x.message)), formatDiagnostics(d3));
  });

  it("a fact sheet still names each group's own members", () => {
    const s = shop();
    const r = checkExpectation({ format: EXPECT_FORMAT, groups: { clients: ["web", "mobile"], backend: ["gateway"], services: ["orders", "billing"], core: ["domain"], infra: ["postgres", "events"] } }, s, compileScene(s));
    assert.deepEqual(r.diagnostics, [], formatDiagnostics(r.diagnostics));
  });
});
