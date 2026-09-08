/**
 * The two layers of the explanatory-animation IR.
 *
 * **Layer 1 — Scene IR** (`vlmkit-anim/scene@1`): what is being explained. A
 * `kind`-tagged document — a sorting run, a state machine trace, heap
 * operations, messages between distributed nodes, a matrix or table being
 * filled, a graph being traversed, a chart revealed series by series, a
 * concept diagram walked through in steps, or a generic vector timeline. It is the layer an agent
 * writes and a human re-reads: it carries intent (`algorithm: "bubble"`,
 * `trace: ["start", "finish"]`), not coordinates.
 *
 * **Layer 2 — Timeline IR** (`vlmkit-anim/timeline@1`): how it moves. Nodes
 * with initial attributes plus absolute-time keyframe tracks. It is what the
 * `<vlm-anim>` runtime plays through the Web Animations API and what
 * `render-svg.ts` samples headlessly. Every kind compiles to it; it can also
 * be authored directly when nothing semantic fits.
 *
 * Both layers are plain JSON. Types here are the source of truth; the
 * validator in `validate.ts` checks documents against them field by field
 * and phrases each failure for an agent to repair from.
 */

// ---------------------------------------------------------------------------
// Layer 2: Timeline IR
// ---------------------------------------------------------------------------

export const TIMELINE_FORMAT = "vlmkit-anim/timeline@1";
export const SCENE_FORMAT = "vlmkit-anim/scene@1";

export type Shape = "rect" | "circle" | "ellipse" | "text" | "line" | "arrow" | "path" | "group";

export const SHAPES: readonly Shape[] = ["rect", "circle", "ellipse", "text", "line", "arrow", "path", "group"];

/** A point as `[x, y]` in canvas pixels. */
export type Vec2 = [number, number];

export interface TimelineNode {
  id: string;
  shape: Shape;
  /** Translation of the node's local origin. Default `[0, 0]`. */
  pos?: Vec2;
  /** rect / ellipse: `[width, height]`, drawn centred on the local origin. */
  size?: Vec2;
  /** circle radius. */
  r?: number;
  /** rect corner radius. */
  rx?: number;
  /** line / arrow endpoints in local coordinates. */
  points?: [Vec2, Vec2];
  /** path data, local coordinates. */
  d?: string;
  /** path: draw an arrowhead at its end (what `arrow` does for a straight line). */
  head?: boolean | "hollow";
  /** text content (shape `text`) or a label centred in any other shape. */
  text?: string;
  fontSize?: number;
  /** Text anchor for shape `text`. Labels on other shapes are always centred. */
  anchor?: "start" | "middle" | "end";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** 0..1 */
  opacity?: number;
  /** Stroke draw progress 0..1 (line / arrow / path). 1 = fully drawn. */
  dash?: number;
  /** A dashed stroke pattern (an optional or forbidden dependency), once fully drawn. */
  dashed?: boolean;
  /** Text with a background-coloured outline, so a line it sits on breaks around the glyphs (edge and message labels). */
  halo?: boolean;
  scale?: number;
  /** degrees */
  rotate?: number;
  /** Parent `group` node id; children inherit its transform. */
  parent?: string;
  /** Text colour for a `text` shape or a label. Default: dark on light fills. */
  color?: string;
}

/** Animatable properties. `pos` and `size` take `[x, y]`; `text` is discrete. */
export type TrackProp =
  | "pos"
  | "size"
  | "r"
  | "opacity"
  | "fill"
  | "stroke"
  | "color"
  | "scale"
  | "rotate"
  | "dash"
  | "text";

export const TRACK_PROPS: readonly TrackProp[] = [
  "pos",
  "size",
  "r",
  "opacity",
  "fill",
  "stroke",
  "color",
  "scale",
  "rotate",
  "dash",
  "text",
];

export type Easing =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "step-end"
  | "step-start"
  | `cubic-bezier(${string})`;

export const NAMED_EASINGS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-end", "step-start"] as const;

export type TrackValue = number | string | Vec2;

