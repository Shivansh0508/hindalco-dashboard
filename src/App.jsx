import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import "./App.css";

const navItems = [
  "Overview",
  "Live Stock",
  "Age Analysis",
  "PPC / Movement",
  "Quality",
  "Review / Trial / Reject",
];

/*
   Each tab titles itself. Keyed by the same strings as navItems,
   so a tab without an entry falls back rather than rendering
   blank — worth keeping if the nav list is edited later.
*/
const tabMeta = {
  Overview: {
    title: "Finished Goods Inventory",
    note: "Lot level visibility and reconciliation",
  },
  "Live Stock": {
    title: "Live Stock Position",
    note: "Current holding by grade and dispatch readiness",
  },
  "Age Analysis": {
    title: "Stock Ageing",
    note: "Holding period and provision exposure",
  },
  "PPC / Movement": {
    title: "Production & Movement",
    note: "Throughput measured against plan",
  },
  Quality: {
    title: "Quality Position",
    note: "Inspection outcomes and open holds",
  },
  "Review / Trial / Reject": {
    title: "Non-Standard Stock",
    note: "Disposition and decision pendency",
  },
};

const DAY_MS = 86400000;

const gradeBook = {
  "CA-450": { name: "Calcined Alumina 450", shelfDays: 365 },
  "CA-320": { name: "Calcined Alumina 320", shelfDays: 365 },
  "HY-90": { name: "Hydrate 90", shelfDays: 180 },
  "SP-A11": { name: "Special Alumina A11", shelfDays: 270 },
};

/*
   Seeded by days-to-expiry rather than fixed dates, so the spread
   of expired / near / distant lots stays meaningful however long
   this runs. Produced and expiry dates are derived from it and
   the grade's shelf life.
*/
const lotSeed = [
  { id: "BGM-2508-0147", grade: "CA-450", qty: 50.96, daysLeft: -4, location: "Bagging Bay A", quality: "Accept", check: "Matched" },
  { id: "BGM-2508-0189", grade: "CA-450", qty: 44.82, daysLeft: 4, location: "WH-1 Bay 3", quality: "Trial", check: "-3.17 MT" },
  { id: "BGM-2508-0231", grade: "CA-450", qty: 58.71, daysLeft: 11, location: "Cooling Yard", quality: "Review", check: "-3.88 MT" },
  { id: "BGM-2509-0273", grade: "CA-450", qty: 34.41, daysLeft: 23, location: "Cooling Yard", quality: "Accept", check: "Matched" },
  { id: "BGM-2510-0315", grade: "CA-450", qty: 31.42, daysLeft: 58, location: "Not in register", quality: "Reject", check: "PL2P only" },
  { id: "BGM-2512-0357", grade: "CA-450", qty: 36.75, daysLeft: 104, location: "Cooling Yard", quality: "Trial", check: "Matched" },
  { id: "BGM-2601-0399", grade: "CA-450", qty: 33.13, daysLeft: 163, location: "Cooling Yard", quality: "Reject", check: "Matched" },
  { id: "BGM-2605-0441", grade: "CA-450", qty: 54.92, daysLeft: 263, location: "Bagging Bay A", quality: "Accept", check: "Matched" },

  { id: "BGM-2507-0102", grade: "CA-320", qty: 42.30, daysLeft: -12, location: "Cooling Yard", quality: "Review", check: "-2.10 MT" },
  { id: "BGM-2509-0248", grade: "CA-320", qty: 38.65, daysLeft: 19, location: "WH-1 Bay 3", quality: "Accept", check: "Matched" },
  { id: "BGM-2511-0331", grade: "CA-320", qty: 45.18, daysLeft: 76, location: "Bagging Bay A", quality: "Accept", check: "Matched" },
  { id: "BGM-2602-0410", grade: "CA-320", qty: 29.74, daysLeft: 188, location: "Cooling Yard", quality: "Trial", check: "Matched" },
  { id: "BGM-2604-0468", grade: "CA-320", qty: 51.03, daysLeft: 232, location: "WH-2 Bay 1", quality: "Accept", check: "Matched" },

  { id: "BGM-2604-0455", grade: "HY-90", qty: 27.88, daysLeft: 3, location: "Bagging Bay B", quality: "Accept", check: "Matched" },
  { id: "BGM-2605-0472", grade: "HY-90", qty: 33.20, daysLeft: 41, location: "Cooling Yard", quality: "Review", check: "-1.44 MT" },
  { id: "BGM-2606-0510", grade: "HY-90", qty: 19.65, daysLeft: 95, location: "Not in register", quality: "Reject", check: "PL2P only" },
  { id: "BGM-2607-0533", grade: "HY-90", qty: 40.12, daysLeft: 142, location: "Bagging Bay B", quality: "Accept", check: "Matched" },

  { id: "BGM-2601-0388", grade: "SP-A11", qty: 22.40, daysLeft: -8, location: "WH-1 Bay 3", quality: "Reject", check: "Matched" },
  { id: "BGM-2603-0427", grade: "SP-A11", qty: 36.55, daysLeft: 66, location: "Cooling Yard", quality: "Accept", check: "Matched" },
  { id: "BGM-2606-0499", grade: "SP-A11", qty: 44.90, daysLeft: 201, location: "Bagging Bay A", quality: "Trial", check: "-2.75 MT" },
];

const lotGrades = Object.keys(gradeBook);

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "2-digit",
});

function buildLots(today) {
  return lotSeed.map((lot) => {
    const expires = new Date(today.getTime() + lot.daysLeft * DAY_MS);

    const produced = new Date(
      expires.getTime() - gradeBook[lot.grade].shelfDays * DAY_MS,
    );

    return { ...lot, expires, produced };
  });
}

function ageLabel(daysLeft) {
  return daysLeft < 0
    ? `${Math.abs(daysLeft)}d over`
    : `${daysLeft}d left`;
}

/*
   Four bands, not a gradient: an operator needs to sort lots into
   act-now / act-soon / watch / fine at a glance, and a continuous
   scale makes every row look slightly different from its neighbour
   without saying which bucket it is in.
*/
function expiryTone(daysLeft) {
  if (daysLeft < 0) {
    return "expired";
  }

  if (daysLeft <= 7) {
    return "urgent";
  }

  if (daysLeft <= 30) {
    return "soon";
  }

  return "clear";
}

const stampFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const operators = ["R. Naik", "S. Kulkarni", "A. Patil", "M. Desai"];

/*
   A stable hash off the lot id. Quality readings and operator
   names are derived from it rather than stored, so twenty lots do
   not need twenty hand-written LIMS sheets — and the same lot
   always shows the same numbers between renders.
*/
function lotHash(id) {
  let h = 0;

  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }

  return h;
}

function spread(hash, slot, min, max) {
  const step = (hash >>> (slot * 6)) % 1000;

  return min + (step / 1000) * (max - min);
}

/*
   check carries the reconciliation outcome as text; this turns it
   back into the two figures and their difference so the record can
   show both sides rather than just the verdict.
*/
function reconcile(lot) {
  if (lot.check === "Matched") {
    return { manual: lot.qty, pl2p: lot.qty, diff: 0 };
  }

  if (lot.check === "PL2P only") {
    return { manual: 0, pl2p: lot.qty, diff: -lot.qty };
  }

  const diff = parseFloat(lot.check);

  return {
    manual: lot.qty,
    pl2p: Number((lot.qty - diff).toFixed(2)),
    diff,
  };
}

const MOVE_CHAIN = [
  "Kiln Discharge",
  "Cooling Yard",
  "Bagging Bay A",
  "WH-1 Bay 3",
];

const MOVE_HOURS = [0, 9.2, 27.5, 33.8];

function buildMovements(lot) {
  const known = MOVE_CHAIN.indexOf(lot.location);

  const path =
    known === -1
      ? [...MOVE_CHAIN.slice(0, 3), lot.location]
      : MOVE_CHAIN.slice(0, known + 1);

  const start = lot.produced.getTime();

  return path
    .map((place, i) => ({
      place,
      at: new Date(start + MOVE_HOURS[i] * 3600000),
    }))
    .reverse();
}

/*
   Each reading carries its own spec window. A bare "390 ppm" tells
   an operator nothing; 390 sitting inside 240-450 is legible at a
   glance, which is the whole point of showing it against the band.
*/
const QUALITY_SPEC = [
  { key: "SSA", unit: "m²/g", lo: 0.7, hi: 1.9, dp: 2 },
  { key: "XRF Na₂O", unit: "ppm", lo: 240, hi: 450, dp: 0 },
  { key: "PSD D50", unit: "µm", lo: 55, hi: 85, dp: 1 },
  { key: "LOI", unit: "%", lo: 0.4, hi: 1.4, dp: 1 },
];

/*
   The bar shows a fifth past each limit, so a failing reading has
   somewhere to sit outside the band instead of pinning to the end
   and looking merely borderline.
*/
const SPEC_PAD = 0.2;

function buildQuality(lot) {
  const h = lotHash(lot.id);

  // One reading is out of spec on a rejected lot — that is why it failed.
  const failing =
    lot.quality === "Reject" ? h % QUALITY_SPEC.length : -1;

  return QUALITY_SPEC.map((spec, i) => {
    const span = spec.hi - spec.lo;
    const roll = spread(h, i, 0, 1);

    /*
       A passing reading lands inside the middle 80% of the window
       rather than anywhere in it, so nothing sits so close to a
       limit that the tick looks like a failure.
    */
    let raw = spec.lo + span * (0.1 + roll * 0.8);

    if (i === failing) {
      // Drifting high or low, whichever this lot's hash picks
      raw =
        (h >>> (i * 3)) % 2 === 0
          ? spec.hi + span * (0.04 + roll * 0.09)
          : spec.lo - span * (0.04 + roll * 0.09);
    }

    const value = Number(raw.toFixed(spec.dp));

    const lo = spec.lo - span * SPEC_PAD;
    const hi = spec.hi + span * SPEC_PAD;

    return {
      ...spec,
      value,
      ok: value >= spec.lo && value <= spec.hi,
      tick: Math.max(
        0,
        Math.min(100, ((value - lo) / (hi - lo)) * 100),
      ),
    };
  });
}

/*
   betterDown flips the reading of the delta: a rising mismatch
   count is bad news where a rising match count is good, so the
   arrow's colour cannot come from its direction alone.
*/
const overviewMetrics = [
  {
    key: "all",
    label: "Total FG Stock",
    value: "1,284.6",
    unit: "MT",
    note: "Current available stock",
    tone: "neutral",
    delta: 2.4,
    betterDown: false,
    share: 1284.6 / 1600,
    shareOf: "1,600 MT capacity",
  },
  {
    key: "matched",
    label: "Matching Lots",
    value: "142",
    note: "Manual and PL2P matched",
    tone: "good",
    delta: 1.6,
    betterDown: false,
    share: 142 / 203,
    shareOf: "203 lots",
  },
  {
    key: "mismatch",
    label: "Quantity Mismatch",
    value: "38",
    note: "Lots require reconciliation",
    tone: "warn",
    delta: -8.3,
    betterDown: true,
    share: 38 / 203,
    shareOf: "203 lots",
  },
  {
    key: "attention",
    label: "Attention Required",
    value: "87",
    note: "Expiry / quality / stock issues",
    tone: "bad",
    delta: 16.7,
    betterDown: true,
    share: 87 / 203,
    shareOf: "203 lots",
  },
];

/*
   Each KPI is a saved query over the register. "all" is the
   cleared state rather than a filter, so clicking the lead tile
   resets rather than narrowing to everything.
*/
/*
   What each KPI means when it is armed. One definition, used by
   both the exception list and the lot register, so a card cannot
   mean two different things depending on which table you read.
*/
const kpiTests = {
  all: () => true,
  matched: (l) => l.check === "Matched",
  mismatch: (l) => l.check !== "Matched" && l.check !== "PL2P only",
  // Already past shelf life, or inside the last week of it
  attention: (l) => l.daysLeft <= 7,
};

/*
   Module A. Bands rather than a continuous scale: dispatch decides
   act-now / act-this-week / watch, and a band is what that decision
   actually looks like.
*/
const AGE_BANDS = [
  {
    key: "expired",
    label: "Expired",
    note: "past shelf life",
    tone: "pill-bad",
    test: (l) => l.daysLeft < 0,
  },
  {
    key: "week",
    label: "Within 7 days",
    note: "dispatch or re-test now",
    tone: "pill-bad",
    test: (l) => l.daysLeft >= 0 && l.daysLeft <= 7,
  },
  {
    key: "month",
    label: "8 to 30 days",
    note: "plan the movement",
    tone: "pill-warn",
    test: (l) => l.daysLeft > 7 && l.daysLeft <= 30,
  },
  {
    key: "quarter",
    label: "31 to 90 days",
    note: "watch",
    tone: "pill-warn",
    test: (l) => l.daysLeft > 30 && l.daysLeft <= 90,
  },
  {
    key: "clear",
    label: "Over 90 days",
    note: "no action",
    tone: "pill-ok",
    test: (l) => l.daysLeft > 90,
  },
];

/* Module D, the same three outcomes the reconciliation rings show */
const RECON_TESTS = {
  saleable: (l) => l.check === "Matched",
  review: (l) =>
    l.check !== "Matched" && l.check !== "PL2P only",
  reject: (l) => l.check === "PL2P only",
};

