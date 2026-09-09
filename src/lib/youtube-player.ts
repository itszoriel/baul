export const YOUTUBE_IFRAME_API_URL = "https://www.youtube.com/iframe_api";

export interface YouTubePlayerInstance {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  destroy(): void;
}

export interface YouTubePlayerEvent {
  data: number;
}

export interface YouTubePlayerErrorEvent {
  data: number;
}

export interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: () => void;
        onStateChange: (event: YouTubePlayerEvent) => void;
        onError: (event: YouTubePlayerErrorEvent) => void;
        onAutoplayBlocked: () => void;
      };
    },
  ) => YouTubePlayerInstance;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace & { loaded?: number };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

export function loadYouTubeApi(timeoutMs = 10_000): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    let settled = false;
    let script = document.querySelector<HTMLScriptElement>(`script[src="${YOUTUBE_IFRAME_API_URL}"]`);

    const restoreReadyCallback = () => {
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previousReady;
    };
    const succeed = () => {
      if (settled) return;
      if (!window.YT?.Player) {
        fail(new Error("YouTube's player did not become available."));
        return;
      }
      settled = true;
      clearTimeout(timeout);
      restoreReadyCallback();
      resolve(window.YT);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      restoreReadyCallback();
      script?.remove();
      youtubeApiPromise = null;
      reject(error);
    };
    const ready = () => {
      try {
        previousReady?.();
      } finally {
        succeed();
      }
    };
    const timeout = window.setTimeout(
      () => fail(new Error("YouTube took too long to respond.")),
      timeoutMs,
    );

    window.onYouTubeIframeAPIReady = ready;
    if (!script) {
      script = document.createElement("script");
      script.src = YOUTUBE_IFRAME_API_URL;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("error", () => fail(new Error("YouTube's player could not be loaded.")), {
      once: true,
    });
  });

  return youtubeApiPromise;
}