export interface Keyframe {
  /** Absolute time in milliseconds. */
  t: number;
  value: TrackValue;
  /** Easing INTO this keyframe from the previous one. Default `ease-in-out`. */
  easing?: Easing;
}

export interface Track {
  target: string;
  prop: TrackProp;
  keyframes: Keyframe[];
}

/** A named moment: chapter marker for stepping, caption for narration. */
export interface Step {
  t: number;
  label?: string;
  caption?: string;
}

export interface Timeline {
  format: typeof TIMELINE_FORMAT;
  canvas: { width: number; height: number; background?: string };
  /** Total length in ms. Computed from the last keyframe / step when omitted. */
  duration?: number;
  nodes: TimelineNode[];
  tracks: Track[];
  steps?: Step[];
  meta?: { title?: string; kind?: string; [k: string]: unknown };
}

// ---------------------------------------------------------------------------
// Layer 1: Scene IR
// ---------------------------------------------------------------------------

export type SceneKind =
  | "diagram"
  | "modules"
  | "state-machine"
  | "sort"
  | "array"
  | "stack"
  | "queue"
  | "list"
  | "heap"
  | "tree"
  | "distributed"
  | "matrix"
  | "graph"
  | "chart"
  | "flowchart"
  | "gantt"
  | "vector"
  | "compose";

export const SCENE_KINDS: readonly SceneKind[] = ["diagram", "modules", "state-machine", "sort", "array", "stack", "queue", "list", "heap", "tree", "distributed", "matrix", "graph", "chart", "flowchart", "gantt", "vector", "compose"];

interface SceneBase {
  format: typeof SCENE_FORMAT;
  kind: SceneKind;
  title?: string;
  /** Milliseconds per step. Kinds default to 600. */
  stepMs?: number;
  canvas?: { width?: number; height?: number; background?: string };
  theme?: Partial<Theme>;
}

export interface Theme {
  node: string;
  nodeStroke: string;
  text: string;
  accent: string;
  muted: string;
  ok: string;
  bad: string;
  background: string;
  fontSize: number;
}

// ---- annotations (every kind) -----------------------------------------------

export type AnnotationSide = "above" | "below" | "left" | "right";

/** A named readout. The first op with an `id` creates it; later ops with the same id update the text. */
export interface ValueSpec {
  id: string;
  label?: string;
  text: string | number;
  /** An anchor name: draw the readout beside it instead of in the panel. */
  at?: string;
  side?: AnnotationSide;
}
/** A text box with a pointer at an anchor. One per `id` ("main" by default); `null` hides it. */
export interface CalloutSpec {
  id?: string;
  at: string;
  text: string;
  side?: AnnotationSide;
}
/** A frozen copy, in the panel, of what the anchor shows at this moment. */
export interface SnapshotSpec {
  of: string;
  label?: string;
}
/** A dashed outline around one or more anchors, with an optional label; `null` removes it. */
export interface GroupSpec {
  id?: string;
  around: string | string[];
  label?: string;
}
/** A multi-line block (code, a rule, a list). Same id + same line count = update in place and move the highlight. */
export interface TextSpec {
  id?: string;
  lines: string[];
  /** 0-based line to highlight. */
  highlight?: number | null;
  at?: string;
  side?: AnnotationSide;
}

/**
 * The six annotation ops every kind accepts in its own op / sequence / trace /
 * message / timeline list. `caption` replaces the generated caption; `ms: 0`
 * folds the op into the previous beat. Anchors are the names each kind
 * documents (an index, a cell, a node id, a state, a value).
 */
/** A labelled line or arrow between two anchors, drawn edge to edge whatever lies between them; `null` removes every relation. */
/** A colour role rather than a colour: `accent` (the theme's highlight), `bad` (what must not be), `muted` (an aside). */
export type Tone = "accent" | "bad" | "muted";
export const TONES: readonly Tone[] = ["accent", "bad", "muted"];

