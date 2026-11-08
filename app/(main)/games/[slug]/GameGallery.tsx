"use client";

// The pictures on a game's page: one large picture and a row of small ones to pick from.
import { useState } from "react";

export default function GameGallery({ images, name }: { images: string[]; name: string }) {
  const [current, setCurrent] = useState(0);
  if (images.length === 0) return null;
  const active = images[Math.min(current, images.length - 1)];

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={active} alt={`${name} picture ${current + 1} of ${images.length}`} className="w-full max-h-[520px] object-contain bg-bk-bg border border-bk-border" />
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <li key={url} className="shrink-0">
              <button
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Show picture ${i + 1}`}
                aria-current={i === current}
                className={`block border ${i === current ? "border-bk-gold-from" : "border-bk-border opacity-70 hover:opacity-100"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-24 h-16 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
