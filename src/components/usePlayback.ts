import { useCallback, useEffect, useRef, useState } from "react";

/** Plays a local file and reports the position every frame, smooth enough for a playhead. */
export function usePlayback(file: File | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.preload = "auto";
    audioRef.current = audio;

    let frame = 0;
    const tick = () => {
      setTime(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      frame = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(frame);
      setTime(audio.currentTime);
    };
    const onSeeked = () => setTime(audio.currentTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("seeked", onSeeked);

    return () => {
      cancelAnimationFrame(frame);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      audioRef.current = null;
      setPlaying(false);
      setTime(0);
    };
  }, [file]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seek = useCallback((seconds: number, andPlay = false) => {
    const audio = audioRef.current;
    if (!audio) return;
    const go = () => {
      audio.currentTime = Math.max(0, seconds);
      setTime(audio.currentTime);
      if (andPlay && audio.paused) void audio.play();
    };
    // Before its metadata loads, an audio element ignores a new position.
    if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) audio.addEventListener("loadedmetadata", go, { once: true });
    else go();
  }, []);

  return { playing, time, toggle, seek };
}