export interface RelateSpec {
  id?: string;
  from: string;
  to: string;
  label?: string;
  /** `arrow` (default, from → to), a plain `line`, or `equals` — a double line: the two are equivalent / substitutable. */
  style?: "arrow" | "line" | "equals";
  /** Colour role: `accent` (default), `bad` (a relation that must not exist), `muted` (an aside). */
  tone?: Tone;
}

export const ANNOTATION_ACTIONS = ["value", "callout", "snapshot", "group", "text", "relate"] as const;

export type AnnotationOp =
  | { value: ValueSpec; caption?: string; ms?: number }
  | { callout: CalloutSpec | null; caption?: string; ms?: number }
  | { snapshot: SnapshotSpec; caption?: string; ms?: number }
  | { group: GroupSpec | null; caption?: string; ms?: number }
  | { text: TextSpec | null; caption?: string; ms?: number }
  | { relate: RelateSpec | null; caption?: string; ms?: number };

// ---- compose ----------------------------------------------------------------

export interface ComposePane {
  id?: string;
  /** Drawn above the pane. */
  title?: string;
  scene: Exclude<Scene, ComposeScene>;
}

/**
 * Several scenes in one canvas. `row` (default) puts them side by side,
 * `column` stacks them, `grid` wraps two per row. `timing: "sequence"`
 * (default) plays the panes one after another; `"parallel"` starts them
 * together so a before / after runs in lockstep.
 */
export interface ComposeScene extends SceneBase {
  kind: "compose";
  layout?: "row" | "column" | "grid";
  timing?: "sequence" | "parallel";
  /** Pixels between panes. Default 32. */
  gap?: number;
  panes: ComposePane[];
}

// ---- diagram --------------------------------------------------------------

export interface DiagramNode {
  id: string;
  label?: string;
  shape?: "rect" | "circle" | "ellipse";
  /** Explicit position overrides the layout. */
  pos?: Vec2;
  fill?: string;
  /** Colour role for a still: `accent` fills the box, `bad` / `muted` colour its outline and label. */
  tone?: Tone;
  /** Hidden until a `show` step reveals it. Default: visible from t=0. */
  hidden?: boolean;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  /**
   * `arrow` (default), plain `line`, `dashed` (an optional or weak edge, still laid out), `implements` (dashed
   * with a hollow head: a realisation of an interface, still laid out), or `forbidden` (dashed in the `bad`
   * colour, drawn but ignored by the layout — the dependency that must not exist).
   */
  style?: EdgeStyle;
  /** Colour role for a still, without a `highlight` step: `accent`, `bad`, `muted` (stroke and label). */
  tone?: Tone;
  hidden?: boolean;
}

export type EdgeStyle = "arrow" | "line" | "dashed" | "implements" | "forbidden";
export const EDGE_STYLES: readonly EdgeStyle[] = ["arrow", "line", "dashed", "implements", "forbidden"];

/** One narrated beat of a diagram. Exactly one action key per step. */
export type DiagramStep =
  | { show: string | string[]; caption?: string; ms?: number }
  | { hide: string | string[]; caption?: string; ms?: number }
  | { highlight: string | string[]; caption?: string; ms?: number }
  | { unhighlight: string | string[]; caption?: string; ms?: number }
  /** `"a->b"` or `["a","b"]`: a token travels along the edge. */
  | { flow: string | [string, string]; caption?: string; ms?: number }
  | { note: string; ms?: number }
  | { relabel: { id: string; text: string }; caption?: string; ms?: number }
  | AnnotationOp;

/** A container drawn around several nodes: a package, a layer, a bounded context. Laid out so it holds only its members. */
export interface DiagramGroup {
  id: string;
  label?: string;
  nodes: string[];
}

export interface DiagramScene extends SceneBase {
  kind: "diagram";
  nodes: DiagramNode[];
  edges?: DiagramEdge[];
  /** Containers around nodes; a node belongs to at most one. Their ids are anchors and `highlight` targets. */
  groups?: DiagramGroup[];
  /** `lr` (default), `tb`, `grid`, `circle`. Ignored for nodes with `pos`. */
  layout?: "lr" | "tb" | "grid" | "circle";
  sequence?: DiagramStep[];
}

