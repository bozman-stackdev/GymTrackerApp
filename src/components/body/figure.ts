/**
 * Geometry of the muscle-map figure: a clean, anatomical-style body, front and back, male and female.
 *
 * Every shape is a list of points for the LEFT half of the picture (x < 100), smoothed into curves and mirrored for
 * the right half, so both sides always match. The female figure is the same drawing with a different width profile
 * (narrower shoulders and waist, wider hips) plus its own chest shape, so the two bodies and the two views stay
 * consistent with each other. Pure data, no React; paths are built once per body and view.
 *
 * viewBox: 0 0 200 440, centre line x = 100. In the front view the left of the picture is the body's right side.
 */
import type { BodyType, MuscleId } from '../../types';
import type { BodyView } from '../../logic/muscles/catalog';

/** [distance from the centre line, y]; a third value 'c' makes a sharp corner. */
type P = [number, number] | [number, number, 'c'];
type Segment = 'trunk' | 'arm';

export interface FigurePart {
  muscle: MuscleId;
  /** The body's side (the front view shows the body's right side on the left of the picture). */
  side: 'left' | 'right';
  d: string;
}

export interface Figure {
  /** The body silhouette (head, neck, hands, feet, joints show in this colour). */
  base: string[];
  /** Hair (the female figure's bun), drawn over the silhouette in its own shade. */
  hair: string[];
  parts: FigurePart[];
  /** Thin decorative lines (e.g. the spine). */
  lines: string[];
}

// ---------- Shapes (male proportions; dx = distance from the centre line) ----------

/** Half the head outline (crown to chin); drawn whole. */
const HEAD: P[] = [[0, 10], [9, 11.5], [15.5, 18], [17.5, 29], [16.5, 39], [13, 47], [7.5, 53], [0, 55]];
/** Female hair: from the front a cap with a hairline, from behind the back of the head down to the nape. */
const HAIR_FRONT: P[] = [[0, 8.5], [9.5, 9.8], [16.4, 16.5], [18.4, 27], [17.6, 35], [15.2, 31], [12.6, 22], [6.5, 17.8], [0, 16.8]];
const HAIR_BACK: P[] = [[0, 8.5], [9.5, 9.8], [16.4, 16.5], [18.4, 28], [17.4, 39], [14, 47], [8, 51], [0, 52]];

const BASE: { seg: Segment; pts: P[] }[] = [
  // Neck
  { seg: 'trunk', pts: [[0, 44], [9, 44], [10, 56], [13, 64], [0, 66]] },
  // Torso down to the crotch
  {
    seg: 'trunk',
    pts: [[0, 60], [12, 61], [26, 66], [40, 72], [45, 80], [41, 96], [37, 106], [36, 124], [34, 146], [30, 168], [31, 186], [35, 204], [37, 218],
      [33, 228], [20, 234], [6, 240], [0, 242]],
  },
  // Upper arm
  { seg: 'arm', pts: [[44, 74], [52, 81], [56, 96], [57, 118], [58, 140], [59, 158], [60, 170], [53, 175], [46, 172], [43, 160], [40, 140], [38, 120], [37, 106], [39, 90]] },
  // Forearm
  { seg: 'arm', pts: [[59, 166], [63, 180], [64, 200], [63, 222], [62, 238], [57, 241], [54, 240], [51, 224], [48, 204], [46, 186], [45, 170]] },
  // Hand
  { seg: 'arm', pts: [[62, 234], [65, 246], [66, 260], [62, 273], [57, 275], [53, 263], [52, 248], [53, 237]] },
  // Thigh
  { seg: 'trunk', pts: [[37, 214], [39, 236], [39, 258], [37, 282], [33, 306], [31, 322], [21, 328], [11, 324], [8, 300], [5, 274], [3, 252], [1.5, 242], [8, 237], [20, 232], [30, 222]] },
  // Lower leg
  { seg: 'trunk', pts: [[31, 318], [33, 336], [34, 352], [32, 370], [28, 390], [25, 404], [23, 414], [15, 415], [13, 400], [11, 380], [10, 358], [10, 340], [11, 320]] },
  // Foot
  { seg: 'trunk', pts: [[24, 408], [27, 419], [28, 428], [22, 433], [14, 433], [11, 428], [12, 418], [15, 408]] },
];

