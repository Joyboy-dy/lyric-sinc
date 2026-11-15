from lyricsync.text import (
    MIN_DUR_S,
    MIN_GAP_S,
    Word,
    align,
    apply_alignment,
    build_srt,
    enforce_timing,
    format_srt_time,
    instrumental_segments,
    interpolate,
    merge_voiced,
    normalize_token,
    parse_lyrics,
    segment,
    untimed_runs,
)


def heard(*items: tuple[str, float, float]) -> list[Word]:
    return [Word(display=t, norm=normalize_token(t), start=s, end=e) for t, s, e in items]


def test_format_srt_time():
    assert format_srt_time(0) == "00:00:00,000"
    assert format_srt_time(75.48) == "00:01:15,480"
    assert format_srt_time(3725.0004) == "01:02:05,000"
    assert format_srt_time(-1) == "00:00:00,000"


def test_build_srt_numbers_continuously_and_skips_empty():
    srt = build_srt(
        [
            {"start": 1.0, "end": 2.0, "text": "One"},
            {"start": 2.5, "end": 3.0, "text": "  "},
            {"start": 3.5, "end": 4.0, "text": "Two"},
        ]
    )
    assert srt == "1\n00:00:01,000 --> 00:00:02,000\nOne\n\n2\n00:00:03,500 --> 00:00:04,000\nTwo\n"
    assert build_srt([]) == ""


def test_normalize_token():
    assert normalize_token("“Don’t,") == "don't"
    assert normalize_token("...") == ""
    assert normalize_token("Été!") == "été"


def test_parse_lyrics_marks_line_and_verse_breaks():
    words = parse_lyrics("One more time.\nWe're gonna celebrate —\n\nOh yeah")
    assert [w.display for w in words] == ["One", "more", "time.", "We're", "gonna", "celebrate", "Oh", "yeah"]
    assert words[2].boundary_after and words[2].line_break_after
    # A trailing dash is dropped, so the line break lands on the last real word.
    assert words[5].line_break_after and words[5].boundary_after  # blank line after it
    assert not words[3].line_break_after


def test_align_matches_close_spellings_and_skips_extras():
    lyrics = parse_lyrics("we are gonna celebrate tonight")
    transcript = heard(("uh", 0.0, 0.2), ("we", 1.0, 1.2), ("are", 1.2, 1.4), ("gon", 1.4, 1.6),
                       ("celebrate", 1.6, 2.2), ("tonite", 2.3, 2.8))
    mapping = align(lyrics, transcript)
    assert mapping == [1, 2, 3, 4, 5]
    timed = apply_alignment(lyrics, transcript, mapping)
    assert [w.start for w in timed] == [1.0, 1.2, 1.4, 1.6, 2.3]
    assert [w.display for w in timed] == ["we", "are", "gonna", "celebrate", "tonight"]


def test_align_leaves_unheard_words_untimed():
    lyrics = parse_lyrics("hello quiet world")
    timed = apply_alignment(lyrics, heard(("hello", 0, 0.5), ("world", 2, 2.5)), align(lyrics, heard(("hello", 0, 0.5), ("world", 2, 2.5))))
    assert [w.timed for w in timed] == [True, False, True]
    assert untimed_runs(timed) == [(1, 1)]


def test_interpolate_places_missing_words_inside_the_singing():
    words = [Word("a", "a", 0.0, 0.3), Word("b", "b"), Word("c", "c"), Word("d", "d", 4.0, 4.3)]
    filled = interpolate(words, voice=[(0.0, 0.3), (2.0, 3.0), (4.0, 4.3)])
    assert all(w.timed for w in filled)
    for w in filled[1:3]:
        assert 2.0 <= w.start <= 3.0
    assert filled[1].start < filled[2].start


def test_interpolate_without_voice_spreads_evenly_and_handles_edges():
    words = [Word("x", "x"), Word("a", "a", 1.0, 1.2), Word("b", "b"), Word("c", "c", 2.0, 2.2), Word("z", "z")]
    filled = interpolate(words)
    assert all(w.timed for w in filled)
    assert filled[0].end <= 1.0
    assert 1.2 < filled[2].start < 2.0
    assert filled[4].start > 2.2


def test_segment_sentence_mode_cuts_at_line_ends_and_pauses():
    words = [
        Word("One", "one", 0.0, 0.3), Word("more", "more", 0.3, 0.6), Word("time", "time", 0.6, 1.0, line_break_after=True),
        Word("We're", "we're", 1.1, 1.4), Word("gonna", "gonna", 1.4, 1.7),
        Word("celebrate", "celebrate", 3.0, 3.6),  # after a 1.3 s pause
    ]
    segs = segment(words, "sentence")
    assert [s["text"] for s in segs] == ["One more time", "We're gonna", "celebrate"]
    assert segs[0]["start"] == 0.0 and segs[0]["end"] == 1.0


def test_segment_caps_words_per_line():
    words = [Word(f"w{i}", f"w{i}", i * 0.2, i * 0.2 + 0.15) for i in range(20)]
    sentence = segment(words, "sentence")
    paragraph = segment(words, "paragraph")
    assert max(len(s["text"].split()) for s in sentence) == 8
    assert len(paragraph) == 1


def test_enforce_timing_removes_overlaps_and_short_flashes():
    fixed = enforce_timing([
        {"start": 2.0, "end": 2.05, "text": "late"},
        {"start": 1.0, "end": 2.1, "text": "early"},
        {"start": 3.0, "end": 4.0, "text": " "},
    ])
    assert [s["text"] for s in fixed] == ["early", "late"]
    assert fixed[1]["start"] >= fixed[0]["end"] + MIN_GAP_S - 1e-9
    assert fixed[1]["end"] - fixed[1]["start"] >= MIN_DUR_S - 1e-9


def test_merge_voiced_and_instrumental_gaps():
    frames = [(0.0, 0.03), (0.03, 0.06), (0.10, 0.13), (2.0, 2.03)]
    spans, gaps = merge_voiced(frames)
    assert spans == [(0.0, 0.13), (2.0, 2.03)]
    assert gaps == [(0.13, 2.0)]
    assert instrumental_segments(gaps) == [{"start": 0.13, "end": 2.0, "text": "[INSTRUMENTAL]"}]
    assert merge_voiced([]) == ([], [])