// ---- modules (a still-figure preset over diagram) --------------------------

export interface ModuleDef {
  id: string;
  label?: string;
  /** Colour role for a still: `accent` fills the box, `bad` / `muted` colour its outline and label. */
  tone?: Tone;
  /** Hidden until a `show` step reveals it. */
  hidden?: boolean;
}

/** `["a", "b"]` (a depends on b) or the long form; `tone` colours one dependency in a still without a sequence. */
export type ModuleDep = readonly [string, string] | { from: string; to: string; label?: string; style?: EdgeStyle; tone?: Tone; hidden?: boolean };

export interface ModuleGroup {
  id: string;
  label?: string;
  modules: string[];
}

/**
 * A module map: what depends on what, drawn as layers with dependencies pointing
 * one way (down by default), containers around the modules that belong together.
 * Without a `sequence` it is a still figure; with one it walks the map in beats
 * (the diagram steps and every annotation op).
 */
export interface ModulesScene extends SceneBase {
  kind: "modules";
  modules: (string | ModuleDef)[];
  /** `[a, b]` reads "a depends on b": the arrow runs from a to b and a sits above b. */
  deps?: ModuleDep[];
  groups?: ModuleGroup[];
  /** `tb` (default): dependencies point down. `lr`: they point right. */
  layout?: "tb" | "lr";
  sequence?: DiagramStep[];
}

// ---- state-machine --------------------------------------------------------

export interface StateDef {
  id: string;
  label?: string;
  /** Drawn with a double ring. */
  final?: boolean;
  /** Pin this state; unpinned states are laid out around it. */
  pos?: Vec2;
}

export interface Transition {
  from: string;
  to: string;
  /** Event name; the arrow label. */
  on: string;
  /** Optional guard / action text appended to the label. */
  note?: string;
}

/**
 * One item of a trace: an event name, an event with its own caption, a
 * captioned pause, or a jump — the token moves to `goto` without a
 * transition, which is how a second path is shown after the first has ended.
 */
export type TraceItem = string | { on: string; caption?: string } | { note: string } | { goto: string; caption?: string } | AnnotationOp;

export interface StateMachineScene extends SceneBase {
  kind: "state-machine";
  states: (string | StateDef)[];
  initial: string;
  transitions: Transition[];
  /** Fired in order; each event must be a legal transition from the current state. */
  trace: TraceItem[];
  layout?: "lr" | "tb" | "circle";
}

// ---- sort -----------------------------------------------------------------

/** Every op may carry `caption` (overrides the generated one) and `ms` (this beat's length). */
export type SortOp =
  | { compare: [number, number]; caption?: string; ms?: number }
  | { swap: [number, number]; caption?: string; ms?: number }
  /** Mark index as in its final place. */
  | { done: number | number[]; caption?: string; ms?: number }
  /** Overwrite the value at an index (insertion sort shifts). */
  | { set: { index: number; value: number }; caption?: string; ms?: number }
  /** A captioned pause: the string is the caption. */
  | { note: string; ms?: number }
  | AnnotationOp;

export interface SortScene extends SceneBase {
  kind: "sort";
  values: number[];
  /** Generate `ops` by running this algorithm. Ignored when `ops` is given. */
  algorithm?: "bubble" | "insertion" | "selection";
  ops?: SortOp[];
  /** Compare / swap captions on by default. */
  captions?: boolean;
}

// ---- array ----------------------------------------------------------------

/** Every op may carry `caption` (overrides the generated one) and `ms`. Indices are 0-based positions. */
export type ArrayOp =
  /** Create or move named pointers (arrows under the array). `null` removes one. */
  | { pointers: Record<string, number | null>; caption?: string; ms?: number }
  /** Bracket a contiguous range `[from, to]` (inclusive); `null` clears it. */
  | { window: [number, number] | null; caption?: string; ms?: number }
  | { compare: [number, number]; caption?: string; ms?: number }
  | { swap: [number, number]; caption?: string; ms?: number }
  | { set: { index: number; value: number | string }; caption?: string; ms?: number }
  | { highlight: number | number[]; caption?: string; ms?: number }
  | { unhighlight: number | number[] | "all"; caption?: string; ms?: number }
  /** Permanent done colour: the answer, a settled prefix. */
  | { mark: number | number[]; caption?: string; ms?: number }
  /** The result: the cell turns the ok colour and pulses; the caption defaults to "Found v at i". */
  | { found: number; caption?: string; ms?: number }
  | { note: string; ms?: number }
  | AnnotationOp;

