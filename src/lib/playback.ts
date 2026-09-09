export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "blocked" | "error";

export interface PlaybackState {
  desiredPlaying: boolean;
  status: PlaybackStatus;
  message: string | null;
}

export type PlaybackAction =
  | { type: "request-play" }
  | { type: "request-pause" }
  | { type: "playing" }
  | { type: "paused" }
  | { type: "blocked"; message?: string }
  | { type: "error"; message?: string }
  | { type: "source-changed"; continuePlaying: boolean }
  | { type: "reset" };

export const initialPlaybackState: PlaybackState = {
  desiredPlaying: false,
  status: "idle",
  message: null,
};

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case "request-play":
      return { desiredPlaying: true, status: "loading", message: null };
    case "request-pause":
      return state.status === "loading"
        ? { desiredPlaying: false, status: "paused", message: null }
        : { ...state, desiredPlaying: false, message: null };
    case "playing":
      return { desiredPlaying: true, status: "playing", message: null };
    case "paused":
      return { desiredPlaying: false, status: "paused", message: null };
    case "blocked":
      return {
        desiredPlaying: false,
        status: "blocked",
        message: action.message ?? "Your browser paused this song. Press Play to try again.",
      };
    case "error":
      return {
        desiredPlaying: false,
        status: "error",
        message: action.message ?? "This song could not open here. Try again or watch it on YouTube.",
      };
    case "source-changed":
      return action.continuePlaying
        ? { desiredPlaying: true, status: "loading", message: null }
        : { desiredPlaying: false, status: "paused", message: null };
    case "reset":
      return initialPlaybackState;
  }
}
