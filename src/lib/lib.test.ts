import { describe, expect, it, vi } from "vitest";
import { cueAt, formatClock, formatTimecode, parseSrt, toSrt, type Cue } from "./srt";
import { lrcToCues, MAX_LINE_SECONDS } from "./lrc";
import { parseFilename, srtFilename } from "./metadata";
import { cleanQuery, findSyncedLyrics } from "./lrclib";
import { computePeaks } from "./peaks";

describe("timecodes", () => {
  it("formats SRT timecodes", () => {
    expect(formatTimecode(0)).toBe("00:00:00,000");
    expect(formatTimecode(75.48)).toBe("00:01:15,480");
    expect(formatTimecode(3600 + 2.0005)).toBe("01:00:02,001");
    expect(formatTimecode(-3)).toBe("00:00:00,000");
  });

  it("formats a short clock", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(75.9)).toBe("1:15");
  });
});

describe("SRT", () => {
  const cues: Cue[] = [
    { start: 1.2, end: 3.5, text: "First line" },
    { start: 4, end: 6.25, text: "Second line\non two rows" },
  ];

  it("round-trips", () => {
    const srt = toSrt(cues);
    expect(srt).toBe(
      "1\n00:00:01,200 --> 00:00:03,500\nFirst line\n\n2\n00:00:04,000 --> 00:00:06,250\nSecond line\non two rows\n",
    );
    expect(parseSrt(srt)).toEqual(cues);
  });

  it("tolerates CRLF, dots and missing indexes", () => {
    const parsed = parseSrt("00:00:01.5 --> 00:00:02.75\r\nHello\r\n\r\n\r\n7\r\n00:00:03,000 --> 00:00:04,000\r\nWorld\r\n");
    expect(parsed).toEqual([
      { start: 1.5, end: 2.75, text: "Hello" },
      { start: 3, end: 4, text: "World" },
    ]);
  });

  it("skips empty and broken blocks", () => {
    expect(parseSrt("")).toEqual([]);
    expect(parseSrt("1\n00:00:01,000 --> 00:00:02,000\n\n2\nno timing\nhere")).toEqual([]);
    expect(toSrt([])).toBe("");
  });

  it("finds the cue at a time", () => {
    expect(cueAt(cues, 0)).toBe(-1);
    expect(cueAt(cues, 1.2)).toBe(0);
    expect(cueAt(cues, 3.6)).toBe(-1);
    expect(cueAt(cues, 6.2)).toBe(1);
    expect(cueAt(cues, 6.25)).toBe(-1);
  });
});

describe("LRC", () => {
  it("converts synced lyrics, ends each line at the next one", () => {
    const cues = lrcToCues("[ar:Someone]\n[00:01.50]One\n[00:03.250]Two\n\n[00:05]Three");
    expect(cues).toEqual([
      { start: 1.5, end: 3.25, text: "One" },
      { start: 3.25, end: 5, text: "Two" },
      { start: 5, end: 9, text: "Three" },
    ]);
  });

  it("expands repeated lines and sorts them", () => {
    const cues = lrcToCues("[00:10.00][00:02.00]Chorus\n[00:05.00]Verse");
    expect(cues.map((c) => [c.start, c.text])).toEqual([
      [2, "Chorus"],
      [5, "Verse"],
      [10, "Chorus"],
    ]);
  });

  it("caps a line before a long instrumental break", () => {
    const cues = lrcToCues("[00:01.00]Before the solo\n[01:00.00]After");
    expect(cues[0].end).toBe(1 + MAX_LINE_SECONDS);
  });

  it("applies the offset tag the LRC way (positive shows earlier)", () => {
    expect(lrcToCues("[offset:+500]\n[00:02.00]Line")[0].start).toBe(1.5);
    expect(lrcToCues("[offset:-500]\n[00:02.00]Line")[0].start).toBe(2.5);
  });

  it("never runs past the song", () => {
    const cues = lrcToCues("[00:58.00]Last words\n[01:05.00]After the end of a shorter edit", 60);
    expect(cues).toEqual([{ start: 58, end: 60, text: "Last words" }]);
  });

  it("ignores text without a timestamp", () => {
    expect(lrcToCues("plain lyrics\nno tags")).toEqual([]);
  });
});