export interface ArrayScene extends SceneBase {
  kind: "array";
  values: (number | string)[];
  /** Generate `ops` by running the algorithm. Ignored when `ops` is given. */
  algorithm?: "binary-search" | "two-pointer-sum" | "sliding-window";
  /** binary-search: the value to find; two-pointer-sum: the sum to reach. */
  target?: number;
  /** sliding-window: the window length. */
  window?: number;
  ops?: ArrayOp[];
}

// ---- stack / queue --------------------------------------------------------

/** Every op may carry `caption`. */
export type StackOp =
  | { push: number | string; caption?: string }
  | { pop: true; caption?: string }
  /** Highlight the top without removing it. */
  | { peek: true; caption?: string }
  | { note: string }
  | AnnotationOp;

export interface StackScene extends SceneBase {
  kind: "stack";
  /** Bottom to top. */
  initial?: (number | string)[];
  ops: StackOp[];
  /** Draw this many slots; a push past it is narrated as overflow and refused. */
  capacity?: number;
}

export type QueueOp =
  | { enqueue: number | string; caption?: string }
  | { dequeue: true; caption?: string }
  /** Highlight the front without removing it. */
  | { peek: true; caption?: string }
  | { note: string }
  | AnnotationOp;

export interface QueueScene extends SceneBase {
  kind: "queue";
  /** Front to back. */
  initial?: (number | string)[];
  ops: QueueOp[];
  capacity?: number;
}

// ---- list (singly linked) -------------------------------------------------

/** Every op may carry `caption`. Positions are 0-based from the head. */
export type ListOp =
  /** Insert a value: at a position, or right after the first node holding `after`. */
  | { insert: { value: number | string; at?: number; after?: number | string }; caption?: string }
  /** Remove the first node holding this value. */
  | { remove: number | string; caption?: string }
  /** Walk from the head comparing until the value is found (or the end is reached). */
  | { find: number | string; caption?: string }
  /** Reverse the whole list: nodes trade places and the arrows flip. */
  | { reverse: true; caption?: string }
  | { note: string }
  | AnnotationOp;

export interface ListScene extends SceneBase {
  kind: "list";
  /** Head first. */
  initial?: (number | string)[];
  ops: ListOp[];
}

// ---- heap -----------------------------------------------------------------

export type HeapOp = { push: number; caption?: string } | { pop: true; caption?: string } | { note: string } | AnnotationOp;

export interface HeapScene extends SceneBase {
  kind: "heap";
  /** `min` (default) or `max`. */
  type?: "min" | "max";
  /** Values present before the first op. Heapified as given (must already satisfy the heap property). */
  initial?: number[];
  ops: HeapOp[];
}

// ---- tree (binary search tree) --------------------------------------------

/** Every op may carry `caption`. */
export type TreeOp =
  /** Walk down from the root comparing, then attach as a leaf. */
  | { insert: number; caption?: string }
  /** Walk down comparing; the node found (or the empty spot) is narrated. */
  | { search: number; caption?: string }
  /** Leaf: removed. One child: the child moves up. Two children: the in-order successor takes its place. */
  | { delete: number; caption?: string }
  /** A token visits every node in this order and the visited values line up underneath. */
  | { traverse: "inorder" | "preorder" | "postorder" | "levelorder"; caption?: string }
  | { note: string }
  | AnnotationOp;

export interface TreeScene extends SceneBase {
  kind: "tree";
  /** Values present before the first op, inserted in this order without animation. */
  initial?: number[];
  ops: TreeOp[];
}

// ---- distributed ----------------------------------------------------------

