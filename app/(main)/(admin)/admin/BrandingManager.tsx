"use client";

import { useState } from "react";
import FileUpload from "@/components/ui/FileUpload";

interface Slide {
  id: string;
  mediaUrl: string;
  mediaType: string;
  title: string | null;
  text: string | null;
}

export default function BrandingManager({
  initialLogoUrl,
  initialSlides,
}: {
  initialLogoUrl: string;
  initialSlides: Slide[];
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [logoSaved, setLogoSaved] = useState(false);
  const [slides, setSlides] = useState(initialSlides);

  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newMediaType, setNewMediaType] = useState<"image" | "video">("image");
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);

  async function saveLogo() {
    if (!logoUrl) return;
    const res = await fetch("/api/admin/site-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl }),
    });
    if (res.ok) {
      setLogoSaved(true);
      setTimeout(() => setLogoSaved(false), 2000);
    }
  }

  async function addSlide() {
    if (!newMediaUrl) return;
    setAdding(true);
    const res = await fetch("/api/admin/carousel-slides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaUrl: newMediaUrl,
        mediaType: newMediaType,
        title: newTitle || undefined,
        text: newText || undefined,
      }),
    });
    if (res.ok) {
      const slide = await res.json();
      setSlides((prev) => [...prev, slide]);
      setNewMediaUrl("");
      setNewTitle("");
      setNewText("");
    }
    setAdding(false);
  }

  async function removeSlide(id: string) {
    const res = await fetch(`/api/admin/carousel-slides/${id}`, { method: "DELETE" });
    if (res.ok) setSlides((prev) => prev.filter((s) => s.id !== id));
  }

  const inputClass =
    "bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-3 h-[36px]";

  return (
    <div className="flex flex-col gap-10">
      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-3">
          Site logo
        </p>
        <div className="flex items-center gap-4">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo preview" className="h-10 object-contain" />
          )}
          <FileUpload
            bucket="tournament-assets"
            pathPrefix="branding"
            label="Upload logo"
            onUploaded={setLogoUrl}
          />
          <button
            onClick={saveLogo}
            className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-4 py-2 whitespace-nowrap"
          >
            {logoSaved ? "Saved!" : "Save logo"}
          </button>
        </div>
      </section>

      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-3">
          Auth page carousel ({slides.length})
        </p>

        <div className="flex flex-col gap-2 mb-4">
          {slides.map((s) => (
            <div
              key={s.id}
              className="bg-bk-surface border border-bk-border p-3 flex items-center gap-3"
            >
              {s.mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.mediaUrl} alt="" className="w-16 h-10 object-cover flex-shrink-0" />
              ) : (
                <video src={s.mediaUrl} className="w-16 h-10 object-cover flex-shrink-0" muted />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-sans text-bk-heading text-xs truncate">
                  {s.title || "(no title)"}
                </p>
                <p className="font-sans text-bk-muted text-[11px] truncate">
                  {s.text || "(no text)"}
                </p>
              </div>
              <button
                onClick={() => removeSlide(s.id)}
                className="text-bk-live text-[11px] font-sans uppercase tracking-[0.5px] px-2 flex-shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="bg-bk-surface border border-bk-border p-3">
          <p className="font-sans text-bk-muted text-[11px] uppercase tracking-[0.5px] mb-2">
            Add a slide
          </p>
          <div className="flex gap-2 mb-2">
            <FileUpload
              bucket="tournament-assets"
              pathPrefix="carousel"
              label="Upload image or video"
              accept="image/*,video/*"
              onUploaded={(url) => {
                setNewMediaUrl(url);
                setNewMediaType(url.match(/\.(mp4|webm|mov)$/i) ? "video" : "image");
              }}
            />
          </div>
          <div className="flex gap-2 mb-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title (optional)"
              className={inputClass + " flex-1"}
            />
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Text (optional)"
              className={inputClass + " flex-1"}
            />
          </div>
          <button
            onClick={addSlide}
            disabled={!newMediaUrl || adding}
            className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-4 py-2 disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add slide"}
          </button>
        </div>
      </section>
    </div>
  );
}