/*
   One armed filter for the whole overview. Whatever you click last
   — a KPI, a reconciliation ring, an ageing band, a quality row —
   narrows the lot register to that set. Kept as a kind plus a value
   rather than a bare predicate, so the register can name what armed
   it and clicking the same thing twice can disarm it.
*/
function lotPasses(lot, filter) {
  if (!filter) {
    return true;
  }

  if (filter.kind === "kpi") {
    return kpiTests[filter.value](lot);
  }

  if (filter.kind === "recon") {
    return RECON_TESTS[filter.value](lot);
  }

  if (filter.kind === "age") {
    const band = AGE_BANDS.find((b) => b.key === filter.value);
    return band ? band.test(lot) : true;
  }

  if (filter.kind === "quality") {
    return lot.quality === filter.value;
  }

  return true;
}

/*
   Stops rather than a linear 0-365. The slider used to stop at 30
   days, which left 12 of 20 lots unreachable on the one tab meant
   to show ageing; a linear range to a year would put the useful end
   inside the first 8% of the track.
*/
const HORIZON_STOPS = [0, 7, 30, 90, 180, 365];

/* How far through its own shelf life a lot is, which is not the
   same question as how many days are left: 4 days remaining means
   something different on a 30-day product than on a 365-day one. */
function shelfUsed(lot) {
  const shelf = gradeBook[lot.grade].shelfDays;

  return Math.max(
    0,
    Math.min(100, ((shelf - lot.daysLeft) / shelf) * 100),
  );
}

const METER_STEPS = 22;

const reconciliation = [
  { key: "saleable", label: "Matching", lots: 142, qty: 1010.4 },
  { key: "review", label: "Quantity difference", lots: 38, qty: 168.2 },
  { key: "reject", label: "Missing / extra", lots: 23, qty: 106.0 },
];

/*
   Depth is faked by stacking copies of the ring behind the top
   face, each pushed one pixel further back in Z. The whole stage
   is tilted, so those copies read as the side wall of a solid
   disc rather than as a blur.
*/
/*
   A feed is only useful while it is current, so each one carries a
   charge that drains over the half-hour it is expected to refresh
   in. A number with a timestamp beside it makes you do that
   arithmetic; a draining bar does not.
*/
const FEED_WINDOW_MIN = 30;

function FeedBar({ feeds, now, compact, barRef }) {
  return (
    <section
      ref={barRef}
      className={`feed-bar ${compact ? "feed-bar-compact" : ""}`}
    >
      <div className="feed-live">
        <span className="status-dot"></span>

        <span className="feed-live-text">
          <b>LIVE INVENTORY</b>
          <em>Belagavi Works · finished goods</em>
        </span>
      </div>

      {feeds.map((feed) => {
        const mins = (now - feed.at) / 60000;

        const charge = Math.max(
          0,
          Math.min(1, 1 - mins / FEED_WINDOW_MIN),
        );

        return (
          <div
            key={feed.id}
            className={`feed-cell ${freshnessOf(feed.at, now)}`}
          >
            <p className="feed-cap">
              <i className="sync-pip"></i>
              {feed.label}
            </p>

            <strong>
              {feed.lots}
              <em>lots</em>
            </strong>

            <div className="feed-charge">
              <i style={{ "--c": `${charge * 100}%` }} />
            </div>

            <time
              className="feed-age"
              dateTime={feed.at.toISOString()}
              title={feed.at.toLocaleString()}
            >
              synced {relativeAge(feed.at, now)}
            </time>
          </div>
        );
      })}
    </section>
  );
}

/*
   Eleven states across a curve chart works only while the values
   stay within roughly an order of magnitude of each other. These
   are spread deliberately: at the earlier split, with sellable at
   58%, the last two states came out under 1.5px and vanished.
*/
const stockStates = [
  { label: "SELLABLE", value: 294.2 },
  { label: "BUFFER", value: 212.9 },
  { label: "PLANNED", value: 171.8 },
  { label: "FEED", value: 131.5 },
  { label: "REVIEW", value: 111.1 },
  { label: "REJECT", value: 83.1 },
  { label: "UNDER ANALYSIS", value: 76.3 },
  { label: "TRIAL", value: 64.5 },
  { label: "WET", value: 53.6 },
  { label: "UNDER APPROVAL", value: 44.1 },
  { label: "SPLIT", value: 41.5 },
];

/*
   A continuous ramp, not eleven categorical hues. Every curve is
   direct-labelled and sits in its own slot, so position and text
   carry the identity and the colour is free to be decorative —
   which is the only reason eleven of them is defensible.
*/
const CURVE_RAMP = [
  "#2fd39b", "#35c9b4", "#3bb8cc", "#45a3dd",
  "#5b8be6", "#7a72e4", "#9a5cd8", "#b84cc0",
  "#d0459f", "#e2497b", "#ee5a58",
];

const CURVE_W = 880;
const CURVE_BASE = 200;
const CURVE_PEAK = 150;
const CURVE_SIGMA = 26;

/*
   A real Gaussian sampled at 96 points rather than a Bezier guess,
   so the shoulders fall away at the right rate and every curve is
   the same shape at a different height.
*/
function bellPath(cx, peak) {
  /*
     Only the span the curve actually occupies. Drawing every bell
     across the full width gave eleven stacked full-width shapes,
     each with its own filter region and its own gradient box —
     the tall ones ended up behind a pile of near-flat siblings.
  */
  const reach = CURVE_SIGMA * 3.6;
  const x0 = Math.max(0, cx - reach);
  const x1 = Math.min(CURVE_W, cx + reach);

  const steps = 72;
  const pts = [];

  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + (i / steps) * (x1 - x0);
    const y =
      CURVE_BASE -
      peak *
        Math.exp(
          -((x - cx) ** 2) / (2 * CURVE_SIGMA * CURVE_SIGMA),
        );

    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return `M ${x0.toFixed(1)},${CURVE_BASE} L ${
    pts.join(" L ")
  } L ${x1.toFixed(1)},${CURVE_BASE} Z`;
}

function StockDonut() {
  const [hovered, setHovered] = useState(null);

  const total = stockStates.reduce((s, d) => s + d.value, 0);
  const peakValue = stockStates.reduce(
    (m, d) => Math.max(m, d.value),
    1,
  );

  const gap = CURVE_W / (stockStates.length + 1);

  const curves = stockStates.map((d, i) => ({
    ...d,
    key: d.label,
    colour: CURVE_RAMP[i],
    frac: d.value / total,
    cx: gap * (i + 1),
    peak: (d.value / peakValue) * CURVE_PEAK,
  }));

  // Tallest first, so shorter curves sit in front rather than behind.
  const drawOrder = [...curves].sort((a, b) => b.peak - a.peak);

  const focus = curves.find((c) => c.key === hovered);

  return (
    <div className="panel viz">
      <div className="panel-header">
        <div>
          <p className="panel-label">INVENTORY STATUS</p>
          <h2>Stock composition</h2>
        </div>

        <span className="panel-side">
          {focus
            ? `${focus.label} · ${focus.value.toFixed(1)} MT · ${
                (focus.frac * 100).toFixed(1)
              }%`
            : `${total.toFixed(1)} MT across ${
                curves.length
              } states`}
        </span>
      </div>

      {/*
         A nearest-curve layer rather than per-path hit testing:
         the pointer only has to be closest to a peak, not on the
         few pixels the curve actually paints. Tails are one pixel
         tall and would be impossible to hit.
      */}
      <div
        className="curve-chart"
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();

          if (!box.width) {
            return;
          }

          const vx =
            ((e.clientX - box.left) / box.width) * CURVE_W;

          const near = curves.reduce(
            (best, c) =>
              Math.abs(c.cx - vx) < Math.abs(best.cx - vx)
                ? c
                : best,
            curves[0],
          );

          setHovered(near.key);
        }}
        onPointerLeave={() => setHovered(null)}
      >
        <svg
          viewBox={`0 0 ${CURVE_W} 216`}
          role="img"
          aria-label={curves
            .map(
              (c) =>
                `${c.label} ${(c.frac * 100).toFixed(1)}%`,
            )
            .join(", ")}
        >
          <defs>
            {curves.map((c) => (
              <linearGradient
                key={c.key}
                id={`bell-${c.cx.toFixed(0)}`}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1={CURVE_BASE - c.peak}
                x2="0"
                y2={CURVE_BASE}
              >
                <stop
                  offset="0%"
                  stopColor={c.colour}
                  stopOpacity="1"
                />
                <stop
                  offset="62%"
                  stopColor={c.colour}
                  stopOpacity="0.78"
                />
                <stop
                  offset="100%"
                  stopColor={c.colour}
                  stopOpacity="0.06"
                />
              </linearGradient>
            ))}
          </defs>

          {drawOrder.map((c) => (
            <path
              key={c.key}
              className={`bell ${
                hovered === c.key ? "bell-on" : ""
              } ${hovered && hovered !== c.key ? "bell-dim" : ""}`}
              style={{ "--c": c.colour }}
              d={bellPath(c.cx, c.peak)}
              fill={`url(#bell-${c.cx.toFixed(0)})`}
              pointerEvents="none"
            />
          ))}

          {curves.map((c) => (
            <text
              key={c.key}
              className={`bell-value ${
                hovered === c.key ? "value-on" : ""
              } ${hovered && hovered !== c.key ? "value-dim" : ""}`}
              x={c.cx}
              y={CURVE_BASE - c.peak - 11}
              textAnchor="middle"
            >
              {(c.frac * 100).toFixed(1)}%
            </text>
          ))}

          {focus ? (
            <text
              className="bell-mt"
              x={focus.cx}
              y={CURVE_BASE - focus.peak - 32}
              textAnchor="middle"
              pointerEvents="none"
            >
              {focus.value.toFixed(1)} MT
            </text>
          ) : null}

          {focus ? (
            <g className="cross" pointerEvents="none">
              <line
                className="cross-line"
                style={{
                  transformOrigin: `${focus.cx}px ${CURVE_BASE}px`,
                }}
                x1={focus.cx}
                y1={CURVE_BASE - focus.peak - 4}
                x2={focus.cx}
                y2={CURVE_BASE}
              />

              {/* Ring in the surface colour so it reads over the fill */}
              <circle
                className="cross-halo"
                cx={focus.cx}
                cy={CURVE_BASE - focus.peak}
                r="9"
                fill={focus.colour}
              />

              <circle
                className="cross-dot"
                cx={focus.cx}
                cy={CURVE_BASE - focus.peak}
                r="4.5"
                fill={focus.colour}
              />
            </g>
          ) : null}
        </svg>

      </div>

      {/*
         Names sit in a legend rather than under the axis. Angled
         labels on a 73px pitch read as offset from the curve they
         belong to, and UNDER ANALYSIS is wider than its slot.
      */}
      <div className="curve-legend">
        {curves.map((c) => (
          <button
            type="button"
            key={`n-${c.key}`}
            className={`curve-key ${
              hovered === c.key ? "curve-key-on" : ""
            }`}
            onMouseEnter={() => setHovered(c.key)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(c.key)}
            onBlur={() => setHovered(null)}
          >
            <i style={{ background: c.colour }} />
            <b>{c.label}</b>
            <span>{c.value.toFixed(1)} MT</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/*
   Part-to-whole, so one rail split three ways rather than three
   separate tracks — the reader's question is "how much of the
   book reconciles", which a shared baseline answers and parallel
   bars do not.
*/
/*
   The register only ever said "-3.17 MT". This puts both sides on
   the row, so the reader can see which system is short without
   opening the lot.
*/
/*
   Quoted only where it has to be, so the file stays readable if
   someone opens it in a text editor rather than Excel.
*/
function csvCell(value) {
  const text = String(value);

  const risky =
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\r") ||
    text.includes("\n");

  return risky
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

/*
   ISO rather than the page's "22 Aug 25". A spreadsheet sorts this
   correctly, and it cannot be misread as month-first by whoever
   opens the file.
*/
function stamp(date, withTime) {
  const pad = (n) => String(n).padStart(2, "0");

  const day = `${date.getFullYear()}-${
    pad(date.getMonth() + 1)
  }-${pad(date.getDate())}`;

  return withTime
    ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    : day;
}

function downloadCsv(lines, filename) {
  const csv = lines
    .map((line) => line.map(csvCell).join(","))
    .join("\r\n");

  /*
     The BOM is what makes Excel read this as UTF-8 instead of the
     machine's local codepage. Without it the ≤ in an issue name
     arrives as mojibake on a lot of Windows installs.
  */
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function exportCsv(rows) {
  const lines = [
    [
      "Lot",
      "Grade",
      "Manual MT",
      "PL2P MT",
      "Difference MT",
      "Issue",
    ],
    ...rows.map((r) => [
      r.id,
      r.grade,
      // Blank, not 0.00 - the manual register has never seen it
      r.manual === 0 ? "" : r.manual.toFixed(2),
      r.pl2p.toFixed(2),
      r.diff.toFixed(2),
      r.issue,
    ]),
  ];

  downloadCsv(
    lines,
    `fg-exceptions-${
      new Date().toISOString().slice(0, 10)
    }.csv`,
  );
}

/*
   A single lot cannot be one flat row: the readings and the
   movement trail are both lists, and a history of varying length
   would either repeat the record on every line or need its own
   file. Three labelled blocks instead, which a spreadsheet reads
   fine and a person can actually follow.
*/
function exportLotRecord(lot) {
  const stock = reconcile(lot);
  const moves = buildMovements(lot);

  const lines = [
    ["Lot record"],
    ["Field", "Value"],
    ["Lot", lot.id],
    ["Grade", lot.grade],
    ["Grade name", gradeBook[lot.grade].name],
    ["Quantity MT", lot.qty.toFixed(2)],
    [
      "Manual register MT",
      stock.manual === 0 ? "" : stock.manual.toFixed(2),
    ],
    ["PL2P production MT", stock.pl2p.toFixed(2)],
    ["Difference MT", stock.diff.toFixed(2)],
    [
      "Reconciliation",
      lot.check === "Matched"
        ? "Matched"
        : lot.check === "PL2P only"
          ? "Not in manual register"
          : "Quantity difference",
    ],
    ["Quality", lot.quality],
    ["Produced", stamp(lot.produced, true)],
    ["Expires", stamp(lot.expires, false)],
    ["Shelf life days", gradeBook[lot.grade].shelfDays],
    ["Days left", lot.daysLeft],
    ["Age status", ageLabel(lot.daysLeft)],
    ["Location", lot.location],
    ["Entered by", operators[lotHash(lot.id) % operators.length]],

    [],
    ["Quality readings"],
    ["Reading", "Value", "Unit", "In spec"],
    ...buildQuality(lot).map((r) => [
      r.key,
      r.value,
      r.unit,
      r.ok ? "Yes" : "No",
    ]),

    [],
    ["Movement trail"],
    ["Date", "Location", "Note"],
    // buildMovements returns newest first, so index 0 is where it is now
    ...moves.map((m, i) => [
      stamp(m.at, true),
      m.place,
      i === 0 ? "Current location" : "",
    ]),
  ];

  downloadCsv(lines, `fg-lot-${lot.id}.csv`);
}

/*
   execCommand is deprecated, but it is the only thing that works
   outside a secure context, and it is the reason this still copies
   when the dev server is opened over a LAN address.
*/
function legacyCopy(text) {
  try {
    const field = document.createElement("textarea");

    field.value = text;
    field.setAttribute("readonly", "");

    /* Off-screen rather than hidden: a display:none field cannot
       be selected, so the copy would silently do nothing. */
    field.style.position = "fixed";
    field.style.top = "-1000px";
    field.style.opacity = "0";

    document.body.appendChild(field);
    field.select();

    const ok = document.execCommand("copy");

    document.body.removeChild(field);

    return ok;
  } catch {
    return false;
  }
}

/*
   navigator.clipboard exists only in a secure context — HTTPS or
   localhost. Served over a plain LAN address it is undefined, so
   this falls back rather than resolving false and looking broken.
*/
function copyLot(id) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(id).then(
      () => true,
      () => legacyCopy(id),
    );
  }

  return Promise.resolve(legacyCopy(id));
}

/*
   Counts up once, the first time the figure scrolls into view.
   Tied to the observer rather than to mount: these tables sit far
   enough down the page that a mount-triggered count would be over
   before anyone had scrolled to them.
*/
function Tally({ value, dp = 0 }) {
  const [shown, setShown] = useState(0);
  const node = useRef(null);

  useEffect(() => {
    const el = node.current;

    if (
      !el ||
      typeof IntersectionObserver !== "function" ||
      window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches
    ) {
      setShown(value);
      return undefined;
    }

    let frame = 0;
    let settled = 0;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) {
          return;
        }

        // Once only: this is an arrival, not a loop
        io.disconnect();

        let from = 0;

        const step = (now) => {
          /*
             The first frame's own timestamp is the origin. Taking
             it from performance.now() instead mixes two clocks
             whose time origins need not agree, and the elapsed
             time can come out negative.
          */
          if (!from) {
            from = now;
          }

          const t = Math.min(1, (now - from) / 700);

          // Ease-out cubic, so it decelerates into the real figure
          setShown(value * (1 - (1 - t) ** 3));

          if (t < 1) {
            frame = requestAnimationFrame(step);
          }
        };

        frame = requestAnimationFrame(step);

        /*
           A backstop, because rAF is not guaranteed to keep firing
           — browsers pause it in a background tab. Without this a
           table counted halfway and then hidden would be left
           showing a number that is simply wrong. Cancelling the
           frame matters: otherwise a still-running loop overwrites
           the figure this just settled.
        */
        settled = setTimeout(() => {
          cancelAnimationFrame(frame);
          setShown(value);
        }, 800);
      },
      { threshold: 0.25 },
    );

    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(settled);
    };
  }, [value]);

  return <span ref={node}>{shown.toFixed(dp)}</span>;
}

