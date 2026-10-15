"use client";

/* ------------------------------------------------------------------ */
/* Visual engine — generic, content-driven interactive figures.        */
/*                                                                     */
/* The model never writes SVG or JS. It selects a `visual.kind` and    */
/* supplies prose around it. These components own the interaction and  */
/* the math, so a figure is always smooth, correct and on-brand.       */
/* ------------------------------------------------------------------ */

import { useEffect, useMemo, useRef, useState } from "react";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------------ */
/* KIND: landscape — a potential-energy curve you can explore.         */
/* ------------------------------------------------------------------ */

const L_XMIN = 0.25;
const L_XMAX = 4.3;
const L_YMAX = 260;
const L_W = 760;
const L_H = 470;
const L_ML = 54;
const L_MR = 20;
const L_MT = 22;
const L_MB = 46;
const L_MASS = 3;
const L_SPRING = 25;
const L_SPRING_X0 = 0.2;
const L_CHARGE = 100;
const L_X_CLIP = 0.42;

function landscapeU(x: number) {
  if (x <= 0) return Number.POSITIVE_INFINITY;
  return L_SPRING * (x - L_SPRING_X0) ** 2 + L_CHARGE / x;
}

function landscapeSlope(x: number) {
  if (x <= 0) return 0;
  return 2 * L_SPRING * (x - L_SPRING_X0) - L_CHARGE / (x * x);
}

function turningPoints(E: number, lo: number, hi: number) {
  const roots: number[] = [];
  const steps = 600;
  let prev = landscapeU(lo) - E;
  for (let i = 1; i <= steps; i += 1) {
    const x = lo + ((hi - lo) * i) / steps;
    const cur = landscapeU(x) - E;
    if (prev === 0 || (prev < 0 && cur >= 0) || (prev > 0 && cur <= 0)) {
      let a = lo + ((hi - lo) * (i - 1)) / steps;
      let b = x;
      for (let k = 0; k < 40; k += 1) {
        const m = (a + b) / 2;
        if ((landscapeU(a) - E) * (landscapeU(m) - E) <= 0) b = m;
        else a = m;
      }
      roots.push((a + b) / 2);
    }
    prev = cur;
  }
  return roots;
}

