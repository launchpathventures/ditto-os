"use client";

/**
 * Ditto — Dot Particle Canvas
 *
 * Reusable living dot particle field — the Self's visual presence.
 * Canvas-based with IntersectionObserver for performance.
 * Respects prefers-reduced-motion (static fallback).
 *
 * Adopted from P23/P08 prototype JS.
 * Provenance: P23 setup prototype, P08 Day Zero prototype.
 */

import { useEffect, useRef } from "react";

const COLORS = ["#059669", "#059669", "#047857", "#3D5A48", "#10B981"];

interface DotParticlesProps {
  size?: number;
  className?: string;
}

export function DotParticles({ size = 28, className }: DotParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const count = Math.max(8, Math.round(size / 3));
    const maxR = size * 0.35;

    const dots = Array.from({ length: count }, (_, i) => ({
      angle: (Math.PI * 2 / count) * i + Math.random() * 0.3,
      dist: 2 + Math.random() * maxR,
      size: 1 + Math.random() * (size / 16),
      speed: 0.15 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
      breathAmp: 1 + Math.random() * (maxR * 0.3),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      opacity: 0.5 + Math.random() * 0.5,
    }));

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      ctx.clearRect(0, 0, size, size);
      for (const d of dots) {
        const x = cx + Math.cos(d.angle) * d.dist * 0.6;
        const y = cy + Math.sin(d.angle) * d.dist * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, d.size, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.globalAlpha = d.opacity;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    let raf: number | null = null;

    function draw() {
      const t = Date.now() / 1000;
      ctx!.clearRect(0, 0, size, size);
      for (const d of dots) {
        const a = d.angle + t * d.speed;
        const breathe = Math.sin(t * 1.2 + d.phase) * d.breathAmp;
        const r = Math.max(1, d.dist + breathe);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const pulse = 0.6 + Math.sin(t * 2.5 + d.phase) * 0.4;
        ctx!.beginPath();
        ctx!.arc(x, y, d.size, 0, Math.PI * 2);
        ctx!.fillStyle = d.color;
        ctx!.globalAlpha = d.opacity * pulse;
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (!raf) draw();
      } else {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = null;
        }
      }
    });
    observer.observe(canvas);
    draw();

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [size]);

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative", overflow: "hidden" }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
