import { describe, expect, it } from "vitest";
import { initialPlaybackState, playbackReducer } from "@/lib/playback";

describe("playback state", () => {
  it("does not claim playback before the media provider confirms it", () => {
    const requested = playbackReducer(initialPlaybackState, { type: "request-play" });

    expect(requested.desiredPlaying).toBe(true);
    expect(requested.status).toBe("loading");
    expect(playbackReducer(requested, { type: "playing" }).status).toBe("playing");
  });

  it("returns blocked and failed playback to a retryable paused intent", () => {
    const requested = playbackReducer(initialPlaybackState, { type: "request-play" });
    const blocked = playbackReducer(requested, { type: "blocked" });
    const failed = playbackReducer(requested, { type: "error" });

    expect(blocked).toMatchObject({ desiredPlaying: false, status: "blocked" });
    expect(failed).toMatchObject({ desiredPlaying: false, status: "error" });
    expect(playbackReducer(blocked, { type: "request-play" })).toMatchObject({
      desiredPlaying: true,
      status: "loading",
      message: null,
    });
  });

  it("carries play intent across a skip and clears it when playback is paused", () => {
    expect(
      playbackReducer(initialPlaybackState, { type: "source-changed", continuePlaying: true }),
    ).toMatchObject({ desiredPlaying: true, status: "loading" });
    expect(
      playbackReducer(initialPlaybackState, { type: "source-changed", continuePlaying: false }),
    ).toMatchObject({ desiredPlaying: false, status: "paused" });
  });
});