export interface DistNode {
  id: string;
  label?: string;
  /** Initial status, colours the box: `up` (default) `down` `leader` `busy`. */
  status?: "up" | "down" | "leader" | "busy";
}

export interface DistMessage {
  from: string;
  to: string;
  label?: string;
  /** Start time in ms, or `"<"` to start together with the previous message. Default: right after the previous message lands. */
  at?: number | "<";
  /** Start when the earlier message with this `label` lands (plus `delay`). Alternative to `at`. */
  after?: string;
  /** Extra ms after the `after` message lands. Default 0. */
  delay?: number;
  /** Travel time in ms. Default `stepMs`. */
  latency?: number;
  /** Drop the message: it fades mid-way and never lands. */
  lost?: boolean;
  caption?: string;
}

export interface DistEvent {
  /** Absolute ms. Fragile when message timing shifts; prefer `after`. */
  at?: number;
  /** Fire when the message with this `label` lands (plus `delay`). */
  after?: string;
  delay?: number;
  node: string;
  status: "up" | "down" | "leader" | "busy";
  caption?: string;
}

/**
 * A captioned pause in the message list: the caption is shown, nothing travels,
 * and everything after it waits (every node is busy reading). Timed like a
 * message: `at` / `after` + `delay`, else when everything so far has landed.
 */
export interface DistNote {
  note: string;
  at?: number;
  after?: string;
  delay?: number;
}

export interface DistributedScene extends SceneBase {
  kind: "distributed";
  nodes: (string | DistNode)[];
  messages: (DistMessage | DistNote | AnnotationOp)[];
  events?: DistEvent[];
  /**
   * When a message with no `at` / `after` starts.
   * `causal` (default): when its sender is free — the later of the last message
   * the sender received landing and the sender's own previous message landing;
   * senders with nothing to wait for send at 0. A reply waits for what it
   * replies to; a side branch from another node never delays it.
   * `sequential`: when the previous message in the list lands, whatever the
   * sender. Inserting a message then delays everything after it.
   */
  timing?: "sequential" | "causal";
}

// ---- matrix ---------------------------------------------------------------

/** A cell's content. `null` draws an empty cell (a DP table before it is filled). */
export type CellValue = number | string | null;

/** `[row, col]`, 0-based. */
export type CellRef = [number, number];

/** One cell, several cells, a whole row, or a whole column. */
export type MatrixTarget = { cell: CellRef } | { cells: CellRef[] } | { row: number } | { col: number };

/** Every op may carry `caption` (overrides the generated one) and `ms`. */
export type MatrixOp =
  /** Write a value into a cell. `from` names the cells it was computed from: they flash and a token travels from each to the target. */
  | { set: { cell: CellRef; value: number | string; from?: CellRef[] }; caption?: string; ms?: number }
  | { highlight: MatrixTarget; caption?: string; ms?: number }
  /** Back to the plain colour; `"all"` clears every highlight (marks stay). */
  | { unhighlight: MatrixTarget | "all"; caption?: string; ms?: number }
  /** Rows or columns trade places; labels move with them. */
  | { swap: { rows: [number, number] } | { cols: [number, number] }; caption?: string; ms?: number }
  /** Permanent "done" colour (the answer cell, the pivot row). */
  | { mark: MatrixTarget; caption?: string; ms?: number }
  | { note: string; ms?: number }
  | AnnotationOp;

export interface MatrixScene extends SceneBase {
  kind: "matrix";
  /** Rows of cells, all the same length. A single row is a plain array. */
  cells: CellValue[][];
  rowLabels?: string[];
  colLabels?: string[];
  ops?: MatrixOp[];
}

// ---- graph ----------------------------------------------------------------

export interface GraphNode {
  id: string;
  label?: string;
  /** Pin this node; the rest are laid out around it. */
  pos?: Vec2;
}

/** `{"from", "to", "weight", "label"}` or the shorthand `["a", "b"]`. */
export type GraphEdge = { from: string; to: string; weight?: number; label?: string } | [string, string];

