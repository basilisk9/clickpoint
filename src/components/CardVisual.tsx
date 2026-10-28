"use client";

/* ------------------------------------------------------------------ */
/* Visual engine — generic, content-driven interactive figures.        */
/*                                                                     */
/* The model never writes SVG or JS. It selects a `visual.kind` and    */
/* supplies prose around it. These components own the interaction and  */
/* the math, so a figure is always smooth, correct and on-brand.       */
/* ------------------------------------------------------------------ */

import { useEffect, useId, useMemo, useRef, useState } from "react";

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

function Landscape({ params }: { params?: Record<string, number> }) {
  const [E, setE] = useState(clamp(params?.energy ?? 150, 20, 240));
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

function Area({ params }: { params?: Record<string, number> }) {
  const [a, setA] = useState(clamp(params?.limit ?? 1.2, 0.2, 4));
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
/* KIND: disk — a spinning body with a draggable radius.               */
/* ------------------------------------------------------------------ */

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const x0 = cx + Math.cos(a0) * r;
  const y0 = cy + Math.sin(a0) * r;
  const x1 = cx + Math.cos(a1) * r;
  const y1 = cy + Math.sin(a1) * r;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function headPoints(x: number, y: number, angle: number, size = 10) {
  const a1 = angle + Math.PI - 0.42;
  const a2 = angle + Math.PI + 0.42;
  return `${x.toFixed(1)},${y.toFixed(1)} ${(x + Math.cos(a1) * size).toFixed(1)},${(
    y +
    Math.sin(a1) * size
  ).toFixed(1)} ${(x + Math.cos(a2) * size).toFixed(1)},${(y + Math.sin(a2) * size).toFixed(1)}`;
}

function RotatingDisk({ params }: { params?: Record<string, number> }) {
  const [radius, setRadius] = useState(clamp(params?.radius ?? 0.4, 0.05, 1));
  const [omega, setOmega] = useState(clamp(params?.omega ?? 2, 0.2, 4));
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    if (!spinning) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setAngle((a) => (a + omega * dt) % (Math.PI * 2));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [spinning, omega]);

  const W = 420;
  const H = 280;
  const cx = 190;
  const cy = 138;
  const R = 104;
  const rPx = radius * R;
  const tipX = cx + Math.cos(angle) * rPx;
  const tipY = cy + Math.sin(angle) * rPx;
  const speed = omega * radius;
  const lap = (2 * Math.PI) / omega;
  const arcR = Math.min(rPx * 0.6, 58);

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full touch-none select-none">
        <circle cx={cx} cy={cy} r={R} fill="var(--color-paper)" stroke="var(--color-pine)" strokeOpacity="0.22" strokeWidth="10" />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        {[0, 1, 2, 3].map((i) => {
          const a = angle + (i * Math.PI) / 2;
          return (
            <line
              key={i}
              x1={cx - Math.cos(a) * R}
              y1={cy - Math.sin(a) * R}
              x2={cx + Math.cos(a) * R}
              y2={cy + Math.sin(a) * R}
              stroke="var(--color-mist-soft)"
              strokeWidth="1.5"
            />
          );
        })}
        <circle cx={cx} cy={cy} r="4" fill="var(--color-ink-soft)" />
        <path d={arcPath(cx, cy, arcR, angle - 1, angle)} fill="none" stroke="var(--color-ember)" strokeWidth="2" />
        <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke="var(--color-pine)" strokeWidth="2.5" />
        <circle cx={tipX} cy={tipY} r="7" fill="var(--color-pine)" />
        <text x={cx + arcR * 0.72} y={cy + 16} fontSize="12" fontWeight="700" fill="var(--color-ember)">
          θ
        </text>
        <text x={tipX + (tipX > cx ? 12 : -12)} y={tipY - 12} textAnchor={tipX > cx ? "start" : "end"} fontSize="12" fontWeight="700" fill="var(--color-pine)">
          v = {speed.toFixed(2)} m/s
        </text>
        <text x={W - 16} y={26} textAnchor="end" fontSize="12" fill="var(--color-ink-soft)">
          r = {radius.toFixed(2)} m
        </text>
        <text x={cx} y={H - 14} textAnchor="middle" fontSize="12" fill="var(--color-ink-faint)">
          one lap = 2π/ω = {lap.toFixed(2)} s
        </text>
      </svg>
      <div className="flex flex-wrap items-center gap-4 border-t border-[color:var(--card-line)] bg-[color:var(--paper)] px-4 py-3">
        <label className="flex min-w-[170px] flex-1 items-center gap-2 font-mono text-[12px] text-[color:var(--ink-soft)]">
          r
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={radius}
            onChange={(e) => setRadius(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Radius"
          />
        </label>
        <label className="flex min-w-[170px] flex-1 items-center gap-2 font-mono text-[12px] text-[color:var(--ink-soft)]">
          ω
          <input
            type="range"
            min={0.2}
            max={4}
            step={0.05}
            value={omega}
            onChange={(e) => setOmega(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Angular speed"
          />
        </label>
        <button
          type="button"
          onClick={() => setSpinning((s) => !s)}
          className="rounded-md border border-[color:var(--card-line)] bg-[color:var(--card-surface)] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-[color:var(--ink-soft)]"
        >
          {spinning ? "pause" : "spin"}
        </button>
      </div>
      <p className="border-t border-[color:var(--card-line)] px-4 py-3 text-[13px] text-[color:var(--ink-soft)]">
        Every point on the body turns through the same angle in the same time, so ω is
        shared. Slide r outward and watch v = ωr rise in step: the rim covers more ground
        per turn than the hub.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KIND: vector — one arrow you drag, resolved live into components.   */
/* ------------------------------------------------------------------ */

function VectorComponents({ params }: { params?: Record<string, number> }) {
  const [angle, setAngle] = useState(clamp(params?.angle ?? 35, 0, 90));
  const [mag, setMag] = useState(clamp(params?.magnitude ?? 6, 1, 10));
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 420;
  const H = 300;
  const ox = 64;
  const oy = H - 64;
  const unit = 24;
  const rad = (angle * Math.PI) / 180;
  const dxv = mag * Math.cos(rad) * unit;
  const dyv = -mag * Math.sin(rad) * unit;
  const tipX = ox + dxv;
  const tipY = oy + dyv;
  const fx = mag * Math.cos(rad);
  const fy = mag * Math.sin(rad);

  const drag = (e: React.PointerEvent) => {
    if (e.buttons === 0 || !svgRef.current) return;
    const box = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W - ox;
    const py = ((e.clientY - box.top) / box.height) * H - oy;
    setMag(clamp(Math.hypot(px, py) / unit, 1, 10));
    setAngle(clamp((Math.atan2(-py, Math.max(px, 0.001)) * 180) / Math.PI, 0, 90));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={drag}
        onPointerMove={drag}
      >
        <line x1={ox} y1={oy} x2={W - 20} y2={oy} stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        <line x1={ox} y1={H - 20} x2={ox} y2={24} stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        <line x1={tipX} y1={tipY} x2={tipX} y2={oy} stroke="var(--color-cobalt)" strokeWidth="1.5" strokeDasharray="5 4" />
        <line x1={ox} y1={oy} x2={tipX} y2={oy} stroke="var(--color-pine)" strokeWidth="1.5" strokeDasharray="5 4" />
        <line x1={ox} y1={oy} x2={tipX} y2={tipY} stroke="var(--color-ember)" strokeWidth="3" />
        <polygon points={headPoints(tipX, tipY, Math.atan2(dyv, dxv))} fill="var(--color-ember)" />
        <circle cx={tipX} cy={tipY} r="5" fill="var(--color-ember)" />
        <text x={(ox + tipX) / 2} y={oy + 18} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--color-pine)">
          Fx = {fx.toFixed(2)}
        </text>
        <text x={tipX + 10} y={(oy + tipY) / 2} fontSize="12" fontWeight="700" fill="var(--color-cobalt)">
          Fy = {fy.toFixed(2)}
        </text>
        <text x={tipX + 8} y={tipY - 10} fontSize="12" fontWeight="700" fill="var(--color-ember)">
          F = {mag.toFixed(1)}
        </text>
        <text x={W - 18} y={oy + 18} textAnchor="end" fontSize="12" fill="var(--color-ink-faint)">
          drag the arrow
        </text>
      </svg>
      <div className="flex flex-wrap items-center gap-4 border-t border-[color:var(--card-line)] bg-[color:var(--paper)] px-4 py-3">
        <label className="flex min-w-[170px] flex-1 items-center gap-2 font-mono text-[12px] text-[color:var(--ink-soft)]">
          θ
          <input
            type="range"
            min={0}
            max={90}
            step={1}
            value={angle}
            onChange={(e) => setAngle(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Angle"
          />
        </label>
        <label className="flex min-w-[170px] flex-1 items-center gap-2 font-mono text-[12px] text-[color:var(--ink-soft)]">
          F
          <input
            type="range"
            min={1}
            max={10}
            step={0.1}
            value={mag}
            onChange={(e) => setMag(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Magnitude"
          />
        </label>
        <span className="font-mono text-[12px] font-bold text-[color:var(--ink-soft)]">
          θ = {angle.toFixed(0)}° · F = {mag.toFixed(1)}
        </span>
      </div>
      <p className="border-t border-[color:var(--card-line)] px-4 py-3 text-[13px] text-[color:var(--ink-soft)]">
        The arrow is one thing. The dashed legs are what the axes can see of it:
        Fx = F cos θ and Fy = F sin θ. Nothing was added or lost — the components are
        the same arrow in a different pair of clothes.
      </p>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* KIND: plot — a line you tilt, with slope and intercept read live.   */
/* ------------------------------------------------------------------ */

function LineSlope({ params }: { params?: Record<string, number> }) {
  const [slope, setSlope] = useState(clamp(params?.slope ?? 1, -3, 3));
  const [intercept, setIntercept] = useState(clamp(params?.intercept ?? 0, -4, 4));
  const clipId = useId().replace(/:/g, "");

  const W = 420;
  const H = 300;
  const ML = 44;
  const MR = 16;
  const MT = 18;
  const MB = 34;
  const xMin = -5;
  const xMax = 5;
  const yMin = -5;
  const yMax = 5;
  const sx = (x: number) => ML + ((x - xMin) / (xMax - xMin)) * (W - ML - MR);
  const sy = (y: number) => H - MB - ((y - yMin) / (yMax - yMin)) * (H - MB - MT);
  const yAt = (x: number) => slope * x + intercept;

  const x0 = 1;
  const x1 = 3;
  const rise = slope * (x1 - x0);

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full select-none">
        <defs>
          <clipPath id={clipId}>
            <rect x={ML} y={MT} width={W - ML - MR} height={H - MT - MB} />
          </clipPath>
        </defs>
        {[-4, -3, -2, -1, 1, 2, 3, 4].map((x) => (
          <line key={`vx${x}`} x1={sx(x)} y1={MT} x2={sx(x)} y2={H - MB} stroke="var(--color-deep-line)" strokeOpacity="0.12" />
        ))}
        {[-4, -3, -2, -1, 1, 2, 3, 4].map((y) => (
          <line key={`hy${y}`} x1={ML} y1={sy(y)} x2={W - MR} y2={sy(y)} stroke="var(--color-deep-line)" strokeOpacity="0.12" />
        ))}
        <g clipPath={`url(#${clipId})`}>
          <line x1={sx(xMin)} y1={sy(yAt(xMin))} x2={sx(xMax)} y2={sy(yAt(xMax))} stroke="var(--color-pine)" strokeWidth="3" />
          <line x1={sx(x0)} y1={sy(yAt(x0))} x2={sx(x1)} y2={sy(yAt(x0))} stroke="var(--color-cobalt)" strokeWidth="2" strokeDasharray="5 4" />
          <line x1={sx(x1)} y1={sy(yAt(x0))} x2={sx(x1)} y2={sy(yAt(x1))} stroke="var(--color-ember)" strokeWidth="2" strokeDasharray="5 4" />
        </g>
        <line x1={ML} y1={sy(0)} x2={W - MR} y2={sy(0)} stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        <line x1={sx(0)} y1={MT} x2={sx(0)} y2={H - MB} stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        <circle cx={sx(0)} cy={sy(intercept)} r="5.5" fill="var(--color-ember)" />
        <text x={sx(0) + 8} y={sy(intercept) - 8} fontSize="12" fontWeight="700" fill="var(--color-ember)">
          b = {intercept.toFixed(1)}
        </text>
        <text x={W - MR} y={sy(0) - 8} textAnchor="end" fontSize="12" fill="var(--color-ink-faint)">
          x
        </text>
        <text x={ML + 6} y={MT + 12} fontSize="12" fill="var(--color-ink-faint)">
          y
        </text>
        <text x={sx((x0 + x1) / 2)} y={sy(yAt(x0)) + (slope >= 0 ? 16 : -8)} textAnchor="middle" fontSize="11" fill="var(--color-cobalt)">
          run = {x1 - x0}
        </text>
        <text x={sx(x1) + 8} y={(sy(yAt(x0)) + sy(yAt(x1))) / 2} fontSize="11" fill="var(--color-ember)">
          rise = {rise.toFixed(1)}
        </text>
      </svg>
      <div className="flex flex-wrap items-center gap-4 border-t border-[color:var(--card-line)] bg-[color:var(--paper)] px-4 py-3">
        <label className="flex min-w-[170px] flex-1 items-center gap-2 font-mono text-[12px] text-[color:var(--ink-soft)]">
          m
          <input
            type="range"
            min={-3}
            max={3}
            step={0.1}
            value={slope}
            onChange={(e) => setSlope(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Slope"
          />
        </label>
        <label className="flex min-w-[170px] flex-1 items-center gap-2 font-mono text-[12px] text-[color:var(--ink-soft)]">
          b
          <input
            type="range"
            min={-4}
            max={4}
            step={0.1}
            value={intercept}
            onChange={(e) => setIntercept(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Intercept"
          />
        </label>
        <span className="font-mono text-[12px] font-bold text-[color:var(--ink-soft)]">
          y = {slope.toFixed(1)}x {intercept >= 0 ? "+" : "−"} {Math.abs(intercept).toFixed(1)}
        </span>
      </div>
      <p className="border-t border-[color:var(--card-line)] px-4 py-3 text-[13px] text-[color:var(--ink-soft)]">
        Slope is rise over run: move one unit right and the line climbs m units. The
        intercept is where it crosses x = 0. Change b and the line slides; change m and it
        tilts — two dials, two different jobs.
      </p>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* KIND: oscillation — a live trace you can stretch and slow down.     */
/* ------------------------------------------------------------------ */

function Oscillation({ params }: { params?: Record<string, number> }) {
  const [amp, setAmp] = useState(clamp(params?.amplitude ?? 1, 0.2, 1));
  const [period, setPeriod] = useState(clamp(params?.period ?? 2, 0.5, 4));
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setT((prev) => (prev + dt) % (2 * period));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, period]);

  const W = 420;
  const H = 280;
  const ML = 46;
  const MR = 16;
  const MT = 24;
  const MB = 38;
  const span = 2 * period;
  const sx = (time: number) => ML + (time / span) * (W - ML - MR);
  const sy = (y: number) => H - MB - ((y + 1.08) / 2.16) * (H - MB - MT);
  const yAt = (time: number) => amp * Math.sin((2 * Math.PI * time) / period);

  const path = useMemo(() => {
    let d = "";
    const n = 220;
    for (let i = 0; i <= n; i += 1) {
      const time = (span * i) / n;
      d += `${i === 0 ? "M" : "L"}${sx(time).toFixed(1)} ${sy(yAt(time)).toFixed(1)}`;
    }
    return d;
  }, [amp, period]);

  const freq = 1 / period;
  const omega = (2 * Math.PI) / period;
  const cursorY = yAt(t);

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--card-line)] bg-[color:var(--card-surface)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full select-none">
        {[-amp, 0, amp].map((y, i) => (
          <line
            key={i}
            x1={ML}
            y1={sy(y)}
            x2={W - MR}
            y2={sy(y)}
            stroke="var(--color-mist-soft)"
            strokeWidth={y === 0 ? 1.5 : 1}
            strokeDasharray={y === 0 ? undefined : "5 4"}
          />
        ))}
        <line x1={ML} y1={MT} x2={ML} y2={H - MB} stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        <line x1={ML} y1={H - MB} x2={W - MR} y2={H - MB} stroke="var(--color-mist-soft)" strokeWidth="1.5" />
        <path d={path} fill="none" stroke="var(--color-pine)" strokeWidth="2.5" />
        <line x1={sx(t)} y1={MT} x2={sx(t)} y2={H - MB} stroke="var(--color-ember)" strokeWidth="1.5" strokeDasharray="4 3" />
        <circle cx={sx(t)} cy={sy(cursorY)} r="7" fill="var(--color-ember)" />
        <text x={ML - 8} y={sy(amp) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-faint)">
          +A
        </text>
        <text x={ML - 8} y={sy(-amp) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-faint)">
          −A
        </text>
        <text x={W - MR} y={H - MB + 22} textAnchor="end" fontSize="12" fill="var(--color-ink-faint)">
          time t (s)
        </text>
        <text x={sx(period)} y={H - MB + 22} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-cobalt)">
          T = {period.toFixed(2)} s
        </text>
      </svg>
      <div className="flex flex-wrap items-center gap-4 border-t border-[color:var(--card-line)] bg-[color:var(--paper)] px-4 py-3">
        <label className="flex min-w-[150px] flex-1 items-center gap-2 font-mono text-[12px] text-[color:var(--ink-soft)]">
          A
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.01}
            value={amp}
            onChange={(e) => setAmp(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Amplitude"
          />
        </label>
        <label className="flex min-w-[150px] flex-1 items-center gap-2 font-mono text-[12px] text-[color:var(--ink-soft)]">
          T
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.05}
            value={period}
            onChange={(e) => setPeriod(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Period"
          />
        </label>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="rounded-md border border-[color:var(--card-line)] bg-[color:var(--card-surface)] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-[color:var(--ink-soft)]"
        >
          {playing ? "pause" : "play"}
        </button>
      </div>
      <p className="border-t border-[color:var(--card-line)] px-4 py-3 text-[13px] text-[color:var(--ink-soft)]">
        f = 1/T = {freq.toFixed(2)} Hz · ω = 2π/T = {omega.toFixed(2)} rad/s. Stretch the
        amplitude and the trace gets taller while the period — the time between peaks —
        does not move. That independence is the whole point of simple harmonic motion.
      </p>
    </div>
  );
}




/* ------------------------------------------------------------------ */

/* The one entry point. `scene` is a registered id from scenes.ts and wins over
   `kind`; a record written before the registry only carries `kind`, which is
   why both are accepted here. Unknown input draws nothing rather than a broken
   frame. */
export function CardVisual({
  kind,
  scene,
  params,
}: {
  kind: string;
  scene?: string;
  params?: Record<string, number>;
}) {
  if (scene === "rotation-disk" || kind === "disk") return <RotatingDisk params={params} />;
  if (scene === "vector-components" || kind === "vector") return <VectorComponents params={params} />;
  if (scene === "line-slope" || kind === "plot") return <LineSlope params={params} />;
  if (scene === "oscillation" || kind === "oscillation") return <Oscillation params={params} />;
  if (scene === "energy-bars" || kind === "bars") return <Bars />;
  if (scene === "work-area" || kind === "area") return <Area params={params} />;
  if (scene === "energy-landscape" || kind === "landscape") return <Landscape params={params} />;
  return null;
}

