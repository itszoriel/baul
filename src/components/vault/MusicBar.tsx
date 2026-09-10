"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Disc3,
  ExternalLink,
  Link2,
  ListMusic,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Trash2,
  TvMinimalPlay,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { Button, Field, Modal, cn } from "@/components/ui";
import { initialPlaybackState, playbackReducer } from "@/lib/playback";
import { signedUrl } from "@/lib/signed-urls";
import { supabaseBrowser } from "@/lib/supabase/client";
import { LIMITS, type SongUploadIntentResult } from "@/lib/domain";
import type { Member, Song } from "@/lib/types";
import { api } from "@/lib/vault-client";
import { classifySongUrl, youtubeId } from "@/lib/youtube";
import {
  loadYouTubeApi,
  type YouTubePlayerInstance,
} from "@/lib/youtube-player";

/**
 * The shared soundtrack (spec §2.3): persistent bottom bar with play/pause/
 * skip, "added by {name}", a playlist drawer where any member adds (mp3
 * upload, YouTube link, or direct audio link) and removes songs. YouTube
 * songs play through the official IFrame player (an <audio> tag cannot
 * stream a YouTube page); everything else through a plain <audio> element.
 */
export function MusicBar({
  songs,
  members,
  vaultId,
  meId,
  playRequest,
  onPlayRequestHandled,
  onSongAdded,
  onSongRemoved,
}: {
  songs: Song[];
  members: Member[];
  vaultId: string;
  meId: string;
  playRequest: string | null;
  onPlayRequestHandled: () => void;
  onSongAdded: (song: Song) => void;
  onSongRemoved: (songId: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [playback, dispatchPlayback] = useReducer(playbackReducer, initialPlaybackState);
  const [listOpen, setListOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [activatedYoutubeId, setActivatedYoutubeId] = useState<string | null>(null);
  const [youtubePanelVisible, setYoutubePanelVisible] = useState(false);
  const [youtubePanelCompact, setYoutubePanelCompact] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [youtubeAttempt, setYoutubeAttempt] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioFailedRef = useRef(false);
  const youtubePlayerRef = useRef<YouTubePlayerController>(null);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const normalizedIndex = songs.length > 0 ? index % songs.length : 0;
  const current: Song | undefined = songs[normalizedIndex];
  const currentYtId = youtubeId(current?.source_url);
  const confirmedPlaying = playback.status === "playing";
  const awaitingPlayback = playback.desiredPlaying && !confirmedPlaying;

  function showAndRequestYouTubePlayback(retry = false) {
    flushSync(() => {
      setActivatedYoutubeId(currentYtId);
      setYoutubePanelVisible(true);
      setYoutubePanelCompact(false);
      setYoutubeReady((ready) => (retry ? false : ready));
      if (retry) setYoutubeAttempt((attempt) => attempt + 1);
      dispatchPlayback({ type: "request-play" });
    });
    // Once the API is ready this call stays inside the keeper's click event,
    // which gives browsers the strongest possible autoplay signal.
    youtubePlayerRef.current?.play();
  }

  function requestPlay() {
    if (!current) return;
    if (currentYtId) {
      showAndRequestYouTubePlayback(playback.status === "error");
      return;
    }
    audioFailedRef.current = false;
    dispatchPlayback({ type: "request-play" });
  }

  function requestPause() {
    dispatchPlayback({ type: "request-pause" });
    if (currentYtId) {
      youtubePlayerRef.current?.pause();
      setYoutubePanelVisible(false);
      setYoutubePanelCompact(false);
    } else {
      audioRef.current?.pause();
    }
  }

  function togglePlayback() {
    if (playback.desiredPlaying || confirmedPlaying) requestPause();
    else requestPlay();
  }

  const selectSong = useCallback((nextIndex: number, continuePlaying: boolean) => {
    const nextSong = songs[nextIndex];
    const nextYoutubeId = youtubeId(nextSong?.source_url);
    setIndex(nextIndex);
    setYoutubeReady(Boolean(nextYoutubeId && youtubePlayerRef.current?.isReady()));
    setYoutubePanelVisible(Boolean(nextYoutubeId && continuePlaying));
    setYoutubePanelCompact(false);
    setActivatedYoutubeId(nextYoutubeId && continuePlaying ? nextYoutubeId : null);
    dispatchPlayback({ type: "source-changed", continuePlaying });
  }, [songs]);

  // A memory card asked for its attached song.
  useEffect(() => {
    if (!playRequest) return;
    const i = songs.findIndex((s) => s.id === playRequest);
    onPlayRequestHandled();
    if (i === -1) return;
    queueMicrotask(() => {
      selectSong(i, true);
    });
  }, [playRequest, songs, onPlayRequestHandled, selectSong]);

  // Resolve + load the current source into the <audio> element (non-YouTube).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current || currentYtId) {
      audio.pause();
      audio.removeAttribute("src");
      return;
    }
    let alive = true;
    (async () => {
      const src = current.file_url ? await signedUrl(current.file_url) : current.source_url;
      if (!alive || !src) return;
      if (audio.src !== src) audio.src = src;
      if (playback.desiredPlaying) {
        audio.play().catch(() => {
          if (alive) {
            audioFailedRef.current = true;
            dispatchPlayback({ type: "error", message: "This audio file could not be played." });
          }
        });
      }
      else audio.pause();
    })();
    return () => {
      alive = false;
    };
  }, [current, currentYtId, playback.desiredPlaying]);

  function skip(delta: number) {
    if (songs.length === 0) return;
    const nextIndex = (normalizedIndex + delta + songs.length) % songs.length;
    selectSong(nextIndex, playback.desiredPlaying || confirmedPlaying);
  }

  async function removeSong(song: Song) {
    if (!confirm(`Take “${song.title}” out of the soundtrack?`)) return;
    const { error } = await supabaseBrowser().from("songs").delete().eq("id", song.id);
    if (!error) onSongRemoved(song.id);
  }

  return (
    <>
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-brass/15 bg-[#201912]/97 shadow-[0_-16px_40px_rgba(0,0,0,.2)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-1.5 px-3 py-2 sm:gap-3 sm:px-4">
          <span
            aria-hidden
            className={cn(
              "hidden size-10 shrink-0 place-items-center rounded-full border border-brass/15 bg-night text-brass xs:grid",
              confirmedPlaying && "vinyl-spin",
            )}
          >
            <Disc3 className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            {current ? (
              <>
                <p className="truncate text-[13px] font-medium text-starlight sm:text-sm">{current.title}</p>
                <p className="hidden truncate text-xs text-dim xs:block">
                  added by {memberById.get(current.added_by)?.display_name ?? "someone"}
                </p>
              </>
            ) : (
              <p className="text-sm text-dim">The soundtrack is empty — add the first song.</p>
            )}
          </div>

          {current && (
            <div className="flex items-center">
              <BarButton label="Previous song" onClick={() => skip(-1)}>
                <SkipBack className="size-4" />
              </BarButton>
              <BarButton
                label={confirmedPlaying || awaitingPlayback ? "Pause" : "Play"}
                onClick={togglePlayback}
                primary
              >
                {confirmedPlaying ? (
                  <Pause className="size-4" />
                ) : awaitingPlayback ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Play className="ml-0.5 size-4" />
                )}
              </BarButton>
              <BarButton label="Next song" onClick={() => skip(1)}>
                <SkipForward className="size-4" />
              </BarButton>
            </div>
          )}

          <button
            onClick={() => {
              if (!listOpen && currentYtId && youtubePanelVisible) requestPause();
              setListOpen((open) => !open);
            }}
            aria-label="Open the playlist"
            aria-expanded={listOpen}
            className={cn(
              "flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors sm:px-3 sm:text-sm",
              listOpen ? "bg-white/10 text-starlight" : "text-dim hover:text-starlight",
            )}
          >
            <ListMusic className="size-4" /> {songs.length}
          </button>
        </div>
      </div>

      <audio
        ref={audioRef}
        onEnded={() => skip(1)}
        onPause={() => {
          if (!currentYtId && !audioFailedRef.current) dispatchPlayback({ type: "paused" });
        }}
        onPlay={() => {
          audioFailedRef.current = false;
          dispatchPlayback({ type: "playing" });
        }}
        onError={() => {
          if (!currentYtId) {
            audioFailedRef.current = true;
            dispatchPlayback({ type: "error", message: "This audio file could not be played." });
          }
        }}
      />

      {/* Contact YouTube only after a keeper explicitly asks to play. */}
      {currentYtId && activatedYoutubeId === currentYtId && (
        <section
          hidden={!youtubePanelVisible}
          aria-label={`YouTube player for ${current?.title ?? "the selected song"}`}
          className={cn(
            "fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 z-30 overflow-hidden border border-brass/30 bg-[#21170f] shadow-2xl shadow-black/60 transition-[width,border-radius] duration-200",
            youtubePanelCompact
              ? "w-[200px] rounded-xl"
              : "w-[calc(100vw-1.5rem)] max-w-[480px] rounded-2xl",
          )}
        >
          <div className={cn("flex items-center border-b border-brass/20 bg-[#2a1d13]", youtubePanelCompact ? "gap-2 px-2.5 py-2" : "gap-3 px-4 py-3")}>
            <span aria-hidden className={cn("shrink-0 place-items-center rounded-full border border-brass/30 text-brass-2", youtubePanelCompact ? "hidden" : "grid size-8")}>
              <TvMinimalPlay className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm text-starlight">{current?.title}</p>
              <p className={cn("uppercase text-brass/75", youtubePanelCompact ? "text-[9px] tracking-[0.1em]" : "text-[11px] tracking-[0.16em]")}>
                {confirmedPlaying ? "Playing from YouTube" : playback.status === "loading" ? "Opening YouTube" : "YouTube player"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setYoutubePanelCompact((compact) => !compact)}
              className="grid size-9 cursor-pointer place-items-center rounded-full text-dim transition-colors hover:bg-white/8 hover:text-starlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
              aria-label={youtubePanelCompact ? "Restore the YouTube player" : "Minimize the YouTube player while it keeps playing"}
            >
              {youtubePanelCompact ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          </div>

          {!youtubeReady && playback.status !== "error" && (
            <div
              className="grid min-h-[200px] place-items-center px-6 text-center sm:aspect-video sm:min-h-0"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <div>
                <LoaderCircle className="mx-auto size-6 animate-spin text-brass-2" />
                <p className="mt-3 text-sm text-starlight">Opening this song…</p>
                <p className="mt-1 text-xs text-dim">The YouTube player is getting ready.</p>
              </div>
            </div>
          )}

          {playback.status === "error" && !youtubeReady ? (
            <PlaybackFailure
              message={playback.message}
              videoId={currentYtId}
              onRetry={() => showAndRequestYouTubePlayback(true)}
            />
          ) : (
            <div className={cn(!youtubeReady && "h-0 overflow-hidden", youtubePanelCompact && "[&>iframe]:h-[200px] [&>iframe]:w-[200px]")}>
              <YouTubePlayer
                key={youtubeAttempt}
                ref={youtubePlayerRef}
                videoId={currentYtId}
                shouldPlay={playback.desiredPlaying}
                onReady={() => setYoutubeReady(true)}
                onPlaying={() => dispatchPlayback({ type: "playing" })}
                onPaused={() => {
                  dispatchPlayback({ type: "paused" });
                  setYoutubePanelVisible(false);
                  setYoutubePanelCompact(false);
                }}
                onBlocked={() => dispatchPlayback({ type: "blocked" })}
                onError={(message) => dispatchPlayback({ type: "error", message })}
                onEnded={() => skip(1)}
              />
            </div>
          )}

          {youtubeReady && (playback.status === "blocked" || playback.status === "error") && (
            <div className="border-t border-brass/20 bg-[#2a1d13] px-4 py-3" role="alert" aria-live="assertive">
              <p className="text-sm text-starlight">{playback.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => showAndRequestYouTubePlayback(playback.status === "error")}>
                  <RotateCcw className="size-3.5" /> Try again
                </Button>
                <a
                  href={`https://www.youtube.com/watch?v=${currentYtId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-brass-2 transition-colors hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
                >
                  Watch on YouTube <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          )}
        </section>
      )}

      {!currentYtId && playback.status === "error" && current && (
        <div
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-30 flex w-[min(92vw,420px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-red-300/25 bg-night-2 px-4 py-3 shadow-xl"
          role="alert"
        >
          <p className="min-w-0 flex-1 text-sm text-starlight">{playback.message}</p>
          <Button size="sm" onClick={requestPlay}>Retry</Button>
        </div>
      )}

      {/* playlist drawer */}
      <AnimatePresence>
        {listOpen && (
          <motion.div
            role="region"
            aria-label="Soundtrack playlist"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 max-h-[68dvh] rounded-t-3xl border border-b-0 border-brass/20 bg-night-2/98 p-4 pb-5 shadow-2xl shadow-black/60 sm:inset-x-auto sm:bottom-16 sm:left-1/2 sm:w-[min(92vw,420px)] sm:-translate-x-1/2 sm:rounded-2xl sm:border-b sm:p-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-display text-starlight">Our soundtrack</h4>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="size-3.5" /> Add a song
              </Button>
            </div>
            <ul className="mt-3 max-h-[50dvh] space-y-1 overflow-y-auto overscroll-contain">
              {songs.map((s, i) => (
                <li key={s.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => {
                      setListOpen(false);
                      selectSong(i, true);
                    }}
                    className={cn(
                      "flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/10",
                      i === normalizedIndex ? "text-brass-2" : "text-starlight",
                    )}
                  >
                    <span className="shrink-0 text-dim">
                      {youtubeId(s.source_url) ? <TvMinimalPlay className="size-4" /> : <Music2 className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{s.title}</span>
                      <span className="block truncate text-xs text-dim">
                        added by {memberById.get(s.added_by)?.display_name ?? "someone"}
                      </span>
                    </span>
                    {i === normalizedIndex && confirmedPlaying && <Disc3 className="size-4 shrink-0 animate-spin text-brass" />}
                  </button>
                  <button
                    onClick={() => removeSong(s)}
                    className="min-h-10 min-w-10 cursor-pointer rounded-lg p-2 text-dim/70 transition-all hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label={`Remove ${s.title}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
              {songs.length === 0 && <p className="py-4 text-center text-sm text-dim">Nothing here yet.</p>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <AddSongModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        vaultId={vaultId}
        meId={meId}
        onSongAdded={onSongAdded}
      />
    </>
  );
}

function BarButton({
  children,
  label,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid size-10 cursor-pointer place-items-center rounded-full transition-colors",
        primary ? "accent-fill text-night" : "text-dim hover:text-starlight",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// YouTube IFrame player (https://developers.google.com/youtube/iframe_api_reference)

function PlaybackFailure({
  message,
  videoId,
  onRetry,
}: {
  message: string | null;
  videoId: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid min-h-[200px] place-items-center px-6 py-8 text-center sm:aspect-video sm:min-h-0" role="alert">
      <div>
        <p className="font-display text-lg text-starlight">The song stayed closed.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-dim">
          {message ?? "YouTube could not open this song. Try again or watch it there."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={onRetry}>
            <RotateCcw className="size-3.5" /> Try again
          </Button>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-brass-2 transition-colors hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          >
            Watch on YouTube <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

interface YouTubePlayerController {
  play(): void;
  pause(): void;
  isReady(): boolean;
}

interface YouTubePlayerProps {
  videoId: string;
  shouldPlay: boolean;
  onReady: () => void;
  onPlaying: () => void;
  onPaused: () => void;
  onBlocked: () => void;
  onError: (message: string) => void;
  onEnded: () => void;
}

const YouTubePlayer = forwardRef<YouTubePlayerController, YouTubePlayerProps>(function YouTubePlayer({
  videoId,
  shouldPlay,
  onReady,
  onPlaying,
  onPaused,
  onBlocked,
  onError,
  onEnded,
}, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const loadedIdRef = useRef(videoId);
  const [ready, setReady] = useState(false);

  // Callbacks live in refs so the (once-created) player never sees stale ones.
  const cb = useRef({ onReady, onPlaying, onPaused, onBlocked, onError, onEnded });
  useEffect(() => {
    cb.current = { onReady, onPlaying, onPaused, onBlocked, onError, onEnded };
  }, [onBlocked, onEnded, onError, onPaused, onPlaying, onReady]);

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo(),
    pause: () => playerRef.current?.pauseVideo(),
    isReady: () => ready,
  }), [ready]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    const mount = document.createElement("div");
    host.appendChild(mount);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(mount, {
          videoId: loadedIdRef.current,
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => {
              if (cancelled) return;
              setReady(true);
              cb.current.onReady();
            },
            onStateChange: (event) => {
              if (event.data === 0) cb.current.onEnded(); // ENDED
              else if (event.data === 1) cb.current.onPlaying(); // PLAYING
              else if (event.data === 2) cb.current.onPaused(); // PAUSED
            },
            onError: () => cb.current.onError("YouTube could not play this video here."),
            onAutoplayBlocked: () => cb.current.onBlocked(),
          },
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          cb.current.onError(error instanceof Error ? error.message : "YouTube's player could not be loaded.");
        }
      });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      host.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!ready || !p) return;
    if (loadedIdRef.current !== videoId) {
      loadedIdRef.current = videoId;
      if (shouldPlay) p.loadVideoById(videoId);
      else p.cueVideoById(videoId);
      return;
    }
    if (shouldPlay) p.playVideo();
  }, [videoId, shouldPlay, ready]);

  return (
    <div className="aspect-video min-h-[200px] w-full bg-black">
      <div ref={hostRef} className="size-full [&>div]:size-full [&_iframe]:size-full" />
    </div>
  );
});

// ---------------------------------------------------------------------------

function AddSongModal({
  open,
  onClose,
  vaultId,
  meId,
  onSongAdded,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  meId: string;
  onSongAdded: (song: Song) => void;
}) {
  const [mode, setMode] = useState<"link" | "file">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!title.trim()) throw new Error("Give the song a title.");
      if (mode === "file") {
        if (!file) throw new Error("Choose an MP3 first.");
        if (file.size > LIMITS.songBytes) throw new Error("That file is too large (max 15MB).");
        if (file.type && file.type !== "audio/mpeg" && file.type !== "audio/mp3") {
          throw new Error("Only MP3 files can be uploaded.");
        }
        const intent = await api<SongUploadIntentResult>("/api/media/song/upload-intent", {
          vaultId,
          title: title.trim(),
          size: file.size,
          mimeType: file.type || "audio/mpeg",
        });
        const { error: uploadError } = await supabaseBrowser().storage
          .from("music")
          .uploadToSignedUrl(intent.path, intent.token, file, {
            contentType: "audio/mpeg",
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) throw new Error("The MP3 could not be uploaded. Try again.");
        const completed = await api<{ song: Song }>("/api/media/song/complete", {
          uploadId: intent.uploadId,
        });
        onSongAdded(completed.song);
      } else {
        const link = url.trim();
        if (!link) throw new Error("Paste a link to the song.");
        if (classifySongUrl(link) === "unsupported") {
          throw new Error("That link can't play here — paste a YouTube link or a direct audio link, or upload an MP3.");
        }
        const { data: song, error: insErr } = await supabaseBrowser()
          .from("songs")
          .insert({
            vault_id: vaultId,
            added_by: meId,
            title: title.trim(),
            source_url: link,
          })
          .select("id, vault_id, added_by, title, source_url, file_url, created_at")
          .single();
        if (insErr || !song) throw new Error("Could not add the song. Try again.");
        onSongAdded(song);
      }
      setTitle("");
      setUrl("");
      setFile(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <p className="section-kicker">Shared soundtrack</p>
      <h3 className="mt-1 font-display text-2xl text-starlight">Add a song</h3>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-black/15 p-1" role="tablist" aria-label="Song source">
        {(
          [
            { value: "link", label: "From a link", icon: <Link2 className="size-4" /> },
            { value: "file", label: "Upload an MP3", icon: <Music2 className="size-4" /> },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={mode === t.value}
            onClick={() => {
              setMode(t.value);
              setError(null);
            }}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors",
              mode === t.value ? "accent-fill font-medium text-night" : "glass text-dim hover:text-starlight",
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        {mode === "link" ? (
          <>
            <Field
              label="Link to the song"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtu.be/… or a direct audio link"
              autoFocus
            />
            <p className="text-xs text-dim/70">YouTube links play right in the baul. Spotify links can&apos;t, sorry.</p>
          </>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-sm text-dim">MP3 file (max 15MB)</span>
            <input
              type="file"
              accept="audio/mpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer text-sm text-dim file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:text-starlight"
            />
          </label>
        )}

        <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Song — Artist" />

        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
          <Button variant="ghost" type="button" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button type="submit" disabled={busy} className="w-full sm:w-auto">{busy ? "Adding…" : "Add song"}</Button>
        </div>
      </form>
    </Modal>
  );
}