/** Every op may carry `caption` and `ms`. */
export type GraphOp =
  /** The node becomes the current one (accent), then stays "visited" (ok colour). */
  | { visit: string; caption?: string; ms?: number }
  /** A token travels along an existing edge, `"a->b"` or `["a", "b"]`; on an undirected graph either direction. */
  | { explore: string | [string, string]; caption?: string; ms?: number }
  /** Text beside a node (or the same text beside several) — a distance, a depth, a colour class. */
  | { label: { node: string | string[]; text: string }; caption?: string; ms?: number }
  | { highlight: string | string[]; caption?: string; ms?: number }
  | { unhighlight: string | string[]; caption?: string; ms?: number }
  /** The edges along these nodes turn the ok colour: the answer. */
  | { path: string[]; caption?: string; ms?: number }
  | { note: string; ms?: number }
  | AnnotationOp;

export interface GraphScene extends SceneBase {
  kind: "graph";
  nodes: (string | GraphNode)[];
  edges: GraphEdge[];
  /** Arrows instead of lines, and `explore` must follow the arrow. Default false. */
  directed?: boolean;
  /** `circle` (default), `lr`, `tb`, `grid`; nodes with `pos` are pinned. */
  layout?: "circle" | "lr" | "tb" | "grid";
  /** Generate `ops` by running the algorithm from `start`. Ignored when `ops` is given. */
  algorithm?: "bfs" | "dfs" | "dijkstra";
  start?: string;
  /** dijkstra: also show the shortest path to this node at the end. */
  goal?: string;
  ops?: GraphOp[];
}

// ---- flowchart ------------------------------------------------------------

/** `process` (a box, default), `decision` (a diamond: a question with labelled ways out), `terminal` (a pill: start / end), `io` (a slanted box: input / output). */
export type FlowShape = "process" | "decision" | "terminal" | "io";
export const FLOW_SHAPES: readonly FlowShape[] = ["process", "decision", "terminal", "io"];

export interface FlowNode {
  id: string;
  label?: string;
  shape?: FlowShape;
  /** Pin this node; the rest are laid out around it. */
  pos?: Vec2;
}

/** `{"from", "to", "label"}` — the label is the answer a decision's way out carries ("yes", "n > 0") — or the shorthand `["a", "b"]`. */
export type FlowEdge = { from: string; to: string; label?: string } | [string, string];

/**
 * One step of the walk: the id of the next node (the hop must be an edge), `{"at": id, "caption"}` to narrate it
 * yourself, `{"note": "…"}` for a captioned pause, or an annotation op.
 */
export type FlowWalkItem = string | { at: string; caption?: string; ms?: number } | { note: string; ms?: number } | AnnotationOp;

export interface FlowchartScene extends SceneBase {
  kind: "flowchart";
  nodes: (string | FlowNode)[];
  edges: FlowEdge[];
  /** Where the walk starts. Default: the first node. */
  start?: string;
  /** The nodes visited after `start`, in order; each hop follows an edge. A decision's hop is captioned with the edge's label. */
  walk?: FlowWalkItem[];
  /** `tb` (default) or `lr`. */
  layout?: "tb" | "lr";
}

// ---- gantt ----------------------------------------------------------------

export interface GanttTask {
  id: string;
  label?: string;
  /** In the scene's `unit`s (days, weeks, sprints — a label, not a clock). */
  start: number;
  /** Omitted on a milestone: a point at `start`. */
  end?: number;
  /** The row band this task belongs to; tasks without a lane each get their own row. */
  lane?: string;
  /** Tasks this one depends on: an arrow from each one's end to this one's start; the check warns when it starts before they end. */
  after?: string[];
  /** A diamond at `start` instead of a bar. */
  milestone?: boolean;
  /** Who does it: drawn small inside the bar (or after it when the bar is short). */
  owner?: string;
}