type Shape = { muscle: MuscleId; seg: Segment; pts: P[] };
const sh = (muscle: MuscleId, seg: Segment, pts: P[]): Shape => ({ muscle, seg, pts });

const CHEST_MALE: P[] = [[1.8, 82], [14, 79], [27, 79], [35, 82], [41, 90, 'c'], [38, 101], [31, 111], [21, 118], [11, 120], [3, 117], [1.8, 100]];
const CHEST_FEMALE: P[] = [[1.8, 86], [13, 83], [25, 83], [33, 86], [39, 93, 'c'], [38, 104], [32, 115], [22, 122], [12, 123], [4, 119], [1.8, 104]];

const FRONT: Shape[] = [
  sh('chest', 'trunk', CHEST_MALE),
  sh('upper-back', 'trunk', [[11, 58], [14, 62], [26, 67], [37, 72], [34, 76], [24, 74], [13, 70], [10, 64]]),
  sh('front-delts', 'arm', [[35, 77], [42, 73], [48, 76], [52, 86], [51, 99], [47, 111], [43, 103], [40, 93], [37, 85]]),
  sh('side-delts', 'arm', [[49, 77], [54, 83], [57, 96], [56, 110], [51, 117], [52, 103], [53, 89]]),
  sh('biceps', 'arm', [[42, 113], [48, 110], [54, 118], [57, 134], [57, 150], [55, 162], [50, 167], [45, 159], [42, 141], [41, 125]]),
  sh('forearms', 'arm', [[46, 173], [52, 170], [58, 172], [62, 182], [62, 198], [60, 216], [58, 231], [55, 235], [52, 226], [49, 206], [46, 188]]),
  sh('abs', 'trunk', [[1.8, 126], [11, 124], [13, 134], [12, 144], [1.8, 145]]),
  sh('abs', 'trunk', [[1.8, 148], [12, 147], [13, 157], [12, 166], [1.8, 167]]),
  sh('abs', 'trunk', [[1.8, 170], [12, 169], [13, 179], [12, 188], [1.8, 189]]),
  sh('abs', 'trunk', [[1.8, 192], [12, 191], [13, 202], [10, 216], [6, 226], [1.8, 230]]),
  sh('obliques', 'trunk', [[15, 134], [22, 128], [30, 126], [34, 136], [33, 152], [30, 168], [30, 182], [32, 196], [27, 208], [19, 214], [14, 208], [15, 186], [15, 160]]),
  // Thigh: vastus lateralis (outer), rectus femoris (centre), vastus medialis (teardrop above the knee), inner thigh.
  sh('quads', 'trunk', [[31, 222], [36, 224], [39, 238], [39.5, 258], [38, 280], [35, 300], [31, 316], [27, 320], [24, 314], [24.5, 300], [27, 275], [29, 250], [30, 232]]),
  sh('quads', 'trunk', [[25, 224], [30, 226], [29, 250], [27, 275], [24.5, 300], [22, 309], [18.5, 302], [14.5, 288], [14.5, 270], [16, 250], [18, 236]]),
  sh('quads', 'trunk', [[13, 291], [18, 302], [22.5, 312], [21, 322], [14, 323], [10.5, 312], [11, 299]]),
  sh('adductors', 'trunk', [[2.5, 247], [9, 241], [16.5, 236], [15, 252], [14, 272], [11.5, 289], [7, 283], [4, 265]]),
  // Lower leg from the front: the inner and outer calf (the shin between them isn't a tracked muscle).
  sh('calves', 'trunk', [[10.5, 338], [17, 340], [20.5, 352], [20, 368], [16.5, 384], [12.5, 380], [10.5, 364], [10, 348]]),
  sh('calves', 'trunk', [[26.5, 338], [32.5, 341], [34.5, 354], [32.5, 371], [28.5, 389], [25.5, 378], [24.5, 358]]),
];

