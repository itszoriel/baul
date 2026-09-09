import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeScript {
  src: string;
  async: boolean;
  removed: boolean;
  addEventListener(type: string, listener: () => void): void;
  remove(): void;
  fire(type: string): void;
}

function browserHarness() {
  const scripts: FakeScript[] = [];
  const createScript = (): FakeScript => {
    const listeners = new Map<string, () => void>();
    return {
      src: "",
      async: false,
      removed: false,
      addEventListener: (type, listener) => listeners.set(type, listener),
      remove() {
        this.removed = true;
      },
      fire: (type) => listeners.get(type)?.(),
    };
  };

  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    YT: undefined,
    onYouTubeIframeAPIReady: undefined,
  });
  vi.stubGlobal("document", {
    querySelector: () => scripts.find((script) => !script.removed) ?? null,
    createElement: () => createScript(),
    head: { appendChild: (script: FakeScript) => scripts.push(script) },
  });
  return scripts;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("YouTube API loader", () => {
  it("waits for a usable player namespace before resolving", async () => {
    const scripts = browserHarness();
    const { loadYouTubeApi, YOUTUBE_IFRAME_API_URL } = await import("@/lib/youtube-player");
    const loading = loadYouTubeApi(100);

    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({ src: YOUTUBE_IFRAME_API_URL, async: true });

    const Player = class {};
    window.YT = { Player } as unknown as NonNullable<Window["YT"]>;
    window.onYouTubeIframeAPIReady?.();

    await expect(loading).resolves.toBe(window.YT);
  });

  it("removes a failed script and permits a fresh retry", async () => {
    const scripts = browserHarness();
    const { loadYouTubeApi } = await import("@/lib/youtube-player");
    const first = loadYouTubeApi(100);

    scripts[0]!.fire("error");
    await expect(first).rejects.toThrow("could not be loaded");
    expect(scripts[0]!.removed).toBe(true);

    const second = loadYouTubeApi(100);
    expect(scripts).toHaveLength(2);
    scripts[1]!.fire("error");
    await expect(second).rejects.toThrow("could not be loaded");
  });

  it("times out instead of leaving playback stuck forever", async () => {
    const scripts = browserHarness();
    const { loadYouTubeApi } = await import("@/lib/youtube-player");

    await expect(loadYouTubeApi(1)).rejects.toThrow("too long");
    expect(scripts[0]!.removed).toBe(true);
  });
});
