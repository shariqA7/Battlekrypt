"use client";

// Uploads a file directly to Supabase Storage from the browser and returns
// its public URL. Requires a Storage bucket to exist (see SETUP.md for the
// bucket + RLS policy this needs) — this component doesn't create the bucket.
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface FileUploadProps {
  bucket: string;
  pathPrefix: string; // e.g. "payment-proofs" or "banners"
  onUploaded: (publicUrl: string) => void;
  label: string;
  accept?: string;
  // Private buckets have no public URL: the component then returns the
  // storage PATH instead (used for ID documents, which only admins may view
  // through short-lived signed URLs).
  isPrivate?: boolean;
}

export default function FileUpload({
  bucket,
  pathPrefix,
  onUploaded,
  label,
  accept = "image/*",
  isPrivate = false,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const supabase = createClient();

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setFileName(file.name);

    // Private uploads keep only a safe extension — the original file name
    // (which may contain a person's name) never lands in storage.
    const ext = (file.name.split(".").pop() ?? "jpg").replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "jpg";
    const path = isPrivate
      ? `${pathPrefix}/${crypto.randomUUID()}.${ext}`
      : `${pathPrefix}/${crypto.randomUUID()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file);

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    if (isPrivate) {
      onUploaded(path);
    } else {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onUploaded(data.publicUrl);
    }
    setUploading(false);
  }

  return (
    <div>
      <label className="border border-dashed border-bk-border p-3 flex flex-col items-center justify-center text-center cursor-pointer hover:border-bk-gold-light transition-colors">
        <span className="font-sans text-[11px] text-bk-muted uppercase tracking-[0.5px] mb-1">
          {uploading ? "Uploading..." : fileName ?? label}
        </span>
        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          disabled={uploading}
          className="hidden"
        />
      </label>
      {error && (
        <p className="text-bk-live text-[11px] font-sans mt-1">{error}</p>
      )}
    </div>
  );
}
