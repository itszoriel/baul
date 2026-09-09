"use client";

import imageCompression from "browser-image-compression";
import type { Area } from "react-easy-crop";

/**
 * Client-side image pipeline. Canvas re-encoding produces brand-new WebP
 * bytes, so EXIF (including GPS) never leaves the browser; the server
 * additionally validates type and size.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Crop (from react-easy-crop) then compress to a 512×512 WebP avatar. */
export async function cropToAvatar(imageSrc: string, area: Area): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, 512, 512);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("Could not process that image.");
  return blob;
}

/** Compress a photo for the timeline: WebP, ≤2000px, ~1MB target. */
export async function compressPhoto(file: File): Promise<Blob> {
  let out: Blob = await imageCompression(file, {
    maxWidthOrHeight: 2000,
    maxSizeMB: 1,
    fileType: "image/webp",
    useWebWorker: true,
    initialQuality: 0.85,
  });
  // The library returns the ORIGINAL file when converting wouldn't shrink it
  // (small JPEGs/PNGs) — but the server only accepts canvas-re-encoded WebP
  // (that re-encode is what strips EXIF/GPS). Force the conversion.
  if (out.type !== "image/webp") out = await reencodeWebp(file);
  return out;
}

/** Rasterize a custom reaction to a small transparent WebP with no metadata. */
export async function compressSticker(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPEG, or WebP image.');
  }
  const source = URL.createObjectURL(file);
  try {
    const img = await loadImage(source);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) throw new Error('That image could not be read.');
    const scale = Math.min(1, 256 / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88));
    if (!blob) throw new Error('Could not prepare that sticker.');
    if (blob.size > 512 * 1024) throw new Error('That sticker is still too large after processing.');
    return blob;
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function reencodeWebp(file: File): Promise<Blob> {
  const img = await loadImage(URL.createObjectURL(file));
  const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("Could not process that photo.");
  return blob;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
