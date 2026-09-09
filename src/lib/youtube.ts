/**
 * YouTube link handling for the shared soundtrack. A YouTube URL can't play
 * through an <audio> element — it must go through YouTube's IFrame player —
 * so songs are routed to the right backend by extracting the video id.
 */

const YOUTUBE_ID = /^[\w-]{11}$/;

function validId(value: string | null | undefined): string | null {
  return value && YOUTUBE_ID.test(value) ? value : null;
}

export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "youtu.be") return validId(parsed.pathname.split("/").filter(Boolean)[0]);
  if (
    hostname !== "youtube.com" &&
    !hostname.endsWith(".youtube.com") &&
    hostname !== "youtube-nocookie.com" &&
    !hostname.endsWith(".youtube-nocookie.com")
  ) return null;

  if (parsed.pathname === "/watch") return validId(parsed.searchParams.get("v"));
  const [kind, id] = parsed.pathname.split("/").filter(Boolean);
  if (kind === "shorts" || kind === "embed") return validId(id);
  return null;
}

/** Accept a song link if it's YouTube or looks like a direct audio file. */
export function classifySongUrl(url: string): "youtube" | "audio" | "unsupported" {
  if (youtubeId(url)) return "youtube";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "unsupported";
  }
  if (parsed.protocol !== "https:") return "unsupported";
  if (/\.(mp3|m4a|aac|ogg|opus|wav|flac)(\?.*)?$/i.test(parsed.pathname + parsed.search)) return "audio";
  // Spotify/Apple/Deezer pages can't stream through <audio> either.
  if (/spotify\.com|music\.apple\.com|deezer\.com|soundcloud\.com/i.test(parsed.hostname)) return "unsupported";
  return "unsupported";
}