/** Every op may carry `caption` and `ms`. */
export type GanttOp =
  /** Move the time cursor to `advance` (absolute, in units): bars the cursor passes fill, tasks it is inside light up, done ones settle. */
  | { advance: number; caption?: string; ms?: number }
  /** A task's dates change: its bar stretches or moves. With `cascade`, every dependent that would now start before it ends moves by the same amount, and theirs after them. */
  | { slip: { task: string; start?: number; end?: number; cascade?: boolean }; caption?: string; ms?: number }
  /** Colour a task by what happened to it: `late` (the bad colour), `blocked` (muted), `done` (ok) — read by the check. */
  | { status: { task: string; state: "late" | "blocked" | "done" }; caption?: string; ms?: number }
  | { note: string; ms?: number }
  | AnnotationOp;

export interface GanttScene extends SceneBase {
  kind: "gantt";
  tasks: GanttTask[];
  /** The name of the time unit for the axis ("day", "week", "sprint"). Default "day". */
  unit?: string;
  /** Tick spacing on the axis, in units. Default: a 1-2-5 step that gives 5–10 ticks. */
  tick?: number;
  /** Time where the axis starts and ends. Default: 0 and the latest end (plus one tick). */
  from?: number;
  to?: number;
  ops?: GanttOp[];
}

// ---- chart ----------------------------------------------------------------

export interface ChartSeries {
  id: string;
  label?: string;
  /** One value per category. */
  values: number[];
  color?: string;
}

/** Which bars / points a step touches. */
export type ChartTarget = { series?: string; index?: number; category?: string };

/** Every step may carry `caption` and `ms`. */
export type ChartStep =
  /** Bars grow in / the line draws in. */
  | { reveal: string | string[] | "all"; caption?: string; ms?: number }
  /** Change one value; the bar animates to the new height (bar charts only). */
  | { set: { series: string; index: number; value: number }; caption?: string; ms?: number }
  | { highlight: ChartTarget; caption?: string; ms?: number }
  | { unhighlight: ChartTarget | "all"; caption?: string; ms?: number }
  /** A horizontal reference line at a y value. */
  | { threshold: { value: number; label?: string }; caption?: string; ms?: number }
  | { note: string; ms?: number }
  | AnnotationOp;

export interface ChartScene extends SceneBase {
  kind: "chart";
  /** `bar` (default) or `line`. */
  type?: "bar" | "line";
  /** x-axis labels; every series has one value per category. */
  categories: string[];
  series: ChartSeries[];
  /** Top of the y axis. Default: 10% above the largest value (including `set` values and thresholds). */
  yMax?: number;
  yLabel?: string;
  /** Default: reveal each series in order. */
  sequence?: ChartStep[];
}

// ---- vector (generic) -----------------------------------------------------

/**
 * A tween in author-friendly form. `to` lists the properties reached by the
 * end of the tween; `x` / `y` / `w` / `h` are accepted as shorthand for the
 * components of `pos` / `size`.
 */
export interface VectorTween {
  target: string | string[];
  to: Record<string, TrackValue>;
  /** Default 500. */
  duration?: number;
  easing?: Easing;
  /**
   * Start time. A number is absolute ms. `"<"` starts with the previous item.
   * `"+200"` / `"-100"` offsets from the previous item's end. Default: after the
   * previous item.
   */
  at?: number | string;
  caption?: string;
  label?: string;
}

/** A pause of `wait` ms, optionally captioned. */
export interface VectorWait {
  wait: number;
  caption?: string;
  label?: string;
}

export interface VectorScene extends SceneBase {
  kind: "vector";
  nodes: TimelineNode[];
  timeline: (VectorTween | VectorWait | AnnotationOp)[];
}

export type Scene =
  | DiagramScene
  | ModulesScene
  | StateMachineScene
  | SortScene
  | ArrayScene
  | StackScene
  | QueueScene
  | ListScene
  | HeapScene
  | TreeScene
  | DistributedScene
  | MatrixScene
  | GraphScene
  | ChartScene
  | FlowchartScene
  | GanttScene
  | VectorScene
  | ComposeScene;

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type Severity = "error" | "warn";

export interface Diagnostic {
  severity: Severity;
  /** JSON path, e.g. `nodes[2].shape`. */
  path: string;
  message: string;
  /** How to repair, when the validator can tell. */
  hint?: string;
}
