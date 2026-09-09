"use client";

import { useEffect, useState } from "react";
import { initials } from "@/lib/avatar-colors";
import { signedUrl } from "@/lib/signed-urls";
import type { Member } from "@/lib/types";
import { cn } from "./ui";

/**
 * Member avatar: signed-URL photo when set, otherwise the auto-assigned
 * color circle with initials (spec §2.4).
 */
export function Avatar({
  member,
  size = 36,
  className,
  ringColor,
}: {
  member: Pick<Member, "display_name" | "avatar_url" | "avatar_color">;
  size?: number;
  className?: string;
  ringColor?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (member.avatar_url) {
      signedUrl(member.avatar_url).then((u) => {
        if (alive) setUrl(u);
      });
    } else {
      queueMicrotask(() => alive && setUrl(null));
    }
    return () => {
      alive = false;
    };
  }, [member.avatar_url]);

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full select-none", className)}
      style={{
        width: size,
        height: size,
        background: url ? "var(--night-2)" : member.avatar_color,
        boxShadow: ringColor ? `0 0 0 2px ${ringColor}` : undefined,
      }}
      title={member.display_name}
    >
      {url ? (
        // Signed storage URL — next/image can't optimize short-lived URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={member.display_name} width={size} height={size} className="size-full object-cover" />
      ) : (
        <span className="font-semibold text-night" style={{ fontSize: size * 0.38 }}>
          {initials(member.display_name)}
        </span>
      )}
    </span>
  );
}
