"use client";

// Auto-rotating carousel for the right side of the auth pages. Receives
// slides as a prop from the Server Component page (already fetched via
// listCarouselSlides()) rather than fetching itself — consistent with the
// rest of the app's pattern of Server Components doing data fetching and
// passing it down, not duplicating fetches client-side.
import { useState, useEffect } from "react";

interface Slide {
  id: string;
  mediaUrl: string;
  mediaType: string;
  title: string | null;
  text: string | null;
}

export default function AuthCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) {
    // No slides configured yet — a properly designed branded panel instead
    // of an empty box, so the page looks intentional before an admin adds
    // any carousel content.
    return (
      <div className="hidden md:flex flex-1 relative items-center justify-center overflow-hidden rounded-2xl bg-bk-bg">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(244,200,66,0.12), transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(184,134,11,0.10), transparent 55%)",
          }}
        />
        <div className="relative text-center px-12 max-w-md">
          <p className="font-sans font-extrabold text-4xl text-bk-heading mb-4">
            BattleKrypt
          </p>
          <p className="font-sans text-bk-body text-base">
            Compete in tournaments, leagues, and daily scrims. Get paid.
            Get verified.
          </p>
        </div>
      </div>
    );
  }

  const slide = slides[index];

  return (
    <div className="hidden md:block flex-1 relative overflow-hidden rounded-2xl bg-bk-surface">
      {slide.mediaType === "video" ? (
        <video
          key={slide.id}
          src={slide.mediaUrl}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={slide.id}
          src={slide.mediaUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Gradient so title/text stay legible over any image */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

      {(slide.title || slide.text) && (
        <div className="absolute bottom-16 left-10 right-10">
          {slide.title && (
            <p className="font-sans font-extrabold text-2xl text-white mb-2">
              {slide.title}
            </p>
          )}
          {slide.text && (
            <p className="font-sans text-white/80 text-sm max-w-md">{slide.text}</p>
          )}
        </div>
      )}

      {slides.length > 1 && (
        <div className="absolute bottom-6 left-10 flex gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIndex(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1 rounded-full transition-all ${
                i === index ? "w-6 bg-bk-gold-light" : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
