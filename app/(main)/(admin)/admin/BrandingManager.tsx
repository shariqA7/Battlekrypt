"use client";

import { useState } from "react";
import FileUpload from "@/components/ui/FileUpload";
import { buttonClass } from "@/components/ui/Button";

interface Slide {
  id: string;
  mediaUrl: string;
  mediaType: string;
  title: string | null;
  text: string | null;
}

type AssetKey = "logoUrl" | "logoLightUrl" | "shareImageUrl" | "defaultBannerUrl" | "defaultAvatarUrl" | "defaultOrgLogoUrl";
export type BrandAssets = Record<AssetKey, string>;

// One upload slot per brand asset. `wide` previews on a wide, short frame;
// `bg` is the surface the asset is meant to sit on, so it previews correctly.
const SLOTS: { key: AssetKey; title: string; hint: string; preview: "logo-dark" | "logo-light" | "wide" | "square" | "round" }[] = [
  { key: "logoUrl", title: "Logo for dark backgrounds", hint: "Horizontal logo (mark + wordmark). Used in the header, footer and sign-in pages on the dark theme. If it is the only logo uploaded, it is used on the light theme too.", preview: "logo-dark" },
  { key: "logoLightUrl", title: "Logo for light backgrounds", hint: "Same logo, made for the light theme. Leave empty to reuse the dark-background logo.", preview: "logo-light" },
  { key: "shareImageUrl", title: "Default share image (1200 × 630)", hint: "Shown when a link to the site is shared on WhatsApp, Discord, X and similar. Use exactly 1200 × 630 px.", preview: "wide" },
  { key: "defaultBannerUrl", title: "Default tournament banner", hint: "Shown on tournaments whose organizer did not upload a banner.", preview: "wide" },
  { key: "defaultAvatarUrl", title: "Default player avatar", hint: "Shown for players without a photo. Square image; it is shown in a circle.", preview: "round" },
  { key: "defaultOrgLogoUrl", title: "Default organizer / club logo", hint: "Shown for organizers and clubs without a logo. Square, 512 px.", preview: "square" },
];

function AssetSlot({
  slot,
  value,
  onChange,
}: {
  slot: (typeof SLOTS)[number];
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = draft !== value;

  async function save(next: string) {
    setState("saving");
    const res = await fetch("/api/admin/site-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [slot.key]: next || null }),
    });
    if (res.ok) {
      onChange(next);
      setDraft(next);
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
    } else {
      setState("error");
    }
  }

  const frame =
    slot.preview === "logo-dark" ? "bg-[#16130B] h-16 w-56 p-2"
    : slot.preview === "logo-light" ? "bg-[#F6F1E7] h-16 w-56 p-2"
    : slot.preview === "wide" ? "bg-bk-bg h-24 w-44"
    : slot.preview === "round" ? "bg-bk-bg h-20 w-20 rounded-full"
    : "bg-bk-bg h-20 w-20";
  const fit = slot.preview.startsWith("logo") ? "object-contain" : "object-cover";

  return (
    <div className="bg-bk-surface border border-bk-border p-4 flex flex-col gap-3">
      <div>
        <p className="font-sans font-medium text-bk-heading text-sm">{slot.title}</p>
        <p className="font-sans text-bk-muted text-[12px] mt-1">{slot.hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className={`${frame} border border-bk-border overflow-hidden flex items-center justify-center shrink-0`}>
          {draft ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft} alt="" className={`w-full h-full ${fit}`} />
          ) : (
            <span className="font-sans text-[11px] text-bk-muted">Not set</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FileUpload bucket="tournament-assets" pathPrefix="branding" label={draft ? "Replace" : "Upload"} onUploaded={setDraft} />
          <button disabled={!dirty || state === "saving"} onClick={() => save(draft)} className={buttonClass("primary", "sm", "")}>
            {state === "saving" ? "Saving…" : state === "saved" ? "Saved!" : "Save"}
          </button>
          {value && (
            <button disabled={state === "saving"} onClick={() => save("")} className="text-bk-live text-[11px] font-sans uppercase tracking-[0.5px] px-2">
              Reset to default
            </button>
          )}
        </div>
      </div>
      {state === "error" && <p className="font-sans text-[12px] text-bk-live">Could not save. Try again.</p>}
    </div>
  );
}

export default function BrandingManager({
  initialAssets,
  initialSlides,
}: {
  initialAssets: BrandAssets;
  initialSlides: Slide[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [slides, setSlides] = useState(initialSlides);

  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newMediaType, setNewMediaType] = useState<"image" | "video">("image");
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);

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
        <p className="font-sans font-medium text-bk-heading text-sm mb-1">Brand assets</p>
        <p className="font-sans text-bk-muted text-[12px] mb-4">
          Favicon and app icons are not here: they ship with the site code.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {SLOTS.map((slot) => (
            <AssetSlot key={slot.key} slot={slot} value={assets[slot.key]} onChange={(v) => setAssets((p) => ({ ...p, [slot.key]: v }))} />
          ))}
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
            className={buttonClass("primary", "sm", "")}
          >
            {adding ? "Adding..." : "Add slide"}
          </button>
        </div>
      </section>
    </div>
  );
}
