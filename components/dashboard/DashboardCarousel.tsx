"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export interface CarouselSlide {
  id: string;
  imageUrl: string;
  title: string;
  text: string | null;
  linkUrl: string | null;
  ownerName: string | null;
}

// The big featured carousel at the top of dashboards. Auto-advances every 6s,
// pauses on hover, and has dots + arrows. Renders nothing with zero slides.
export default function DashboardCarousel({ slides }: { slides: CarouselSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(t);
  }, [count, paused]);

  if (count === 0) return null;
  const go = (n: number) => setIndex((n + count) % count);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative w-full overflow-hidden border border-bk-border bg-bk-surface mb-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((s, i) => {
          const body = (
            <div className="relative h-[220px] sm:h-[320px] md:h-[400px] w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
                {s.ownerName && (
                  <p className="font-sans text-[11px] tracking-[1px] uppercase text-bk-gold-light mb-1">
                    {s.ownerName}
                  </p>
                )}
                <h2 className="font-sans font-extrabold text-xl sm:text-3xl text-white">{s.title}</h2>
                {s.text && <p className="font-sans text-[13px] sm:text-sm text-white/80 mt-1 max-w-xl">{s.text}</p>}
              </div>
            </div>
          );
          return (
            <div key={s.id} className="w-full shrink-0" aria-hidden={i !== index}>
              {s.linkUrl ? (
                <Link href={s.linkUrl} target="_blank" rel="noopener noreferrer" tabIndex={i === index ? 0 : -1}>
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white w-9 h-9 text-lg"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white w-9 h-9 text-lg"
          >
            ›
          </button>
          <div className="absolute bottom-2 right-4 flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