function Landscape() {
  const [E, setE] = useState(150);
  const [ballX, setBallX] = useState(2.4);
  const [playing, setPlaying] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<"ball" | "eline" | null>(null);
  const dirRef = useRef<1 | -1>(-1);

  const sx = (x: number) => L_ML + ((x - L_XMIN) / (L_XMAX - L_XMIN)) * (L_W - L_ML - L_MR);
  const sy = (y: number) => L_MT + (1 - y / L_YMAX) * (L_H - L_MT - L_MB);
  const invX = (px: number) => L_XMIN + ((px - L_ML) / (L_W - L_ML - L_MR)) * (L_XMAX - L_XMIN);
  const invY = (py: number) => (1 - (py - L_MT) / (L_H - L_MT - L_MB)) * L_YMAX;

  const tps = useMemo(() => {
    const p = turningPoints(E, L_X_CLIP + 0.002, L_XMAX - 0.01);
    return p.length >= 2 ? p : [1.28, 1.38];
  }, [E]);
  const tpL = tps[0];
  const tpR = tps[tps.length - 1];

  useEffect(() => {
    setBallX((b) => clamp(b, tpL + 0.004, tpR - 0.004));
  }, [tpL, tpR]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.045, (now - last) / 1000);
      last = now;
      setBallX((prev) => {
        const speed = Math.sqrt(Math.max(0, (2 * (E - landscapeU(prev))) / L_MASS));
        let nx = prev + dirRef.current * speed * dt;
        if (nx <= tpL + 0.002) {
          nx = tpL + 0.002;
          dirRef.current = 1;
        } else if (nx >= tpR - 0.002) {
          nx = tpR - 0.002;
          dirRef.current = -1;
        }
        return nx;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, E, tpL, tpR]);

  const path = useMemo(() => {
    let d = "";
    const n = 200;
    for (let i = 0; i <= n; i += 1) {
      const x = L_X_CLIP + ((L_XMAX - L_X_CLIP) * i) / n;
      const y = Math.min(landscapeU(x), L_YMAX + 4);
      d += `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
    }
    return d;
  }, []);

  const Uball = landscapeU(ballX);
  const force = -landscapeSlope(ballX);
  const speed = Math.sqrt(Math.max(0, (2 * (E - Uball)) / L_MASS));

  const toLocal = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      px: ((e.clientX - r.left) / r.width) * L_W,
      py: ((e.clientY - r.top) / r.height) * L_H,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    const role = (e.target as Element).getAttribute?.("data-role");
    if (role === "ball" || role === "eline") {
      dragRef.current = role as "ball" | "eline";
      if (role === "ball") setPlaying(false);
      svgRef.current!.setPointerCapture(e.pointerId);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { px, py } = toLocal(e);
    if (dragRef.current === "eline") {
      setE(clamp(Math.round(invY(py) * 2) / 2, 6, L_YMAX - 2));
    } else {
      setBallX(clamp(invX(px), tpL + 0.004, tpR - 0.004));
    }
  };

  const onUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${L_W} ${L_H}`}
        className="block w-full touch-none select-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {[0, 50, 100, 150, 200, 250].map((y) => (
          <g key={y}>
            <line
              x1={L_ML}
              y1={sy(y)}
              x2={L_W - L_MR}
              y2={sy(y)}
              stroke="var(--color-deep-line)"
              strokeOpacity="0.25"
              strokeWidth="1"
            />
            <text x={L_ML - 8} y={sy(y) + 4} textAnchor="end" fontSize="11" fill="var(--color-mist-soft)">
              {y}
            </text>
          </g>
        ))}
        {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].map((x) => (
          <line
            key={x}
            x1={sx(x)}
            y1={L_MT}
            x2={sx(x)}
            y2={L_H - L_MB}
            stroke="var(--color-deep-line)"
            strokeOpacity="0.18"
            strokeWidth="1"
          />
        ))}
        <line x1={L_ML} y1={L_H - L_MB} x2={L_W - L_MR} y2={L_H - L_MB} stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        <line x1={L_ML} y1={L_MT} x2={L_ML} y2={L_H - L_MB} stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        <text x={L_W - L_MR} y={L_H - L_MB + 26} textAnchor="end" fontSize="13" fill="var(--color-mist-soft)">
          position x (m)
        </text>
        <text x={L_ML - 40} y={L_MT + 4} fontSize="13" fill="var(--color-mist-soft)">
          U (J)
        </text>

        <g data-role="eline" style={{ cursor: "ns-resize" }}>
          <line x1={L_ML} y1={sy(E)} x2={L_W - L_MR} y2={sy(E)} stroke="var(--color-gold)" strokeWidth="2.5" strokeDasharray="8 5" />
          <rect x={L_ML} y={sy(E) - 12} width={L_W - L_ML - L_MR} height={24} fill="transparent" />
          <text x={L_W - L_MR - 4} y={sy(E) - 8} textAnchor="end" fontSize="13" fontWeight="700" fill="var(--color-gold)">
            E = {E.toFixed(1)} J
          </text>
        </g>

        <path d={path} fill="none" stroke="var(--color-pine)" strokeWidth="3" strokeLinejoin="round" />

        {tps.map((t, i) => (
          <circle key={i} cx={sx(t)} cy={sy(landscapeU(t))} r="5" fill="var(--color-gold)" stroke="var(--color-deep)" strokeWidth="1.5" />
        ))}

        <circle
          data-role="ball"
          cx={sx(ballX)}
          cy={sy(Uball)}
          r="11"
          fill="var(--color-cobalt)"
          stroke="var(--color-deep)"
          strokeWidth="2.5"
          style={{ cursor: "grab" }}
        />
        {Math.abs(force) > 0.5 && (
          <line
            x1={sx(ballX)}
            y1={sy(Uball)}
            x2={sx(ballX) + clamp(force * 0.55, -90, 90)}
            y2={sy(Uball)}
            stroke="var(--color-ember)"
            strokeWidth="3.5"
            strokeLinecap="round"
            markerEnd="url(#cpArrow)"
          />
        )}
        <defs>
          <marker id="cpArrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <path d="M0 0 L9 4.5 L0 9 Z" fill="var(--color-ember)" />
          </marker>
        </defs>
      </svg>

      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--card-line)] bg-[color:var(--paper)] px-4 py-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="rounded-lg bg-pine px-4 py-2 text-sm font-bold text-mist transition hover:bg-pine-deep active:translate-y-px"
        >
          {playing ? "Pause" : "Let it roll"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setE(150);
            setBallX(2.4);
          }}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-[color:var(--ink-soft)] transition hover:bg-[color:var(--paper2)]"
        >
          Reset
        </button>
        <label className="ml-auto flex min-w-[220px] flex-1 items-center gap-3 text-sm font-semibold text-[color:var(--ink-soft)] sm:max-w-[300px]">
          <span className="whitespace-nowrap font-mono text-[13px] text-[color:var(--ink)]">
            E = {E.toFixed(1)} J
          </span>
          <input
            type="range"
            min={6}
            max={L_YMAX - 2}
            step={0.5}
            value={E}
            onChange={(e) => setE(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Total energy"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-[color:var(--card-line)] bg-[color:var(--card-line)] sm:grid-cols-4">
        {[
          { label: "position x", val: `${ballX.toFixed(2)} m`, color: "var(--color-deep)" },
          { label: "potential U(x)", val: `${Uball.toFixed(1)} J`, color: "var(--color-pine)" },
          { label: "force F = −dU/dx", val: `${force >= 0 ? "+" : ""}${force.toFixed(0)} N`, color: "var(--color-cobalt)" },
          { label: "speed v = √(2K/m)", val: `${speed.toFixed(2)} m/s`, color: "var(--color-ember)" },
        ].map((row) => (
          <div key={row.label} className="bg-[color:var(--card-surface)] px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-faint)]">
              <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
              {row.label}
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold tabular-nums" style={{ color: row.color }}>
              {row.val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KIND: bars — an energy ledger whose total is pinned. Only the split */
/* between K, U and Q reshuffles as the motion runs.                   */
/* ------------------------------------------------------------------ */

function Bars() {
  const [t, setT] = useState(0);
  const total = 100;
  const U = 60 - 55 * t;
  const K = 5 + 55 * t;
  const Q = 35 * t;
  const max = Math.max(U, 20);

  const H = 240;
  const segU = (U / max) * H;
  const segK = (K / max) * H;
  const segQ = (Q / max) * H;

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)] p-5">
      <div className="flex items-end justify-center gap-8">
        <div className="relative flex w-24 items-end border-b-2 border-[color:var(--card-line)]" style={{ height: H }}>
          <div className="absolute inset-x-0 bottom-0 flex flex-col-reverse">
            <div style={{ height: segU, background: "var(--color-cobalt)" }} />
            <div style={{ height: segK, background: "var(--color-pine)" }} />
            <div style={{ height: segQ, background: "var(--color-ember)" }} />
          </div>
          <div className="absolute -inset-x-3 border-t-2 border-dashed border-[color:var(--ink-faint)]" style={{ bottom: H }} />
        </div>
        <div className="space-y-2 text-[15px] leading-8">
          {[
            { c: "var(--color-cobalt)", k: "U", v: U },
            { c: "var(--color-pine)", k: "K", v: K },
            { c: "var(--color-ember)", k: "Q", v: Q },
          ].map((row) => (
            <div key={row.k} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: row.c }} />
              <span className="font-semibold">{row.k}</span>
              <span className="font-mono tabular-nums">{row.v.toFixed(0)} J</span>
            </div>
          ))}
          <div className="border-t border-[color:var(--card-line)] pt-1 font-mono tabular-nums">
            total = {total.toFixed(0)} J
          </div>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={t * 100}
        onChange={(e) => setT(parseFloat(e.target.value) / 100)}
        className="mt-5 w-full"
        aria-label="Progress through the motion"
      />
      <p className="mt-1.5 text-[13px] text-[color:var(--ink-soft)]">
        Slide to run the motion. The stack height never moves — only the colours
        reshuffle, and friction leaks energy into Q.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KIND: area — work as the area under a force–position curve.         */
/* ------------------------------------------------------------------ */

function Area() {
  const [a, setA] = useState(1.2);
  const W = 560;
  const H = 320;
  const ML = 56;
  const MB = 46;
  const xMax = 4;
  const yMax = 10;

  const sx = (x: number) => ML + (x / xMax) * (W - ML - 24);
  const sy = (y: number) => H - MB - (y / yMax) * (H - MB - 26);
  const f = (x: number) => 6 - 1.2 * x + 0.18 * x * x;

  const area = useMemo(() => {
    let sum = 0;
    const n = 200;
    for (let i = 0; i < n; i += 1) {
      const x0 = (a * i) / n;
      const x1 = (a * (i + 1)) / n;
      sum += ((f(x0) + f(x1)) / 2) * (x1 - x0);
    }
    return sum;
  }, [a]);

  const curve = useMemo(() => {
    let d = "";
    const n = 120;
    for (let i = 0; i <= n; i += 1) {
      const x = (xMax * i) / n;
      d += `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)} ${sy(f(x)).toFixed(1)}`;
    }
    return d;
  }, []);

  const fill = useMemo(() => {
    let d = `M${sx(0)} ${sy(0)}`;
    const n = 80;
    for (let i = 0; i <= n; i += 1) {
      const x = (a * i) / n;
      d += `L${sx(x).toFixed(1)} ${sy(f(x)).toFixed(1)}`;
    }
    d += `L${sx(a)} ${sy(0)} Z`;
    return d;
  }, [a]);

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <line x1={ML} y1={sy(0)} x2={W - 24} y2={sy(0)} stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        <line x1={ML} y1={26} x2={ML} y2={sy(0)} stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        <path d={fill} fill="var(--color-pine)" fillOpacity="0.22" stroke="none" />
        <path d={curve} fill="none" stroke="var(--color-pine)" strokeWidth="3" />
        <line x1={sx(a)} y1={26} x2={sx(a)} y2={sy(0)} stroke="var(--color-ember)" strokeWidth="2.5" strokeDasharray="6 4" />
        <text x={sx(a)} y={sy(0) + 22} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-ember)">
          x = {a.toFixed(2)} m
        </text>
        <text x={W - 24} y={sy(0) + 26} textAnchor="end" fontSize="13" fill="var(--color-mist-soft)">
          position x (m)
        </text>
        <text x={ML - 42} y={32} fontSize="13" fill="var(--color-mist-soft)">
          F (N)
        </text>
      </svg>
      <div className="flex items-center gap-4 border-t border-[color:var(--card-line)] bg-[color:var(--paper)] px-4 py-3">
        <span className="whitespace-nowrap font-mono text-[13px] font-bold text-pine">
          W = {area.toFixed(1)} J
        </span>
        <input
          type="range"
          min={0.2}
          max={4}
          step={0.05}
          value={a}
          onChange={(e) => setA(parseFloat(e.target.value))}
          className="w-full"
          aria-label="Upper limit"
        />
      </div>
      <p className="border-t border-[color:var(--card-line)] px-4 py-3 text-[13px] text-[color:var(--ink-soft)]">
        The shaded area <em>is</em> the work done. Signed area: below the axis
        it subtracts.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function CardVisual({ kind }: { kind: string }) {
  if (kind === "landscape") return <Landscape />;
  if (kind === "bars") return <Bars />;
  if (kind === "area") return <Area />;
  return null;
}