const BACK: Shape[] = [
  sh('upper-back', 'trunk', [[1.8, 58], [10, 58], [14, 64], [26, 69], [37, 73], [35, 79], [26, 84], [18, 94], [14, 108], [10, 124], [6, 140], [1.8, 152]]),
  sh('upper-back', 'trunk', [[18, 98], [27, 89], [35, 85], [37, 97], [34, 106], [26, 108], [19, 106]]),
  sh('rear-delts', 'arm', [[35, 79], [42, 74], [48, 78], [51, 88], [49, 100], [44, 108], [40, 100], [37, 90]]),
  sh('side-delts', 'arm', [[49, 77], [53, 83], [56, 96], [55, 110], [51, 116], [51, 102], [52, 88]]),
  sh('triceps', 'arm', [[41, 112], [48, 109], [54, 118], [57, 134], [57, 152], [54, 164], [49, 168], [45, 160], [42, 142], [40, 125]]),
  sh('forearms', 'arm', [[46, 175], [54, 171], [60, 174], [63, 186], [62, 204], [60, 222], [57, 233], [54, 235], [51, 222], [48, 202], [46, 187]]),
  sh('lats', 'trunk', [[16, 111], [25, 111], [34, 109], [37, 113], [36, 128], [33, 148], [29, 166], [22, 180], [14, 186], [11, 172], [12, 150], [13, 128]]),
  sh('lower-back', 'trunk', [[1.8, 157], [8, 153], [12, 163], [13, 180], [13, 196], [10, 208], [1.8, 212]]),
  sh('obliques', 'trunk', [[15, 191], [23, 182], [31, 183], [35, 193], [35.5, 204], [28, 208.5], [19, 208.5], [14.5, 203]]),
  sh('glutes', 'trunk', [[1.8, 226], [7, 216], [18, 211.5], [29, 213], [36, 222], [38, 236], [36, 250], [29, 259], [18, 263], [8, 262], [1.8, 255]]),
  sh('hamstrings', 'trunk', [[22, 266], [34, 260], [37, 274], [35, 291], [31, 307], [27, 319], [23, 307], [21, 287]]),
  sh('hamstrings', 'trunk', [[6, 264], [19, 268], [20, 286], [19, 304], [16, 319], [11, 321], [8, 305], [5, 285]]),
  sh('calves', 'trunk', [[20, 331], [29, 331], [33, 345], [32, 362], [27, 376], [22, 368], [20, 350]]),
  sh('calves', 'trunk', [[9, 333], [18, 333], [19, 352], [17, 374], [12, 380], [9, 364], [8, 347]]),
  sh('calves', 'trunk', [[12, 383], [18, 379], [26, 379], [28, 389], [25, 400], [20, 404], [15, 400], [12, 392]]),
];

// ---------- The female width profile ----------

/** Width multiplier by height for the trunk and legs: narrower shoulders and waist, wider hips and thighs. */
const TRUNK_FEMALE: [number, number][] = [
  [20, 0.95], [44, 0.92], [58, 0.86], [72, 0.9], [120, 0.9], [150, 0.89], [172, 0.85], [195, 0.97], [215, 1.06], [245, 1.08],
  [270, 1.06], [300, 1.03], [325, 0.99], [360, 0.96], [440, 0.94],
];
/** Arms follow the shoulders in and are a little slimmer. */
const ARM_FEMALE = 0.89;

function profile(stops: [number, number][], y: number): number {
  if (y <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [y1, s1] = stops[i];
    if (y <= y1) {
      const [y0, s0] = stops[i - 1];
      return s0 + ((s1 - s0) * (y - y0)) / (y1 - y0);
    }
  }
  return stops.at(-1)![1];
}

function shape(pts: P[], seg: Segment, body: BodyType): P[] {
  if (body === 'male') return pts;
  return pts.map((p) => {
    const k = seg === 'arm' ? ARM_FEMALE : profile(TRUNK_FEMALE, p[1]);
    return (p.length === 3 ? [p[0] * k, p[1], 'c'] : [p[0] * k, p[1]]) as P;
  });
}

