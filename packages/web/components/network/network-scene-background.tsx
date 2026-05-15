"use client";

import { useEffect, useState } from "react";

interface NetworkSceneBackgroundProps {
  images: readonly string[];
  intervalMs?: number;
  position?: string;
}

export function NetworkSceneBackground({
  images,
  intervalMs = 9000,
  position = "center center",
}: NetworkSceneBackgroundProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [images.length, intervalMs]);

  return (
    <>
      {images.map((image, index) => (
        <div
          key={image}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-cover transition-opacity duration-[1600ms] ease-out"
          style={{
            backgroundImage: `url('${image}')`,
            backgroundPosition: position,
            opacity: index === activeIndex ? 0.94 : 0,
          }}
        />
      ))}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background: [
            "linear-gradient(90deg, rgba(5, 9, 18, 0.9) 0%, rgba(5, 9, 18, 0.66) 42%, rgba(5, 9, 18, 0.34) 100%)",
            "linear-gradient(180deg, rgba(5, 9, 18, 0.18) 0%, rgba(5, 9, 18, 0.34) 58%, rgba(5, 9, 18, 0.82) 100%)",
          ].join(", "),
        }}
      />
    </>
  );
}