const GRADE_HEADS = [
  "GRADE",
  "DESCRIPTION",
  "LOTS",
  "TOTAL STOCK",
  "AT RISK ≤ 7D",
];

/*
   Its own component so the crosshair and the open row are local
   state. Left in Dashboard, every cell hover would re-render the
   whole page to move a highlight.
*/
function GradeTable({ rows, onOpen }) {
  const [open, setOpen] = useState("");

  return (
    <div className="grade-grid">
      <div className="grade-row grade-head">
        {GRADE_HEADS.map((label, i) => (
          <span
            key={label}
            className={i >= 2 ? "head-right" : ""}
          >
            {label}
          </span>
        ))}
      </div>

      {rows.map((g) => (
        <React.Fragment key={g.code}>
          <button
            type="button"
            className={`grade-row ${
              open === g.code ? "row-open" : ""
            }`}
            aria-expanded={open === g.code}
            onClick={() =>
              setOpen((was) => (was === g.code ? "" : g.code))
            }
          >
            <span className="grade-code">
              {g.code}

              <i className="row-caret" aria-hidden="true">
                <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 1.5 5 5 9 1.5" />
                </svg>
              </i>
            </span>

            <span className="grade-name">{g.name}</span>

            <span className="grade-fig">
              <Tally value={g.lots} />
            </span>

            <span className="grade-fig">
              <Tally value={g.qty} dp={2} />
              <em>MT</em>
            </span>

            <span className="grade-fig">
              <i
                className={`pill ${
                  g.atRisk ? "pill-bad" : "pill-ok"
                }`}
              >
                {g.atRisk}
              </i>
            </span>
          </button>

          {open === g.code ? (
            <div className="grade-detail">
              <dl>
                <div>
                  <dt>Oldest lot</dt>
                  <dd>
                    {g.oldest.id}
                    <em>{ageLabel(g.oldest.daysLeft)}</em>
                  </dd>
                </div>

                <div>
                  <dt>At risk</dt>
                  <dd>
                    {g.atRisk} {g.atRisk === 1 ? "lot" : "lots"}
                    <em>{g.atRiskQty.toFixed(2)} MT</em>
                  </dd>
                </div>

                <div>
                  <dt>Held in</dt>
                  <dd>{g.bays.join(", ")}</dd>
                </div>
              </dl>

              <button
                type="button"
                className="detail-open"
                onClick={() => onOpen(g.code)}
              >
                Open {g.code} register →
              </button>
            </div>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

/*
   Brings the register into view when a KPI or a reconciliation ring
   arms it. The offset clears the collapsed header, which is fixed
   once the page has scrolled and would otherwise sit over the
   panel's own heading.
*/
function revealRegister(node) {
  if (!node) {
    return;
  }

  const box = node.getBoundingClientRect();

  window.scrollTo({
    top: Math.max(0, window.scrollY + box.top - 92),
    behavior: window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? "auto"
      : "smooth",
  });
}

/*
   A panel head with an armed-filter chip, shared by the three
   overview tables so each says what is narrowing it the same way.
   A wrapper only: it adds no styling of its own.
*/
function OverviewPanel({
  label,
  title,
  side,
  filter,
  onClear,
  panelRef,
  children,
}) {
  return (
    <section className="exception-panel" ref={panelRef}>
      <div className="panel-header">
        <div>
          <p className="panel-label">{label}</p>
          <h2>{title}</h2>
        </div>

        <div className="panel-actions">
          {filter ? (
            <button
              type="button"
              className="filter-chip"
              onClick={onClear}
            >
              {filter.label}
              <i>clear</i>
            </button>
          ) : (
            <span className="panel-side">{side}</span>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}

/*
   Module A's own register: every lot in expiry order, for one grade
   or all of them. The horizon panel above answers "how much is
   about to go"; this answers "which lots, and where are they".
*/
function AgeingRegister({ lots, onOpen }) {
  const [grade, setGrade] = useState("");

  const grades = [...new Set(lots.map((l) => l.grade))].sort();

  // Soonest to expire first, which is the order you would work it
  const shown = lots
    .filter((l) => !grade || l.grade === grade)
    .slice()
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const qty = shown.reduce((s, l) => s + l.qty, 0);

  return (
    <section className="exception-panel">
      <div className="panel-header">
        <div>
          <p className="panel-label">AGE ANALYSIS</p>
          <h2>Ageing register</h2>
        </div>

        <span className="panel-side">
          {shown.length} lots · {qty.toFixed(2)} MT
        </span>
      </div>

      <div className="lot-finder">
        <div className="finder-row">
          <div className="finder-field">
            <label htmlFor="age-grade">GRADE</label>

            <select
              id="age-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="">
                All grades · {lots.length} lots
              </option>

              {grades.map((g) => (
                <option key={g} value={g}>
                  {g} ·{" "}
                  {lots.filter((l) => l.grade === g).length} lots
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="exception-scroll">
        <div className="ov-table ov-ageing">
          <div className="ov-row ov-head">
            <span>LOT</span>
            <span>GRADE</span>
            <span className="head-right">QUANTITY</span>
            <span>PRODUCED</span>
            <span>EXPIRES</span>
            <span>AGE</span>
            <span>SHELF LIFE USED</span>
            <span>LOCATION</span>
          </div>

          {shown.map((l) => {
            const used = shelfUsed(l);

            return (
              <button
                type="button"
                key={l.id}
                className="ov-row"
                onClick={() => onOpen(l)}
                title="Open the full record for this lot"
              >
                <span className="ov-key">{l.id}</span>

                <span className="ov-note">{l.grade}</span>

                <span className="ov-fig">
                  {l.qty.toFixed(2)}
                  <em>MT</em>
                </span>

                <span className="ov-note">
                  {stampFmt.format(l.produced)}
                </span>

                <span className="ov-note">
                  {stampFmt.format(l.expires)}
                </span>

                <span
                  className={`ov-note ${expiryTone(l.daysLeft)}`}
                >
                  {ageLabel(l.daysLeft)}
                </span>

                {/* Proportion of its own shelf life, so grades with
                    different shelf lives stay comparable */}
                <span className="age-used">
                  <span
                    className={`age-track tone-${expiryTone(
                      l.daysLeft,
                    )}`}
                  >
                    <i style={{ width: `${used}%` }} />
                  </span>

                  <span className="age-pct">
                    {used.toFixed(0)}%
                  </span>
                </span>

                <span className="ov-note">{l.location}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/*
   The register the brief actually asks for: every lot with every
   field it lists, at lot level rather than grade level. This is what
   the KPIs, the reconciliation rings and the two tables above all
   drill into — one table, narrowed by whatever was clicked last.
*/
function LotRegister({ lots, filter, onClear, onOpen, panelRef }) {
  /*
     Ageing and quality live here as dropdowns rather than as two
     more tables. They compose with each other and with whatever a
     KPI or a reconciliation ring armed, so the register can answer
     "expired AND rejected" instead of one thing at a time.
  */
  const [band, setBand] = useState("");
  const [status, setStatus] = useState("");

  const statuses = [...new Set(lots.map((l) => l.quality))].sort();

  const shown = lots
    .filter((l) => {
      const pick = AGE_BANDS.find((x) => x.key === band);
      return pick ? pick.test(l) : true;
    })
    .filter((l) => !status || l.quality === status);

  const qty = shown.reduce((s, l) => s + l.qty, 0);

  /*
     One chip naming everything that is narrowing the table, and one
     clear that releases all of it. Two chips that each undo half of
     the filtering would be worse than none.
  */
  const armed = [
    filter?.label,
    AGE_BANDS.find((x) => x.key === band)?.label,
    status ? `Quality: ${status}` : null,
  ].filter(Boolean);

  return (
    <OverviewPanel
      panelRef={panelRef}
      label="LOT LEVEL"
      title="Lot register"
      side={`${shown.length} lots · ${qty.toFixed(2)} MT`}
      filter={
        armed.length ? { label: armed.join("  +  ") } : null
      }
      onClear={() => {
        setBand("");
        setStatus("");
        onClear();
      }}
    >
      {/* Same controls as the grade finder above, so the two read
          as one family rather than two ideas about filtering. */}
      <div className="lot-finder">
        <div className="finder-row">
          <div className="finder-field">
            <label htmlFor="reg-band">AGEING WINDOW</label>

            <select
              id="reg-band"
              value={band}
              onChange={(e) => setBand(e.target.value)}
            >
              <option value="">
                All windows · {lots.length} lots
              </option>

              {AGE_BANDS.map((x) => {
                const n = lots.filter(x.test).length;

                return (
                  <option
                    key={x.key}
                    value={x.key}
                    /* Nothing to show, so nothing to pick */
                    disabled={n === 0}
                  >
                    {x.label} · {n} lots
                  </option>
                );
              })}
            </select>
          </div>

          <div className="finder-field">
            <label htmlFor="reg-status">QUALITY STATUS</label>

            <select
              id="reg-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">
                All statuses · {lots.length} lots
              </option>

              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s} ·{" "}
                  {lots.filter((l) => l.quality === s).length} lots
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="exception-empty">
          No lots match this filter.
        </p>
      ) : (
        <div className="exception-scroll">
          <div className="ov-table ov-register">
            <div className="ov-row ov-head">
              <span>LOT</span>
              <span>GRADE</span>
              <span className="head-right">QUANTITY</span>
              <span>EXPIRES</span>
              <span>AGE</span>
              <span>LOCATION</span>
              <span>QUALITY</span>
              <span>RECONCILIATION</span>
            </div>

            {shown.map((l) => {
              const stock = reconcile(l);

              return (
                <button
                  type="button"
                  key={l.id}
                  className="ov-row"
                  onClick={() => onOpen(l)}
                  title="Open the full record for this lot"
                >
                  <span className="ov-key">{l.id}</span>

                  <span className="ov-note">{l.grade}</span>

                  <span className="ov-fig">
                    {l.qty.toFixed(2)}
                    <em>MT</em>
                  </span>

                  <span className="ov-note">
                    {stampFmt.format(l.expires)}
                  </span>

                  <span
                    className={`ov-note ${expiryTone(l.daysLeft)}`}
                  >
                    {ageLabel(l.daysLeft)}
                  </span>

                  <span className="ov-note">{l.location}</span>

                  <span className="ov-note">
                    <i
                      className={`pill ${
                        l.quality === "Accept"
                          ? "pill-ok"
                          : l.quality === "Reject"
                            ? "pill-bad"
                            : "pill-warn"
                      }`}
                    >
                      {l.quality}
                    </i>
                  </span>

                  <span className="ov-note">
                    {stock.diff === 0 ? (
                      "Matched"
                    ) : (
                      <b className="ex-off">
                        {stock.diff > 0 ? "+" : ""}
                        {stock.diff.toFixed(2)} MT
                      </b>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </OverviewPanel>
  );
}

function ExceptionTable({ rows, filterLabel, onClear, children }) {
  const [copied, setCopied] = useState(null);

  // The tag is a confirmation, not a state worth keeping
  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const id = setTimeout(() => setCopied(null), 1500);

    return () => clearTimeout(id);
  }, [copied]);

  /*
     Both feeds share one scale. Scaling each row to its own pair
     would make every gap look the same size, which is the opposite
     of the point.
  */
  const biggest = rows.reduce(
    (m, r) => Math.max(m, r.manual, r.pl2p),
    0,
  ) || 1;
  return (
    <section className="exception-panel">
      <div className="panel-header">
        <div>
          <p className="panel-label">RECONCILIATION</p>
          <h2>Exceptions</h2>
        </div>

        <div className="panel-actions">
          {filterLabel ? (
            <button
              type="button"
              className="filter-chip"
              onClick={onClear}
            >
              {filterLabel}
              <i>clear</i>
            </button>
          ) : null}

          {rows.length > 0 ? (
            <button
              type="button"
              className="export-btn"
              onClick={() => exportCsv(rows)}
              title="Download these rows as a CSV"
            >
              <svg
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7 1v8" />
                <path d="M4 6.5 7 9.5l3-3" />
                <path d="M1.5 10.5v2h11v-2" />
              </svg>
              Export CSV
            </button>
          ) : null}
        </div>
      </div>

      {children}

      {rows.length === 0 ? (
        <p className="exception-empty">
          No lots match this filter.
        </p>
      ) : (
        <div className="exception-scroll">
          <div className="exception-table">
            <div className="exception-row exception-head">
              {[
                "LOT",
                "GRADE",
                "MANUAL vs PL2P",
                "DIFFERENCE",
                "ISSUE",
              ].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            {rows.map((r) => (
              <div
                className={`exception-row ${
                  r.manual === 0 ? "ex-missing" : ""
                }`}
                key={r.id}
              >
                <button
                  type="button"
                  className={`ex-id ${
                    copied?.id === r.id
                      ? copied.ok
                        ? "ex-copied"
                        : "ex-copyfail"
                      : ""
                  }`}
                  onClick={() =>
                    copyLot(r.id).then((ok) =>
                      setCopied({ id: r.id, ok }),
                    )
                  }
                  title="Copy this lot number"
                >
                  {r.id}

                  <i aria-hidden="true">
                    {copied?.id === r.id
                      ? copied.ok
                        ? "copied"
                        : "failed"
                      : "copy"}
                  </i>
                </button>

                <span className="ex-grade">{r.grade}</span>

                {/*
                   Two bars on one scale: the gap between them is
                   the discrepancy, seen rather than worked out.
                */}
                <span className="ex-pair">
                  <span className="pair-line">
                    <b>M</b>

                    <span className="pair-track">
                      <i
                        style={{
                          "--w": `${
                            (r.manual / biggest) * 100
                          }%`,
                        }}
                      />
                    </span>

                    <span className="pair-num">
                      {r.manual === 0 ? (
                        <s>absent</s>
                      ) : (
                        r.manual.toFixed(2)
                      )}
                    </span>
                  </span>

                  <span className="pair-line pair-sys">
                    <b>P</b>

                    <span className="pair-track">
                      <i
                        style={{
                          "--w": `${
                            (r.pl2p / biggest) * 100
                          }%`,
                        }}
                      />
                    </span>

                    <span className="pair-num">
                      {r.pl2p.toFixed(2)}
                    </span>
                  </span>
                </span>

                <span
                  className={`ex-fig ${
                    r.diff === 0 ? "" : "ex-off"
                  }`}
                >
                  {r.diff > 0 ? "+" : ""}
                  <Tally value={r.diff} dp={2} />
                  <em>MT</em>
                </span>

                <span className="ex-issue">
                  <i
                    className={`pill ${
                      r.manual === 0 ? "pill-bad" : "pill-warn"
                    }`}
                  >
                    {r.issue}
                  </i>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/*
   One ring per category rather than one ring split three ways.
   Each arc is that category's share of the book, so the lengths
   are directly comparable — which is the whole point when 90.6%
   sits against 5.9% and 3.4%.
*/
/*
   One ring per category rather than one ring split three ways.
   Each arc is that category's share of the book, so the lengths
   are directly comparable — which is the whole point when the
   three shares sit this far apart.
*/
const RING_RADII = [78, 59, 40];
const RING_SWEEP = 0.8333;
const RING_WIDTH = 14;

function ReconciliationBars({ onPick }) {
  const [hovered, setHovered] = useState(null);

  const totalLots = reconciliation.reduce((s, r) => s + r.lots, 0);
  const totalQty = reconciliation.reduce((s, r) => s + r.qty, 0);

  const rings = reconciliation.map((r, i) => {
    const radius = RING_RADII[i];
    const circ = 2 * Math.PI * radius;
    const track = circ * RING_SWEEP;
    const frac = r.lots / totalLots;

    return {
      ...r,
      radius,
      circ,
      track,
      frac,
      len: Math.max(track * frac, 0.6),
    };
  });

  const focus = rings.find((r) => r.key === hovered);
  const headline = focus || rings[0];

  return (
    <div className="panel viz">
      <div className="panel-header">
        <div>
          <p className="panel-label">LIVE STOCK</p>
          <h2>Stock reconciliation</h2>
        </div>

        <span className="panel-side">
          {totalLots} lots · {totalQty.toFixed(1)} MT
        </span>
      </div>

      <div className="gauge-wrap">
        <div className="rings-figure">
          <svg
            viewBox="0 0 200 200"
            role="img"
            aria-label={rings
              .map(
                (r) =>
                  `${r.label} ${(r.frac * 100).toFixed(1)}%`,
              )
              .join(", ")}
          >
            <defs>
              {/*
                 stop-color takes a custom property, so the stops
                 swap with the theme like everything else.

                 The axis runs across the tangent points rather than
                 the bounding box. A circle only reaches its box
                 corners at two tangents, so the old corner-to-corner
                 axis left 29% of the ramp undrawn — both endpoints
                 among it. 0.68 rather than the exact 0.707, so the
                 arc holds the extremes briefly instead of touching
                 them at a single pixel.
              */}
              {rings.map((r) => (
                <linearGradient
                  key={r.key}
                  id={`ring-${r.key}`}
                  gradientUnits="userSpaceOnUse"
                  x1={100 - r.radius * 0.68}
                  y1={100 - r.radius * 0.68}
                  x2={100 + r.radius * 0.68}
                  y2={100 + r.radius * 0.68}
                >
                  <stop
                    offset="0%"
                    stopColor={`var(--viz-${r.key}-glint)`}
                  />
                  <stop
                    offset="20%"
                    stopColor={`var(--viz-${r.key}-lit)`}
                  />
                  <stop
                    offset="52%"
                    stopColor={`var(--viz-${r.key})`}
                  />
                  <stop
                    offset="84%"
                    stopColor={`var(--viz-${r.key}-deep)`}
                  />
                  <stop
                    offset="100%"
                    stopColor={`var(--viz-${r.key}-shade)`}
                  />
                </linearGradient>
              ))}
            </defs>

            {/* Rotated so the open sixth sits at the bottom */}
            <g transform="rotate(120 100 100)">
              {rings.map((r) => (
                <circle
                  key={`t-${r.key}`}
                  className="ring-track"
                  cx="100"
                  cy="100"
                  r={r.radius}
                  fill="none"
                  strokeWidth={RING_WIDTH}
                  strokeLinecap="round"
                  strokeDasharray={`${r.track} ${
                    r.circ - r.track
                  }`}
                />
              ))}

              {rings.map((r, i) => (
                <circle
                  key={r.key}
                  className={`ring-arc ring-${r.key} ${
                    hovered && hovered !== r.key ? "ring-dim" : ""
                  }`}
                  cx="100"
                  cy="100"
                  r={r.radius}
                  fill="none"
                  stroke={`url(#ring-${r.key})`}
                  strokeWidth={RING_WIDTH}
                  strokeLinecap="round"
                  style={{
                    "--len": r.len,
                    "--rest": r.circ - r.len,
                    "--i": i,
                  }}
                  onMouseEnter={() => setHovered(r.key)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() =>
                    onPick?.({
                      kind: "recon",
                      value: r.key,
                      label: r.label,
                    })
                  }
                />
              ))}
            </g>
          </svg>

          <div className="rings-centre">
            <strong className={`hero-${headline.key}`}>
              {(headline.frac * 100).toFixed(1)}
              <em>%</em>
            </strong>

            <span>
              {focus ? focus.label : "matches PL2P"}
            </span>
          </div>
        </div>

        <div className="rail-legend">
          {reconciliation.map((r) => (
            <button
              type="button"
              key={r.key}
              className={`legend-row ${
                hovered === r.key ? "legend-on" : ""
              }`}
              onMouseEnter={() => setHovered(r.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(r.key)}
              onBlur={() => setHovered(null)}
            >
              <i className={`legend-key key-${r.key}`} />

              <span className="legend-name">
                {r.label}
                <small>
                  {((r.lots / totalLots) * 100).toFixed(1)}% of lots
                </small>
              </span>

              <span className="legend-figs">
                {r.lots}
                <em>lots</em>
                <b>{r.qty.toFixed(1)} MT</b>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/*
   Coarse buckets — a glance, not a precise duration. Abbreviated
   units sidestep pluralising; the exact stamp is on the tooltip.
*/
function relativeAge(then, now) {
  const seconds = Math.max(
    0,
    Math.floor((now - then) / 1000),
  );

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  return `${Math.floor(hours / 24)} d ago`;
}

/*
   Reuses the dashboard's own alert language, so a feed that has
   gone quiet reads the same way a problem metric does.
*/
function freshnessOf(then, now) {
  const minutes = (now - then) / 60000;

  if (minutes < 5) {
    return "sync-fresh";
  }

  if (minutes < 30) {
    return "sync-aging";
  }

  return "sync-stale";
}

function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);

    return () => clearInterval(id);
  }, []);

  return now;
}

/*
   Sun and moon are the same circle. The moon is made by masking
   a second circle over it; sliding that circle away turns the
   crescent back into a full disc while the rays unfurl.
*/
function ThemeOrb() {
  return (
    <svg
      className="theme-orb"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <defs>
        {/*
             Explicit user space: the default objectBoundingBox
             would size the mask region to the core circle's own
             box and clip the bite before it reaches the edge.
          */}
        <mask
          id="theme-orb-mask"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect
            x="0"
            y="0"
            width="24"
            height="24"
            fill="#ffffff"
          />

          <circle
            className="orb-bite"
            cx="17"
            cy="7"
            r="6"
            fill="#000000"
          />
        </mask>
      </defs>

      <circle
        className="orb-core"
        cx="12"
        cy="12"
        r="6"
        mask="url(#theme-orb-mask)"
      />

      <g
        className="orb-rays"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      >
        <line x1="12" y1="1.4" x2="12" y2="3.4" />
        <line x1="12" y1="20.6" x2="12" y2="22.6" />
        <line x1="1.4" y1="12" x2="3.4" y2="12" />
        <line x1="20.6" y1="12" x2="22.6" y2="12" />
        <line x1="4.6" y1="4.6" x2="6" y2="6" />
        <line x1="18" y1="18" x2="19.4" y2="19.4" />
        <line x1="19.4" y1="4.6" x2="18" y2="6" />
        <line x1="6" y1="18" x2="4.6" y2="19.4" />
      </g>
    </svg>
  );
}

const flipAnchors = {
  logo: "left",
  nav: "center",
  right: "right",
};

const flipOrigins = {
  left: "top left",
  center: "top center",
  right: "top right",
};

function Header({
  activeTab,
  setActiveTab,
  darkMode,
  setDarkMode,
  onBackHome,
  onSignOut,
  operator,
}) {
  const [scrolled, setScrolled] = useState(false);

  const navRef = useRef(null);
  const itemRefs = useRef(new Map());
  const lastLeft = useRef(0);

  /*
     Each piece is anchored to the edge that actually stays put
     across the collapse. The right cluster loses the works lockup
     and so changes width dramatically — anchoring it left would
     make it appear to fly in from mid-header, when what really
     happens is its right edge barely moves.
  */
  const flipNodes = useRef({});
  const preRects = useRef(null);
  const wasScrolled = useRef(false);

  const [bar, setBar] = useState({
    top: 0,
    height: 3,
    left: 0,
    right: 0,
    toRight: true,
  });

  const [barReady, setBarReady] = useState(false);

  /*
     The indicator is measured off the live DOM rather than
     hard-coded, so it follows the nav through the collapse
     (15px/34px gap docked, 14px/32px floating) and through
     any resize without a second set of numbers to maintain.
  */
  const measureBar = useCallback(() => {
    const nav = navRef.current;
    const item = itemRefs.current.get(activeTab);

    if (!nav || !item) {
      return;
    }

    const n = nav.getBoundingClientRect();
    const b = item.getBoundingClientRect();

    /*
       Below 950px the nav is a horizontal scroller. An absolutely
       positioned child scrolls with its content, so the offset has
       to be taken from the scrolled origin, not the visible edge,
       or the bar drifts by exactly scrollLeft.
    */
    const originLeft = b.left - n.left + nav.scrollLeft;

    // The floating pill needs breathing room the underline does not.
    const pad = scrolled ? 14 : 0;

    const left = originLeft - pad;

    setBar({
      left,
      right: nav.clientWidth - originLeft - b.width - pad,

      // Underline while docked, pill once floating.
      top: scrolled
        ? b.top - n.top - 7
        : b.bottom - n.top + 9,

      height: scrolled
        ? b.height + 14
        : 3,

      toRight: left >= lastLeft.current,
    });

    lastLeft.current = left;
  }, [activeTab, scrolled]);

  useLayoutEffect(() => {
    measureBar();
  }, [measureBar]);

  /*
     FLIP. The elements switch to position: fixed, which cannot be
     transitioned, so they are measured either side of the switch
     and transformed back to where they were — then released, which
     the browser can animate.

     Declared after the indicator effect so measureBar still reads
     untransformed geometry.
  */
  useLayoutEffect(() => {
    const pre = preRects.current;

    if (!pre) {
      return undefined;
    }

    preRects.current = null;

    const moves = [];

    for (const [key, node] of Object.entries(flipNodes.current)) {
      if (!node || !pre[key]) {
        continue;
      }

      const from = pre[key];
      const to = node.getBoundingClientRect();

      if (!to.width || !from.width) {
        continue;
      }

      const anchor = flipAnchors[key];

      let dx;

      if (anchor === "right") {
        dx = from.right - to.right;
      } else if (anchor === "center") {
        dx =
          (from.left + from.width / 2) -
          (to.left + to.width / 2);
      } else {
        dx = from.left - to.left;
      }

      const dy = from.top - to.top;

      // Only the logo is an image; scaling text would blur it.
      const scale = key === "logo" ? from.width / to.width : 1;

      if (!dx && !dy && scale === 1) {
        continue;
      }

      node.style.transition = "none";
      node.style.transformOrigin = flipOrigins[anchor];
      node.style.transform =
        scale === 1
          ? `translate(${dx}px, ${dy}px)`
          : `translate(${dx}px, ${dy}px) scale(${scale})`;

      moves.push(node);
    }

    if (!moves.length) {
      return undefined;
    }

    // Flush the inverted position before releasing it.
    void moves[0].offsetWidth;

    const id = requestAnimationFrame(() => {
      for (const node of moves) {
        node.style.transition =
          "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)";
        node.style.transform = "";
      }
    });

    return () => cancelAnimationFrame(id);
  }, [scrolled]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setBarReady(true));

    window.addEventListener("resize", measureBar);

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", measureBar);
    };
  }, [measureBar]);

  useEffect(() => {
    const handleScroll = () => {
      const next = window.scrollY > 40;

      if (next === wasScrolled.current) {
        return;
      }

      // Capture geometry before React swaps the class.
      const snapshot = {};

      for (const [key, node] of Object.entries(flipNodes.current)) {
        if (node) {
          snapshot[key] = node.getBoundingClientRect();
        }
      }

      preRects.current = snapshot;
      wasScrolled.current = next;

      setScrolled(next);
    };

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <header
      className={`dashboard-header ${
        scrolled ? "header-scrolled" : ""
      }`}
    >
      <div className="header-inner">

        {/* ABG LOGO — doubles as the back-to-home control */}
        <button
          type="button"
          className="abg-logo"
          ref={(node) => {
            flipNodes.current.logo = node;
          }}
          onClick={onBackHome}
          aria-label="Back to the sign-in screen"
          title="Back to the sign-in screen"
        >
          <img
            src="/aditya-birla-group.png"
            alt="Aditya Birla Group"
          />

          {/*
             Standing cue rather than hover-only: a clickable logo
             nobody hovers is a clickable logo nobody finds.
          */}
          <span className="abg-logo-hint" aria-hidden="true">
            <svg
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7.5 2.5 4 6l3.5 3.5" />
            </svg>
            HOME
          </span>
        </button>

        {/* NAVIGATION */}
        <nav
          className="dashboard-nav"
          ref={(node) => {
            navRef.current = node;
            flipNodes.current.nav = node;
          }}
        >

          {/*
             One travelling indicator, first in the DOM so the
             labels paint over it. Its two edges move on
             staggered delays, so the trailing edge lags and the
             bar physically stretches across the gap before
             settling on the new tab.
          */}
          <span
            aria-hidden="true"
            className={`nav-indicator ${
              barReady ? "nav-indicator-ready" : ""
            }`}
            style={{
              "--bar-left": `${bar.left}px`,
              "--bar-right": `${bar.right}px`,
              "--bar-top": `${bar.top}px`,
              "--bar-height": `${bar.height}px`,
              "--bar-lag-left": bar.toRight ? "90ms" : "0ms",
              "--bar-lag-right": bar.toRight ? "0ms" : "90ms",
            }}
          />

          {navItems.map((item) => (
            <button
              key={item}
              type="button"
              ref={(node) => {
                if (node) {
                  itemRefs.current.set(item, node);
                } else {
                  itemRefs.current.delete(item);
                }
              }}
              className={`nav-item ${
                activeTab === item ? "active" : ""
              }`}
              onClick={() => setActiveTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        {/* NORMAL HEADER RIGHT SIDE */}
        <div
          className="header-right"
          ref={(node) => {
            flipNodes.current.right = node;
          }}
        >

          {/* Dead text replaced by the plant's live state */}
          <span className="works-label">
            BELAGAVI WORKS
          </span>

          {/*
             One shell around both controls: a lone circle beside a
             long pill read as two unrelated shapes crowding the
             corner. Segments of a single unit read as intended.
          */}
          <div className="header-controls">

          <button
            type="button"
            className="theme-toggle"
            onClick={() => setDarkMode((current) => !current)}
            aria-label={
              darkMode
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            title={
              darkMode
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
          >
            <ThemeOrb />
          </button>

          <button
            type="button"
            className="signout-button"
            onClick={onSignOut}
            aria-label={`Sign out${
              operator ? ` (${operator})` : ""
            }`}
            title={`Sign out${
              operator ? ` · ${operator}` : ""
            }`}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6.2 13.5H3.4a1.4 1.4 0 0 1-1.4-1.4V3.9a1.4 1.4 0 0 1 1.4-1.4h2.8" />
              <path d="M10.6 11 13.9 8l-3.3-3" />
              <path d="M13.9 8H6.2" />
            </svg>

            <span className="signout-label">
              SIGN OUT
            </span>
          </button>

          </div>

        </div>

      </div>
    </header>
  );
}

/*
   Bars are sized against the largest value in their own set, so a
   widget stays readable whatever the absolute numbers are.
*/
function RecordBlock({ index, label, note, children }) {
  return (
    <div className="record-block" style={{ "--i": index }}>
      <div className="record-side">
        <p className="record-label">{label}</p>
        {note ? <p className="record-note">{note}</p> : null}
      </div>

      <div className="record-body">{children}</div>
    </div>
  );
}

function LotRecord({ lot, onBack }) {
  const shelf = gradeBook[lot.grade].shelfDays;

  const used = Math.min(
    100,
    Math.max(0, ((shelf - lot.daysLeft) / shelf) * 100),
  );

  const stock = reconcile(lot);
  const movements = buildMovements(lot);
  const quality = buildQuality(lot);

  const who = operators[lotHash(lot.id) % operators.length];

  const tone = expiryTone(lot.daysLeft);

  return (
    <div className="lot-record" key={lot.id}>
      <div className="record-bar">
        <button
          type="button"
          className="record-back"
          onClick={onBack}
        >
          ← All {lot.grade} lots
        </button>

        <button
          type="button"
          className="export-btn"
          onClick={() => exportLotRecord(lot)}
          title="Download this lot's record, readings and movement trail"
        >
          <svg
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 1v8" />
            <path d="M4 6.5 7 9.5l3-3" />
            <path d="M1.5 10.5v2h11v-2" />
          </svg>
          Export record
        </button>
      </div>

      <header className="record-head" style={{ "--i": 0 }}>
        <div>
          <p className="record-kicker">LOT RECORD</p>

          <h2 className="record-id">{lot.id}</h2>

          <p className="record-grade">
            {lot.grade} · {gradeBook[lot.grade].name}
          </p>
        </div>

        <div className="record-figure">
          <div>
            <p className="record-cap">QUANTITY IN STOCK</p>
            <strong>{lot.qty.toFixed(2)}</strong>
            <p className="record-cap">metric tonnes</p>
          </div>

          <div className="record-tags">
            <i className={`quality-tag q-${lot.quality.toLowerCase()}`}>
              {lot.quality}
            </i>

            <i
              className={`quality-tag ${
                lot.check === "Matched" ? "q-matched" : "q-flag"
              }`}
            >
              {lot.check}
            </i>
          </div>
        </div>
      </header>

      <RecordBlock
        index={1}
        label="AGE"
        note={`${shelf}-day shelf life · LIFO dispatch`}
      >
        <div className="record-grid">
          <div>
            <p className="record-cap">PRODUCED</p>
            <p className="record-value">
              {stampFmt.format(lot.produced)}
            </p>
          </div>

          <div>
            <p className="record-cap">EXPIRES</p>
            <p className="record-value">
              {dateFmt.format(lot.expires)}
            </p>
          </div>

          <div>
            <p className="record-cap">AGE LEFT</p>
            <p className={`record-value tone-${tone}`}>
              {ageLabel(lot.daysLeft)}
            </p>
          </div>

          <div>
            <p className="record-cap">STATUS</p>
            <p className={`record-value tone-${tone}`}>
              {lot.daysLeft < 0 ? "Expired" : "In date"}
            </p>
          </div>
        </div>

        <div className="shelf-track">
          <i
            className={`shelf-fill shelf-${tone}`}
            style={{ "--pct": `${used}%` }}
          />
        </div>

        <div className="shelf-scale">
          <span>{dateFmt.format(lot.produced)}</span>
          <span>{Math.round(used)}% of shelf life used</span>
          <span>{dateFmt.format(lot.expires)}</span>
        </div>
      </RecordBlock>

      <RecordBlock
        index={2}
        label="LIVE STOCK"
        note="Manual register against PL2P"
      >
        <div className="record-grid record-split">
          <div>
            <p className="record-cap">MANUAL REGISTER</p>
            <p className="record-big">
              {stock.manual.toFixed(2)} <em>MT</em>
            </p>
            <p className="record-foot">Entered by {who}</p>
          </div>

          <div>
            <p className="record-cap">PL2P PRODUCTION</p>
            <p className="record-big">
              {stock.pl2p.toFixed(2)} <em>MT</em>
            </p>
            <p className="record-foot">Booked at production</p>
          </div>

          <div>
            <p className="record-cap">DIFFERENCE</p>
            <p
              className={`record-big ${
                stock.diff === 0 ? "" : "tone-expired"
              }`}
            >
              {stock.diff.toFixed(2)} <em>MT</em>
            </p>
            <p className="record-foot">{lot.check}</p>
          </div>
        </div>

        <p className="record-verdict">
          {stock.diff === 0
            ? "Both systems agree on this lot. No action needed."
            : `The two systems disagree by ${
                Math.abs(stock.diff).toFixed(2)
              } MT. This lot needs reconciliation before dispatch.`}
        </p>
      </RecordBlock>

      <RecordBlock
        index={3}
        label="LOCATION"
        note="From the PPC movement sheet"
      >
        <p className="record-place">
          <strong>{lot.location}</strong>
          <span>since {stampFmt.format(movements[0].at)}</span>
        </p>

        <div className="move-list">
          {movements.map((move, i) => (
            <div
              className="move-row"
              key={move.place + move.at.toISOString()}
              style={{ "--m": i }}
            >
              <i className={i === 0 ? "move-pip move-now" : "move-pip"} />

              <span className="move-at">
                {stampFmt.format(move.at)}
              </span>

              <span className="move-place">{move.place}</span>

              <span className="move-note">
                {i === 0
                  ? "Current location"
                  : `Moved out to ${
                      movements[i - 1].place
                    } · logged by ${who}`}
              </span>
            </div>
          ))}
        </div>
      </RecordBlock>

      <RecordBlock
        index={4}
        label="QUALITY"
        note="LIMS results against spec"
      >
        <div className="spec-grid">
          {quality.map((row) => (
            <div className="spec-row" key={row.key}>
              <div className="spec-head">
                <span className="spec-name">{row.key}</span>

                <span className="spec-value">
                  {row.value}
                  <em>{row.unit}</em>
                </span>
              </div>

              <div className="spec-bar">
                {/* The in-spec window, inset inside the wider range */}
                <i className="spec-band" />

                <i
                  className={`spec-tick ${
                    row.ok ? "" : "tick-out"
                  }`}
                  style={{ left: `${row.tick}%` }}
                />
              </div>

              <div className="spec-foot">
                <span>{row.lo}</span>

                <span
                  className={row.ok ? "" : "tone-expired"}
                >
                  {row.ok ? "in spec" : "out of spec"}
                </span>

                <span>{row.hi}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="record-verdict">
          Last LIMS result {stampFmt.format(lot.produced)} · analyst{" "}
          {who} · status {lot.quality}
        </p>
      </RecordBlock>
    </div>
  );
}

function BarWidget({ label, title, rows }) {
  const peak = Math.max(...rows.map((r) => r.value));

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-label">{label}</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="bar-list">
        {rows.map((row) => (
          <div className="bar-row" key={row.name}>
            <span className="bar-name">{row.name}</span>

            <span className="bar-track">
              <i
                className={`bar-fill bar-${row.tone}`}
                style={{
                  "--bar-w": `${(row.value / peak) * 100}%`,
                }}
              />
            </span>

            <b className="bar-value">{row.display}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatWidget({ label, title, stats }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-label">{label}</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map((stat) => (
          <div className="stat-cell" key={stat.name}>
            <p>{stat.name}</p>
            <strong className={stat.tone}>{stat.value}</strong>
            <span>{stat.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/*
   Placeholder figures. Each tab owns its widgets so switching
   tabs changes the page rather than just a caption.
*/
const tabContent = {
  "Live Stock": {
    bar: {
      label: "BY GRADE",
      title: "Stock Distribution",
      rows: [
        { name: "AA 1050", value: 412.8, display: "412.8 MT", tone: "green" },
        { name: "AA 3003", value: 306.2, display: "306.2 MT", tone: "green" },
        { name: "AA 8011", value: 274.5, display: "274.5 MT", tone: "purple" },
        { name: "AA 5052", value: 181.4, display: "181.4 MT", tone: "yellow" },
        { name: "Others", value: 109.7, display: "109.7 MT", tone: "red" },
      ],
    },
    stat: {
      label: "READINESS",
      title: "Dispatch Position",
      stats: [
        { name: "Ready to Dispatch", value: "1,126 MT", note: "Cleared by QA", tone: "" },
        { name: "Held for Docs", value: "84 MT", note: "Awaiting paperwork", tone: "warning" },
        { name: "Open Orders", value: "38", note: "Against live stock", tone: "" },
        { name: "Coverage", value: "3.4 wk", note: "At current offtake", tone: "" },
      ],
    },
  },

  "Age Analysis": {
    bar: {
      label: "AGEING",
      title: "Stock by Age Bucket",
      rows: [
        { name: "0 – 30 d", value: 648.2, display: "648.2 MT", tone: "green" },
        { name: "31 – 60 d", value: 371.5, display: "371.5 MT", tone: "green" },
        { name: "61 – 90 d", value: 168.4, display: "168.4 MT", tone: "yellow" },
        { name: "91 – 180 d", value: 74.9, display: "74.9 MT", tone: "yellow" },
        { name: "180 d +", value: 21.6, display: "21.6 MT", tone: "red" },
      ],
    },
    stat: {
      label: "EXPOSURE",
      title: "Ageing Risk",
      stats: [
        { name: "Average Age", value: "34 d", note: "Weighted by tonnage", tone: "" },
        { name: "Oldest Lot", value: "214 d", note: "LOT-2024-0881", tone: "danger" },
        { name: "Beyond 90 d", value: "96.5 MT", note: "7.5% of holding", tone: "warning" },
        { name: "Provision Risk", value: "12 lots", note: "Review required", tone: "warning" },
      ],
    },
  },

  "PPC / Movement": {
    bar: {
      label: "LAST 7 DAYS",
      title: "Daily Movement",
      rows: [
        { name: "Mon", value: 168.4, display: "168.4 MT", tone: "green" },
        { name: "Tue", value: 194.2, display: "194.2 MT", tone: "green" },
        { name: "Wed", value: 142.7, display: "142.7 MT", tone: "yellow" },
        { name: "Thu", value: 208.9, display: "208.9 MT", tone: "green" },
        { name: "Fri", value: 176.3, display: "176.3 MT", tone: "green" },
        { name: "Sat", value: 98.5, display: "98.5 MT", tone: "yellow" },
      ],
    },
    stat: {
      label: "THROUGHPUT",
      title: "Production vs Dispatch",
      stats: [
        { name: "Produced (7d)", value: "1,189 MT", note: "Against 1,150 plan", tone: "" },
        { name: "Dispatched (7d)", value: "1,142 MT", note: "96% of production", tone: "" },
        { name: "Net Build-up", value: "47 MT", note: "Added to holding", tone: "warning" },
        { name: "Plan Adherence", value: "103%", note: "Above target", tone: "" },
      ],
    },
  },

  Quality: {
    bar: {
      label: "PASS RATE",
      title: "Inspection Outcomes",
      rows: [
        { name: "Surface", value: 98.2, display: "98.2%", tone: "green" },
        { name: "Thickness", value: 97.4, display: "97.4%", tone: "green" },
        { name: "Mechanical", value: 95.8, display: "95.8%", tone: "green" },
        { name: "Coating", value: 91.3, display: "91.3%", tone: "yellow" },
        { name: "Edge Quality", value: 86.7, display: "86.7%", tone: "red" },
      ],
    },
    stat: {
      label: "HOLDS",
      title: "Quality Position",
      stats: [
        { name: "Lots Inspected", value: "203", note: "Current cycle", tone: "" },
        { name: "On Hold", value: "09", note: "Pending disposition", tone: "warning" },
        { name: "Rejected", value: "04", note: "Non-saleable", tone: "danger" },
        { name: "First Pass Yield", value: "94.1%", note: "Against 95% target", tone: "warning" },
      ],
    },
  },

  "Review / Trial / Reject": {
    bar: {
      label: "DISPOSITION",
      title: "Non-Standard Holding",
      rows: [
        { name: "Review", value: 64, display: "64 MT", tone: "yellow" },
        { name: "Reject", value: 56, display: "56 MT", tone: "red" },
        { name: "Trial", value: 38, display: "38 MT", tone: "purple" },
        { name: "Rework", value: 22, display: "22 MT", tone: "yellow" },
      ],
    },
    stat: {
      label: "AGEING",
      title: "Decision Pendency",
      stats: [
        { name: "Awaiting Decision", value: "18 lots", note: "Across all states", tone: "warning" },
        { name: "Over 30 Days", value: "06 lots", note: "Escalation due", tone: "danger" },
        { name: "Cleared (30d)", value: "41 lots", note: "Returned to saleable", tone: "" },
        { name: "Recovery Rate", value: "71%", note: "Review to saleable", tone: "" },
      ],
    },
  },
};

function Dashboard({ onSignOut, operator }) {
  /*
     Seeded from the history entry rather than from defaults. Going
     forward into a dashboard entry remounts this component, and a
     fresh "Overview" would both show the wrong view and push a
     duplicate entry over the one being restored.
  */
  const entry =
    window.history.state?.view === "dash"
      ? window.history.state
      : null;

  const [activeTab, setActiveTab] = useState(
    entry?.tab ?? "Overview",
  );

  const [grade, setGrade] = useState(entry?.grade ?? "");
  const [lotId, setLotId] = useState(entry?.lot ?? "");
  const [query, setQuery] = useState("");

  /*
     Browser Back used to leave the site outright: moving between
     tabs, grades and lots is all component state, and state alone
     puts nothing on the history stack. Every view now records an
     entry, so Back steps through them one at a time and only exits
     once there is genuinely nothing left to go back to.

     query is deliberately not tracked. It is a live filter, and an
     entry per keystroke would make Back useless.
  */
  useEffect(() => {
    const next = {
      view: "dash",
      tab: activeTab,
      grade,
      lot: lotId,
    };

    const current = window.history.state;

    /*
       Comparing against the entry we are already on is what stops
       a popstate restore from immediately pushing the state it
       just restored, which would make Back a no-op.
    */
    if (
      current &&
      current.view === "dash" &&
      current.tab === next.tab &&
      current.grade === next.grade &&
      current.lot === next.lot
    ) {
      return;
    }

    window.history.pushState(next, "");
  }, [activeTab, grade, lotId]);

  useEffect(() => {
    const onPop = (event) => {
      // Signing out is App's to handle; ignore anything not a view.
      if (event.state?.view !== "dash") {
        return;
      }

      setActiveTab(event.state.tab ?? "Overview");
      setGrade(event.state.grade ?? "");
      setLotId(event.state.lot ?? "");
      setQuery("");
    };

    window.addEventListener("popstate", onPop);

    return () =>
      window.removeEventListener("popstate", onPop);
  }, []);

  /*
     Fixed at mount rather than read from the ticking clock, so a
     table of derived dates does not rebuild itself every second.
  */
  const [today] = useState(() => new Date());

  const allLots = buildLots(today);

  /*
     A typed lot number can pick the grade for you — the register
     opens on whichever grade owns the match.
  */
  const typed = query.trim().toLowerCase();

  const searchHit =
    typed.length >= 3
      ? allLots.find((l) => l.id.toLowerCase().includes(typed))
      : null;

  const activeGrade = grade || (searchHit ? searchHit.grade : "");

  // Expiry first: the point of the view is what runs out next.
  const gradeLots = allLots
    .filter((l) => l.grade === activeGrade)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const focusedId = lotId || (searchHit ? searchHit.id : "");

  const focusedLot = gradeLots.find((l) => l.id === focusedId);
  const hasLot = Boolean(focusedLot);

  /*
     The feed bar sits below the heading on Overview and up in the
     heading's empty right slot on every other tab. Those are two
     different parents, so there is nothing for CSS to transition
     between — measure where it was, measure where it landed, and
     play the difference back.
  */
  const feedRef = useRef(null);
  const feedFrom = useRef(null);

  useLayoutEffect(() => {
    const el = feedRef.current;

    if (!el) {
      feedFrom.current = null;
      return;
    }

    const box = el.getBoundingClientRect();

    /*
       Centres, because the two variants are different sizes and
       matching their corners would read as a lurch. Document
       coordinates, so scrolling between tab changes is not
       mistaken for the bar having moved.
    */
    const next = {
      x: box.left + window.scrollX + box.width / 2,
      y: box.top + window.scrollY + box.height / 2,
    };

    const prev = feedFrom.current;
    feedFrom.current = next;

    if (!prev || typeof el.animate !== "function") {
      return;
    }

    const dx = prev.x - next.x;
    const dy = prev.y - next.y;
    const travel = Math.hypot(dx, dy);

    /*
       Under 4px is sub-pixel settling rather than a move. Over
       1400px means something else reflowed the page and playing
       that back would be nonsense.
    */
    if (travel < 4 || travel > 1400) {
      return;
    }

    if (
      window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches
    ) {
      return;
    }

    el.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px)`,
          opacity: 0.4,
        },
        {
          transform: "none",
          opacity: 1,
        },
      ],
      {
        duration: 520,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );
  }, [activeTab, hasLot]);

  const gradeTotal = gradeLots.reduce((sum, l) => sum + l.qty, 0);

  const heaviest = gradeLots.reduce(
    (top, l) => Math.max(top, l.qty),
    1,
  );

  const atRisk = gradeLots.filter((l) => l.daysLeft <= 7).length;

  const browsing = Boolean(activeGrade);

  const [activeKpi, setActiveKpi] = useState("");

  /*
     What the KPIs, the reconciliation rings and the two summary
     tables all arm. One filter rather than one per table, so the
     register always shows the set you last asked for instead of
     several tables disagreeing about what is selected.
  */
  const [lotFilter, setLotFilter] = useState(null);

  const registerRef = useRef(null);

  /*
     After the commit rather than inside the click handler: arming a
     KPI also resizes the exception table above the register, so a
     position measured during the click would already be stale by
     the time the browser scrolled to it.
  */
  useEffect(() => {
    if (!lotFilter) {
      return;
    }

    revealRegister(registerRef.current);
  }, [lotFilter]);

  // Soonest to expire first: the register is a work queue
  const registerLots = allLots
    .filter((l) => lotPasses(l, lotFilter))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  /*
     The exception list is the register narrowed three ways at
     once: whichever KPI is armed, the grade picker, and the typed
     query. Each is optional, so they compose rather than override.
  */
  const exceptionRows = allLots
    .filter((l) => (activeKpi ? kpiTests[activeKpi](l) : l.check !== "Matched"))
    .filter((l) => (activeGrade ? l.grade === activeGrade : true))
    .filter((l) =>
      typed.length >= 3 ? l.id.toLowerCase().includes(typed) : true,
    )
    .map((l) => {
      const stock = reconcile(l);

      /*
         Ordered by how blocking the problem is: a lot the manual
         register has never seen outranks a quantity gap, which
         outranks anything about its condition.
      */
      let issue = "Under review";

      if (l.check === "PL2P only") {
        issue = "Not in manual register";
      } else if (stock.diff !== 0) {
        issue = "Quantity difference";
      } else if (l.quality === "Reject") {
        issue = "Quality reject";
      } else if (l.daysLeft < 0) {
        issue = "Past expiry";
      } else if (l.daysLeft <= 30) {
        issue = "Nearing expiry";
      }

      return {
        id: l.id,
        grade: l.grade,
        manual: stock.manual,
        pl2p: stock.pl2p,
        diff: stock.diff,
        issue,
      };
    })
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  /*
     The plant at a glance, one row per grade. This is what the
     lookup actually opens onto, so it belongs beside the controls
     rather than under a panel about exceptions.
  */
  const gradeSummary = lotGrades.map((g) => {
    const lots = allLots.filter((l) => l.grade === g);

    const risky = lots.filter((l) => l.daysLeft <= 7);

    return {
      code: g,
      name: gradeBook[g].name,
      lots: lots.length,
      qty: lots.reduce((s, l) => s + l.qty, 0),
      atRisk: risky.length,
      atRiskQty: risky.reduce((s, l) => s + l.qty, 0),
      // Fewest days left, so the one closest to expiry
      oldest: lots.reduce(
        (a, l) => (l.daysLeft < a.daysLeft ? l : a),
        lots[0],
      ),
      /*
         Only real locations. A PL2P-only lot carries "Not in
         register" in its location field, which is a reconciliation
         state rather than somewhere the stock is standing.
      */
      bays: [
        ...new Set(
          lots
            .map((l) => l.location)
            .filter((place) => place !== "Not in register"),
        ),
      ],
    };
  });

  const plantQty = gradeSummary.reduce((s, g) => s + g.qty, 0);

  const kpiLabel = activeKpi
    ? overviewMetrics.find((m) => m.key === activeKpi).label
    : "";


  /*
     Age Analysis horizon, in days. Counts lots already past expiry
     too — "reaches expiry within 7 days" has to include the ones
     that got there first, or the number understates the problem.
  */
  // Index into HORIZON_STOPS, so the steps stay evenly spaced
  const [horizonStep, setHorizonStep] = useState(1);

  const horizon = HORIZON_STOPS[horizonStep];

  const horizonLots = allLots.filter((l) => l.daysLeft <= horizon);

  const horizonQty = horizonLots.reduce((s, l) => s + l.qty, 0);

  const holdingQty = allLots.reduce((s, l) => s + l.qty, 0);

  const horizonShare = holdingQty
    ? (horizonQty / holdingQty) * 100
    : 0;

  const horizonPast = horizonLots.filter(
    (l) => l.daysLeft < 0,
  ).length;

  /*
     Both Age Analysis panels are derived now. They used to be
     hardcoded and disagreed with the slider directly above them —
     648.2 MT against 320.13 MT for the same question — and named a
     lot, LOT-2024-0881, that is not in the register.
  */
  const ageBuckets = AGE_BANDS.map((b) => {
    const hit = allLots.filter(b.test);
    const qty = hit.reduce((s, l) => s + l.qty, 0);

    return {
      name: b.label,
      value: qty,
      display: `${qty.toFixed(1)} MT`,
      tone:
        b.key === "expired" || b.key === "week"
          ? "red"
          : b.key === "clear"
            ? "green"
            : "yellow",
    };
  });

  const oldestLot = allLots.reduce(
    (a, l) => (l.daysLeft < a.daysLeft ? l : a),
    allLots[0],
  );

  const expiredLots = allLots.filter((l) => l.daysLeft < 0);

  const monthLots = allLots.filter(
    (l) => l.daysLeft >= 0 && l.daysLeft <= 30,
  );

  // Weighted by tonnage: one small old lot should not skew it
  const avgUsed = holdingQty
    ? allLots.reduce(
        (s, l) => s + shelfUsed(l) * l.qty,
        0,
      ) / holdingQty
    : 0;

  /*
     Two places open a record from the Age Analysis tab now — the
     chips and the register — so the navigation lives in one place.
     The record only renders on Overview, so opening one has to take
     the tab with it.
  */
  const openRecord = (lot) => {
    setActiveTab("Overview");
    setGrade(lot.grade);
    setLotId(lot.id);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const ageStats = [
    {
      name: "Shelf life used",
      value: `${avgUsed.toFixed(0)}%`,
      note: "Weighted by tonnage",
      tone: "",
    },
    {
      name: "Oldest lot",
      value: ageLabel(oldestLot.daysLeft),
      note: oldestLot.id,
      tone: "danger",
    },
    {
      name: "Already expired",
      value: `${expiredLots
        .reduce((s, l) => s + l.qty, 0)
        .toFixed(1)} MT`,
      note: `${expiredLots.length} lots`,
      tone: "danger",
    },
    {
      name: "Expiring in 30 days",
      value: `${monthLots
        .reduce((s, l) => s + l.qty, 0)
        .toFixed(1)} MT`,
      note: `${monthLots.length} lots`,
      tone: "warning",
    },
  ];

  /*
     Opening a record swaps the page rather than filtering in
     place, so the scroll position has to be reset with it —
     otherwise a click near the bottom of a long grade lands
     halfway down the record.
  */
  const openLot = (id) => {
    setLotId(id);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetFinder = () => {
    setGrade("");
    setLotId("");
    setQuery("");
  };


  const [darkMode, setDarkMode] = useState(true);

  /*
     Stand-ins for the two feeds that write this dashboard. Once
     the API is wired these become state fed by the response — the
     header reads Dates either way and needs no changes.
  */
  const [lastUpdated] = useState(() => ({
    manual: { at: new Date(), lots: 203 },
    pl2p: {
      at: new Date(Date.now() - 7 * 60 * 1000),
      lots: 196,
    },
  }));

  const now = useNow();

  const syncFeeds = [
    {
      id: "manual",
      label: "MANUAL",
      at: lastUpdated.manual.at,
      lots: lastUpdated.manual.lots,
    },
    {
      id: "pl2p",
      label: "PL2P",
      at: lastUpdated.pl2p.at,
      lots: lastUpdated.pl2p.lots,
    },
  ];

  return (
    <div
      className={`dashboard-page ${
        darkMode ? "dark-mode" : "light-mode"
      }`}
    >
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onBackHome={onSignOut}
        onSignOut={onSignOut}
        operator={operator}
      />

      <main className="dashboard-content">

        <p className="page-crumb">
          <b>HINDALCO</b>
          <span>BELAGAVI PLANT</span>
          <i>/</i>
          <span>FG STOCK INVENTORY</span>
        </p>

        {!focusedLot && (
        <section className="dashboard-heading">
          {/*
             Keyed on the tab so React remounts it — that is what
             replays the entrance each time you switch, which a
             plain re-render would not do.
          */}
          <div className="heading-main" key={activeTab}>
            <span className="heading-rule"></span>

            <div>
              <p className="eyebrow">
                <b>
                  {String(
                    navItems.indexOf(activeTab) + 1,
                  ).padStart(2, "0")}
                </b>

                <i></i>

                {activeTab.toUpperCase()}
              </p>

              <h1>
                {(tabMeta[activeTab] || tabMeta.Overview).title}
              </h1>

              <p className="subtitle">
                {(tabMeta[activeTab] || tabMeta.Overview).note}
              </p>
            </div>
          </div>

          {/*
             Everywhere but Overview it rides up here, filling the
             slot the heading leaves empty.
          */}
          {activeTab !== "Overview" && (
            <FeedBar
              feeds={syncFeeds}
              now={now}
              barRef={feedRef}
              compact
            />
          )}
        </section>
        )}

        {!focusedLot && activeTab === "Overview" && (
          <FeedBar
            feeds={syncFeeds}
            now={now}
            barRef={feedRef}
          />
        )}


        {activeTab === "Overview" && browsing && (
          <section className="lot-register" key={activeGrade}>

            {focusedLot ? (
              <LotRecord
                lot={focusedLot}
                onBack={() => {
                  setLotId("");
                  setQuery("");
                  window.scrollTo({
                    top: 0,
                    behavior: "smooth",
                  });
                }}
              />
            ) : (
              <>
              {/*
                 The grade picker lives on the exception panel,
                 which this view replaces — without its own way
                 out, opening a grade was a dead end.
              */}
              <button
                type="button"
                className="record-back"
                onClick={() => {
                  resetFinder();
                  window.scrollTo({
                    top: 0,
                    behavior: "smooth",
                  });
                }}
              >
                ← All grades
              </button>

              <div className="register-head">
                <div>
                  <p className="register-label">GRADE</p>

                  <h2>{activeGrade}</h2>

                  <p className="register-sub">
                    {gradeBook[activeGrade].name} ·{" "}
                    {gradeBook[activeGrade].shelfDays}-day shelf life
                  </p>
                </div>

                <dl className="register-stats">
                  <div>
                    <dt>LOTS</dt>
                    <dd>{gradeLots.length}</dd>
                  </div>

                  <div>
                    <dt>TOTAL STOCK</dt>
                    <dd>{gradeTotal.toFixed(2)} MT</dd>
                  </div>

                  <div>
                    <dt>AT RISK ≤ 7D</dt>
                    <dd className={atRisk ? "register-risk" : ""}>
                      {atRisk}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="register-bar">
                <p className="register-title">
                  {focusedId ? "Lot record" : "Lots by expiry"}
                </p>

                <p className="register-hint">
                Select a row for the full record
              </p>
              </div>

              <div className="register-scroll">
                <div className="register-table">
                  <div className="register-row register-header">
                    <span>LOT NUMBER</span>
                    <span>QUANTITY</span>
                    <span>EXPIRY</span>
                    <span>LOCATION</span>
                    <span>QUALITY</span>
                    <span>STOCK CHECK</span>
                  </div>

                  {gradeLots.map((lot) => (
                    <button
                      key={lot.id}
                      type="button"
                      className={`register-row lot-${
                        expiryTone(lot.daysLeft)
                      } ${focusedId === lot.id ? "lot-open" : ""}`}
                      aria-pressed={focusedId === lot.id}
                      aria-label={`${lot.id}, ${
                        lot.qty.toFixed(2)
                      } MT, ${ageLabel(lot.daysLeft)}`}
                      onClick={() => openLot(lot.id)}
                    >
                      <span className="lot-id">{lot.id}</span>

                      {/*
                         The bar shows this lot against the largest
                         in the grade, so relative size is readable
                         without comparing eight decimal figures.
                      */}
                      <span className="lot-qty">
                        <b>
                          {lot.qty.toFixed(2)}
                          <em>MT</em>
                        </b>

                        <i
                          style={{
                            "--w": `${(lot.qty / heaviest) * 100}%`,
                          }}
                        />
                      </span>

                      <span className="lot-when">
                        <b>{dateFmt.format(lot.expires)}</b>
                        <em>{ageLabel(lot.daysLeft)}</em>
                      </span>

                      <span className="lot-loc">{lot.location}</span>

                      <span>
                        <i
                          className={`quality-tag q-${
                            lot.quality.toLowerCase()
                          }`}
                        >
                          {lot.quality}
                        </i>
                      </span>

                      <span
                        className={`lot-check ${
                          lot.check === "Matched" ? "" : "check-flag"
                        }`}
                      >
                        {lot.check}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              </>
            )}
          </section>
        )}

        {/* The register answers the same question in far more
            detail, so the summary view stands down while it is open. */}
        {!browsing && (
          <>
          {/* Plant-wide KPIs answer the Overview question; the other
              tabs each have their own figures below. */}
          {activeTab === "Overview" && (
            <section className="metrics-grid">
              {overviewMetrics.map((m) => {
                const rising = m.delta > 0;
                const better = m.betterDown ? !rising : rising;
                const lit = Math.round(m.share * METER_STEPS);
                /*
                   Driven by the register rather than by activeKpi:
                   the first card arms the register but deliberately
                   does not narrow the exception list, so activeKpi
                   alone would leave it looking unselected.
                */
                const armed =
                  lotFilter?.kind === "kpi" &&
                  lotFilter.value === m.key;

                return (
                  <button
                    type="button"
                    key={m.label}
                    className={`metric-card metric-${m.tone} ${
                      armed ? "metric-armed" : ""
                    }`}
                    aria-pressed={armed}
                    onClick={() => {
                      const next = armed ? "" : m.key;

                      /*
                         "Total FG Stock" is every lot, which is a
                         real answer for the register but no filter
                         at all for a table that already shows only
                         exceptions — so it arms the register alone.
                      */
                      setActiveKpi(next === "all" ? "" : next);

                      setLotFilter(
                        next
                          ? {
                              kind: "kpi",
                              value: next,
                              label: m.label,
                            }
                          : null,
                      );
                    }}
                  >
                    <div className="metric-top">
                      <p>{m.label}</p>

                      <span
                        className={`metric-delta ${
                          better ? "delta-good" : "delta-bad"
                        }`}
                      >
                        <svg
                          viewBox="0 0 10 8"
                          aria-hidden="true"
                          className={rising ? "" : "delta-flip"}
                        >
                          <path d="M5 0.6 9.2 7.4H0.8Z" />
                        </svg>

                        {Math.abs(m.delta).toFixed(1)}%
                      </span>
                    </div>

                    <strong>
                      {m.value}
                      {m.unit ? <em>{m.unit}</em> : null}
                    </strong>

                    <span className="metric-note">{m.note}</span>

                    {/*
                       A segmented meter rather than a plain track:
                       the notches give the eye something to count,
                       so a share reads without the caption.
                    */}
                    {/*
                       Meter and percentage on one line: the
                       denominator moves to the tooltip, where it
                       is available without costing a whole row.
                    */}
                    <div
                      className="metric-meter"
                      title={`${
                        (m.share * 100).toFixed(1)
                      }% of ${m.shareOf}`}
                    >
                      <span className="meter-ticks">
                        {Array.from(
                          { length: METER_STEPS },
                          (unused, i) => (
                            <i
                              key={i}
                              className={i < lit ? "tick-on" : ""}
                            />
                          ),
                        )}
                      </span>

                      <b>{(m.share * 100).toFixed(1)}%</b>
                    </div>
                  </button>
                );
              })}
            </section>
          )}

          {activeTab === "Age Analysis" && (
            <section className="horizon-panel">
              <div className="horizon-head">
                <div>
                  <p className="panel-label">EXPIRY HORIZON</p>
                  <h2>Lots reaching expiry</h2>
                </div>

              </div>

              <p className="horizon-lede">
                Drag to choose how far ahead to look. Every lot
                reaching the end of its shelf life inside that
                window is counted below, including any that have
                already passed it.
              </p>

              <div className="horizon-head horizon-head-slider">
                <div className="horizon-control">
                  <input
                    type="range"
                    min="0"
                    max={HORIZON_STOPS.length - 1}
                    step="1"
                    value={horizonStep}
                    aria-label="Expiry horizon"
                    aria-valuetext={`${horizon} days`}
                    style={{
                      "--fill": `${
                        (horizonStep /
                          (HORIZON_STOPS.length - 1)) *
                        100
                      }%`,
                    }}
                    onChange={(e) =>
                      setHorizonStep(Number(e.target.value))
                    }
                  />

                  <output className="horizon-value">
                    {horizon}
                    <em>{horizon === 1 ? "day" : "days"}</em>
                  </output>
                </div>
              </div>

              <div className="horizon-stats">
                <div>
                  <p className="record-cap">LOTS</p>
                  <strong>{horizonLots.length}</strong>
                </div>

                <div>
                  <p className="record-cap">TONNAGE</p>
                  <strong>
                    {horizonQty.toFixed(2)}
                    <em>MT</em>
                  </strong>
                </div>

                <div>
                  <p className="record-cap">SHARE OF HOLDING</p>
                  <strong>
                    {horizonShare.toFixed(1)}
                    <em>%</em>
                  </strong>
                </div>
              </div>

              <div className="horizon-track">
                <i style={{ "--pct": `${horizonShare}%` }} />
              </div>

              <p className="horizon-note">
                {horizonLots.length === 0
                  ? `Nothing reaches expiry within ${horizon} days.`
                  : `${horizonLots.length} of ${
                      allLots.length
                    } lots, of which ${horizonPast} are already past expiry.`}
              </p>

              {horizonLots.length > 0 && (
                <div className="horizon-chips">
                  {horizonLots
                    .slice()
                    .sort((a, b) => a.daysLeft - b.daysLeft)
                    .map((l) => (
                      <button
                        type="button"
                        key={l.id}
                        className={`horizon-chip hz-${
                          expiryTone(l.daysLeft)
                        }`}
                        onClick={() => openRecord(l)}
                        title="Open the full record for this lot"
                      >
                        {l.id}
                        <i>{ageLabel(l.daysLeft)}</i>
                      </button>
                    ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "Age Analysis" ? (
          <>
            <section className="dashboard-panels" key={activeTab}>
              <BarWidget
                label="AGEING"
                title="Stock by age bucket"
                rows={ageBuckets}
              />

              <StatWidget
                label="EXPOSURE"
                title="Ageing risk"
                stats={ageStats}
              />
            </section>

            <AgeingRegister lots={allLots} onOpen={openRecord} />
          </>
          ) : tabContent[activeTab] ? (
            <section className="dashboard-panels" key={activeTab}>
              <BarWidget {...tabContent[activeTab].bar} />
              <StatWidget {...tabContent[activeTab].stat} />
            </section>
          ) : (
          <>
          {/* Eleven curves need the wide column; the rings do not */}
          <section className="dashboard-panels panels-wide-first">
            <StockDonut />
            <ReconciliationBars
              onPick={(pick) => setLotFilter(pick)}
            />
          </section>

          {/*
             The filters live on the table they act on rather than
             at the top of the page, where they read as a global
             search and gave no clue what they would narrow.
          */}
          {/*
             Promoted out from under Exceptions: these controls
             open the whole plant register, not a subset of
             problems, so they sit with a summary of what they
             open onto.
          */}
          <section className="explorer-panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">PLANT STOCK</p>
                <h2>Stock explorer</h2>
              </div>

              <span className="panel-side">
                {allLots.length} lots · {plantQty.toFixed(2)} MT
              </span>
            </div>

            <div className="lot-finder">
            <div className="finder-row">

              <div className="finder-field">
                <label htmlFor="finder-grade">GRADE</label>

                <select
                  id="finder-grade"
                  value={activeGrade}
                  onChange={(e) => {
                    setGrade(e.target.value);
                    setLotId("");
                    setQuery("");
                  }}
                >
                  <option value="">Select a grade</option>

                  {lotGrades.map((g) => (
                    <option key={g} value={g}>
                      {g} · {
                        allLots.filter((l) => l.grade === g).length
                      } lots
                    </option>
                  ))}
                </select>
              </div>

              <div className="finder-field">
                <label htmlFor="finder-lot">LOT NUMBER</label>

                <select
                  id="finder-lot"
                  value={focusedId}
                  disabled={!activeGrade}
                  onChange={(e) => openLot(e.target.value)}
                >
                  <option value="">
                    {activeGrade
                      ? `All ${gradeLots.length} lots`
                      : "Pick a grade first"}
                  </option>

                  {gradeLots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.id} · {l.qty.toFixed(2)} MT ·{" "}
                      {ageLabel(l.daysLeft)}
                    </option>
                  ))}
                </select>
              </div>

              <span className="finder-divider"></span>

              <div className="finder-field">
                <label htmlFor="finder-search">OR SEARCH</label>

                <input
                  id="finder-search"
                  type="search"
                  value={query}
                  placeholder="Lot number"
                  autoComplete="off"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLotId("");
                    setGrade("");
                  }}
                />
              </div>

              {(activeGrade || query) && (
                <button
                  type="button"
                  className="finder-clear"
                  onClick={resetFinder}
                >
                  Clear
                </button>
              )}

            </div>

            {!activeGrade && typed.length >= 3 && (
              <p className="finder-empty">
                No lot matches “{query.trim()}”.
              </p>
            )}
            </div>

            <GradeTable
              rows={gradeSummary}
              onOpen={(code) => {
                setGrade(code);
                setLotId("");
                setQuery("");
                window.scrollTo({
                  top: 0,
                  behavior: "smooth",
                });
              }}
            />
          </section>

          <ExceptionTable
            rows={exceptionRows}
            filterLabel={kpiLabel}
            onClear={() => {
              setActiveKpi("");

              /* A KPI arms this panel and the register together,
                 so clearing here has to release both or the two
                 chips disagree about what is selected. */
              setLotFilter((f) =>
                f?.kind === "kpi" ? null : f,
              );
            }}
          />

          <LotRegister
            panelRef={registerRef}
            lots={registerLots}
            filter={lotFilter}
            onClear={() => {
              setLotFilter(null);
              setActiveKpi("");
            }}
            onOpen={(lot) => {
              setGrade(lot.grade);
              setLotId(lot.id);
              setQuery("");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
          </>
          )}

          </>
        )}
      </main>
    </div>
  );
}

/*
   The mark does not appear until roughly three seconds in, so the
   clip is started past that. The loop attribute is dropped on
   purpose: with it the browser rewinds to zero and "ended" never
   fires, which would apply the skip on the first pass only.
*/
const HERO_START = 3;

function HeroBackdrop() {
  const seekPastIntro = (event) => {
    const video = event.currentTarget;

    // A shorter clip would seek past its own end.
    if (video.duration > HERO_START + 1) {
      video.currentTime = HERO_START;
    }
  };

  return (
    <>
      <video
        className="home-video"
        autoPlay
        muted
        playsInline
        onLoadedMetadata={seekPastIntro}
        onEnded={(event) => {
          const video = event.currentTarget;

          seekPastIntro(event);

          // Muted autoplay is permitted, but the promise can still
          // reject if the element is torn down mid-call.
          const resumed = video.play();

          if (resumed) {
            resumed.catch(() => {});
          }
        }}
      >
        <source
          src="/hero-video.mp4"
          type="video/mp4"
        />

        Your browser does not support the video tag.
      </video>

      <div className="home-overlay"></div>
    </>
  );
}

function Login({ onAuthenticate, open }) {
  /*
     Dev convenience only — prefilled so the dashboard is one click
     away while the backend is still a stub. Reset both to "" the
     moment real authentication is wired in.

     Deliberately unmistakable placeholders: this repo is public,
     and anything shaped like a real Belagavi ID and passcode would
     read as a live credential to anyone who found it.
  */
  const [operatorId, setOperatorId] = useState("DEMO-0000");
  const [passcode, setPasscode] = useState("demo1234");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!operatorId.trim() || !passcode.trim()) {
      setError("Enter both your employee ID and passcode.");
      return;
    }

    setError("");
    onAuthenticate(operatorId.trim());
  };

  return (
    <div
      className={`login-shell ${
        open ? "login-shell-open" : ""
      }`}
    >
      <form
        className="login-card"
        onSubmit={handleSubmit}
      >
        {/*
           Cut out of the supplied JPEG: transparent background, and
           each pixel lifted toward white only as far as it needed to
           clear 4.5:1 on the near-black shell behind it. Untouched
           it read 1.9:1 and the strapline was invisible.
        */}
        <img
          className="login-crest"
          src="/hindalco.png"
          alt="Hindalco"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />

        {/* The logo above carries the company name now */}
        <p className="login-eyebrow">
          BELAGAVI WORKS
        </p>

        <h2 className="login-title">
          Finished Goods Inventory
        </h2>

        <div className="login-rule"></div>

        <p className="login-sub">
          Sign in to open the dashboard
        </p>

        {/*
           placeholder=" " is load-bearing: the floating label is
           driven by :placeholder-shown, which only matches when a
           placeholder actually exists.
        */}
        <label className="login-field">
          <input
            type="text"
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            placeholder=" "
            autoComplete="username"
            spellCheck="false"
          />
          <span>Employee ID</span>
        </label>

        <label className="login-field">
          <input
            type={reveal ? "text" : "password"}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder=" "
            autoComplete="current-password"
          />
          <span>Passcode</span>

          <button
            type="button"
            className="login-peek"
            onClick={() => setReveal((v) => !v)}
            aria-label={
              reveal ? "Hide passcode" : "Show passcode"
            }
          >
            {reveal ? "HIDE" : "SHOW"}
          </button>
        </label>

        <p
          className={`login-error ${
            error ? "login-error-on" : ""
          }`}
          role="alert"
        >
          {error}
        </p>

        <button
          type="submit"
          className="login-submit"
        >
          SIGN IN
          <span>→</span>
        </button>

      </form>
    </div>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [operator, setOperator] = useState("");
  const [revealed, setRevealed] = useState(false);

  // The popstate listener binds once, so it reads the live value here
  const operatorRef = useRef("");

  useEffect(() => {
    operatorRef.current = operator;
  }, [operator]);

  /*
     One painted frame before the card animates, so the entrance
     has a start value to run from. A bare rAF can land before that
     first paint under concurrent rendering, hence the timeout.
  */
  useEffect(() => {
    const id = setTimeout(() => setRevealed(true), 60);

    return () => clearTimeout(id);
  }, []);

  /*
     The login screen is the floor of the history stack, so Back
     from the dashboard's first view lands here rather than leaving
     the site. Going back past a signed-out state never signs you
     back in: the handler only ever signs out.
  */
  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({ view: "login" }, "");
    }

    const onPop = (event) => {
      if (event.state?.view === "dash") {
        /*
           Forward, back into the dashboard. Restore the session only
           if it was never explicitly ended - signing out clears the
           operator, and that is what stops Back or Forward walking
           into an authenticated view afterwards.
        */
        if (operatorRef.current) {
          setSignedIn(true);
        }

        return;
      }

      setSignedIn(false);
    };

    window.addEventListener("popstate", onPop);

    return () =>
      window.removeEventListener("popstate", onPop);
  }, []);

  if (signedIn) {
    return (
      <Dashboard
        operator={operator}
        onSignOut={() => {
          setOperator("");
          setSignedIn(false);

          /*
             replace, not push: Back after signing out must not walk
             into an authenticated view. Older dash entries are still
             on the stack, but the popstate handler only ever signs
             out, so they cannot restore a session.
          */
          window.history.replaceState({ view: "login" }, "");

          window.scrollTo({ top: 0, behavior: "auto" });
        }}
      />
    );
  }

  return (
    <div className="home-page">
      <HeroBackdrop />

      <Login
        open={revealed}
        onAuthenticate={(id) => {
          setOperator(id);
          setSignedIn(true);

          window.history.pushState(
            { view: "dash", tab: "Overview", grade: "", lot: "" },
            "",
          );

          window.scrollTo({ top: 0, behavior: "auto" });
        }}
      />
    </div>
  );
}