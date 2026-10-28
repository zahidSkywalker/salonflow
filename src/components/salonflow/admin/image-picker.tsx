"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, Link2, Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Device-first image picker for owner photos.
 * Picks from the phone's gallery/camera, compresses IN THE BROWSER
 * (max 1600px, JPEG ~85%), then stores the bytes in the app's own
 * database via /api/admin/uploads. No third-party storage, no server
 * filesystem — the URL it produces is served from the install itself.
 * A "paste URL" escape hatch stays available for hosted photos.
 */

const SHAPES = {
  wide: "h-32 w-full rounded-xl", // hero shots
  square: "h-28 w-full rounded-xl", // service cards
  avatar: "h-20 w-20 rounded-full", // team portraits
} as const;

const MAX_DIM = 1600;
const KEEP_AS_IS = 400 * 1024; // small PNG/WebP/GIFs pass through untouched

async function compress(file: File): Promise<string> {
  // small files with transparency or animation survive better untouched
  if (file.size <= KEEP_AS_IS && ["image/png", "image/webp", "image/gif"].includes(file.type)) {
    return await fileToDataUrl(file);
  }

  let sourceW = 0;
  let sourceH = 0;
  let draw: CanvasImageSource;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    draw = bitmap;
    sourceW = bitmap.width;
    sourceH = bitmap.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode failed"));
        el.src = url;
      });
      draw = img;
      sourceW = img.naturalWidth;
      sourceH = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const scale = Math.min(1, MAX_DIM / Math.max(sourceW, sourceH));
  const w = Math.max(1, Math.round(sourceW * scale));
  const h = Math.max(1, Math.round(sourceH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(draw, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

interface Props {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  shape?: keyof typeof SHAPES;
  hint?: string;
  className?: string;
}

export default function ImagePicker({ value, onChange, label, shape = "wide", hint, className }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", description: "Pick a photo (JPEG, PNG, WebP or GIF).", variant: "destructive" });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "Photo too large", description: "Even raw phone photos are welcome — but keep it under 25 MB.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await compress(file);
      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mime: file.type, dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      onChange(body.url);
      toast({ title: "Photo saved", description: `${(body.size / 1024).toFixed(0)} KB · stored in your own database.` });
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Something went wrong — try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <label className="text-sm font-medium">{label}</label> : null}
      <div className="flex items-start gap-3">
        {/* preview / dropzone */}
        <button
          type="button"
          onClick={() => !busy && fileRef.current?.click()}
          className={cn(
            "relative group overflow-hidden border border-dashed border-stone-300 bg-stone-50 hover:border-primary/60 hover:bg-accent/40 transition-colors shrink-0",
            SHAPES[shape]
          )}
          title="Choose a photo from your device"
        >
          {busy ? (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </span>
          ) : value ? (
            <img src={value} alt="Current" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-stone-400">
              <ImagePlus className="w-5 h-5" />
              <span className="text-[10px] uppercase tracking-wider">Tap to upload</span>
            </span>
          )}
        </button>

        {/* actions */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
              {value ? "Replace" : "Upload from device"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowUrl((v) => !v)} disabled={busy}>
              <Link2 className="w-3.5 h-3.5 mr-1.5" />URL
            </Button>
            {value ? (
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onChange("")} disabled={busy}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Remove
              </Button>
            ) : null}
          </div>
          {showUrl && (
            <div className="flex gap-1.5">
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://… or /images/…"
                className="h-8 text-xs"
              />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowUrl(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {hint ?? "Photos are compressed in your browser and stored inside the app's own database — nothing leaves this install."}
          </p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}
