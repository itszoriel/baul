"use client";

import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { cropToAvatar } from "@/lib/image";
import { Button, Modal } from "./ui";

/**
 * Circular avatar crop (spec §2.4): react-easy-crop over the chosen photo,
 * canvas re-encode to 512×512 WebP (strips EXIF/GPS client-side).
 */
export function AvatarCropper({
  imageSrc,
  onCancel,
  onCropped,
}: {
  imageSrc: string | null;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!imageSrc || !area) return;
    setBusy(true);
    try {
      onCropped(await cropToAvatar(imageSrc, area));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={Boolean(imageSrc)} onClose={onCancel}>
      <h3 className="font-display text-lg text-starlight">Frame your photo</h3>
      <div className="relative mt-4 h-[min(72vw,16rem)] w-full overflow-hidden rounded-2xl bg-night">
        {imageSrc && (
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        )}
      </div>
      <input
        type="range"
        min={1}
        max={3}
        step={0.05}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        className="mt-4 w-full accent-[var(--brass)]"
        aria-label="Zoom"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={confirm} disabled={busy || !area}>{busy ? "Framing…" : "Use this photo"}</Button>
      </div>
    </Modal>
  );
}
