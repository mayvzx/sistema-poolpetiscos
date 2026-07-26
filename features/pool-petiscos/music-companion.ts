import type { Track } from "./types";

export const MUSIC_COMPANION_URL = "http://127.0.0.1:8765";

export type MusicCompanionHealth = {
  service: string;
  version: string;
  yt_dlp: boolean;
  ffmpeg: boolean;
  music_directory: string;
};

type LibraryTrack = {
  id: string;
  name: string;
  media_url: string;
  size: string;
};

export type MusicDownloadJob = {
  id: string;
  status: "queued" | "downloading" | "processing" | "finished" | "failed";
  progress: number;
  message: string;
  track?: LibraryTrack;
};

async function companionRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${MUSIC_COMPANION_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      signal: controller.signal,
    });
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "O companion local recusou a solicitação.");
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("O companion local demorou para responder.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function checkMusicCompanion(): Promise<MusicCompanionHealth> {
  return companionRequest<MusicCompanionHealth>("/api/health");
}

export async function listCompanionTracks(): Promise<Track[]> {
  const payload = await companionRequest<{ tracks: LibraryTrack[] }>(
    "/api/music/library",
  );
  return payload.tracks.map((track) => ({
    id: track.id,
    name: track.name,
    url: `${MUSIC_COMPANION_URL}${encodeURI(track.media_url)}`,
    size: track.size,
    source: "yt-dlp" as const,
  }));
}

export function queueTrackDownload(url: string): Promise<MusicDownloadJob> {
  return companionRequest<MusicDownloadJob>("/api/music/download", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function getTrackDownloadJob(jobId: string): Promise<MusicDownloadJob> {
  return companionRequest<MusicDownloadJob>(
    `/api/music/jobs/${encodeURIComponent(jobId)}`,
  );
}