describe("file names", () => {
  it("guesses artist and title", () => {
    expect(parseFilename("Daft Punk - One More Time.mp3")).toEqual({ artist: "Daft Punk", title: "One More Time" });
    expect(parseFilename("Aya_Nakamura_-_Djadja.flac")).toEqual({ artist: "Aya Nakamura", title: "Djadja" });
    expect(parseFilename("Stromae-Alors-on-danse.wav")).toEqual({ artist: "Stromae", title: "Alors on danse" });
    expect(parseFilename("intro.m4a")).toEqual({ artist: null, title: "intro" });
  });

  it("names the SRT after the track", () => {
    expect(srtFilename({ artist: "AC/DC", title: "T.N.T." }, "x.mp3")).toBe("AC-DC - T.N.T..srt");
    expect(srtFilename({ artist: null, title: "Song" }, "my song.flac")).toBe("my song.srt");
  });
});

describe("LRCLIB", () => {
  it("cleans titles before searching", () => {
    expect(cleanQuery("Song (Official Video) [Remastered 2011]")).toBe("Song");
    expect(cleanQuery("Track feat. Somebody Else")).toBe("Track");
  });

  it("tries exact lookups, then a search", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("/search")) {
        return new Response(JSON.stringify([{ id: 2, duration: 180, syncedLyrics: null }, { id: 3, duration: 181, syncedLyrics: "[00:01.00]Hi" }]));
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const track = await findSyncedLyrics({ artist: "Artist", title: "Title (Lyrics)", duration: 180 }, fetcher);
    expect(track?.id).toBe(3);
    expect(urls).toHaveLength(4);
    expect(urls[0]).toContain("artist_name=Artist");
    expect(urls[0]).toContain("track_name=Title");
    expect(urls[0]).toContain("duration=180");
    expect(urls[1]).toContain("artist_name=Title");
  });

  it("keeps only search results of the same length as the file", async () => {
    const results = [
      { id: 1, duration: 245, syncedLyrics: "[00:01.00]Radio edit" },
      { id: 2, duration: 321, syncedLyrics: "[00:01.00]Album" },
      { id: 3, duration: 319, syncedLyrics: "[00:01.00]Close" },
    ];
    const fetcher = vi.fn(async (url: string) =>
      url.includes("/search") ? new Response(JSON.stringify(results)) : new Response("", { status: 404 }),
    ) as unknown as typeof fetch;

    expect((await findSyncedLyrics({ artist: null, title: "Song", duration: 320 }, fetcher))?.id).toBe(2);
    expect(await findSyncedLyrics({ artist: null, title: "Song", duration: 40 }, fetcher)).toBeNull();
    expect((await findSyncedLyrics({ artist: null, title: "Song", duration: null }, fetcher))?.id).toBe(1);
  });

  it("returns null without a title or when the network fails", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await findSyncedLyrics({ artist: null, title: null, duration: null }, failing)).toBeNull();
    expect(await findSyncedLyrics({ artist: null, title: "Song", duration: null }, failing)).toBeNull();
  });
});

describe("peaks", () => {
  it("normalises slice peaks to the loudest one", () => {
    const samples = new Float32Array([0.1, -0.2, 0.5, -1, 0, 0.25]);
    const peaks = Array.from(computePeaks(samples, 3));
    [0.2, 1, 0.25].forEach((expected, i) => expect(peaks[i]).toBeCloseTo(expected, 6));
  });

  it("handles empty input", () => {
    expect(Array.from(computePeaks(new Float32Array(0), 4))).toEqual([0, 0, 0, 0]);
  });
});