// ---------- Paths ----------

const f = (n: number) => String(Math.round(n * 10) / 10);

/** A closed, smooth path through the points (Catmull-Rom curves; 'c' points are sharp corners). */
function smooth(points: [number, number, boolean][]): string {
  const n = points.length;
  const at = (i: number) => points[(i + n) % n];
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1, c1] = at(i);
    const [x2, y2, c2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const t = 1 / 6;
    const a = c1 ? [x1, y1] : [x1 + (x2 - x0) * t, y1 + (y2 - y0) * t];
    const b = c2 ? [x2, y2] : [x2 - (x3 - x1) * t, y2 - (y3 - y1) * t];
    d += `C${f(a[0])} ${f(a[1])} ${f(b[0])} ${f(b[1])} ${f(x2)} ${f(y2)}`;
  }
  return `${d}Z`;
}

/** Left half (x = 100 - dx) or mirrored right half (x = 100 + dx). */
const toAbs = (pts: P[], mirror: boolean): [number, number, boolean][] =>
  pts.map((p) => [mirror ? 100 + p[0] : 100 - p[0], p[1], p.length === 3]);

/** A shape that touches the centre line is drawn whole (both halves joined), e.g. the neck. */
function whole(pts: P[]): string {
  const left = toAbs(pts, false);
  const right = toAbs([...pts].reverse(), true);
  const same = (a: [number, number, boolean], b: [number, number, boolean]) => a[0] === b[0] && a[1] === b[1];
  const joined = [...left, ...right].filter((p, i, all) => i === 0 || !same(p, all[i - 1]));
  if (same(joined[0], joined.at(-1)!)) joined.pop();
  return smooth(joined);
}

function circle(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0Z`;
}

const cache = new Map<string, Figure>();

export function figure(body: BodyType, view: BodyView): Figure {
  const key = `${body}-${view}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const k = body === 'female' ? 0.93 : 1;
  const base = [
    whole(HEAD.map(([dx, y]) => [dx * k, y] as P)),
    ...BASE.flatMap(({ seg, pts }) => {
      const p = shape(pts, seg, body);
      // Shapes on the centre line are drawn whole; limbs are drawn once per side.
      return p.some(([dx]) => dx === 0) ? [whole(p)] : [smooth(toAbs(p, false)), smooth(toAbs(p, true))];
    }),
  ];

  const shapes = (view === 'front' ? FRONT : BACK).map((s) => (s.muscle === 'chest' && body === 'female' ? { ...s, pts: CHEST_FEMALE } : s));

  // Picture-left is the body's right side in the front view, and the body's left side in the back view.
  const leftSide = view === 'front' ? 'right' : 'left';
  const rightSide = view === 'front' ? 'left' : 'right';
  const parts: FigurePart[] = shapes.flatMap((s) => {
    const p = shape(s.pts, s.seg, body);
    return [
      { muscle: s.muscle, side: leftSide, d: smooth(toAbs(p, false)) },
      { muscle: s.muscle, side: rightSide, d: smooth(toAbs(p, true)) },
    ];
  });

  const lines = view === 'back' ? ['M100 60V212'] : [];
  // Hair with a bun makes the female figure recognisable at a glance: a hairline from the front, the back of the head from behind.
  const scaled = (pts: P[]) => pts.map(([dx, y]) => [dx * k, y] as P);
  const hair = body === 'female'
    ? view === 'front'
      ? [circle(100, 6.5, 6), whole(scaled(HAIR_FRONT))]
      : [whole(scaled(HAIR_BACK)), circle(100, 12, 7)]
    : [];
  const fig = { base, hair, parts, lines };
  cache.set(key, fig);
  return fig;
}

/** Muscles drawn in a view, in drawing order. */
export function musclesInView(view: BodyView): MuscleId[] {
  return [...new Set((view === 'front' ? FRONT : BACK).map((s) => s.muscle))];
}
