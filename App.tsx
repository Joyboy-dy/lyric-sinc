import React, { useState } from 'react';
import { Sparkles, Terminal, AlertCircle, ShieldCheck, Workflow } from 'lucide-react';
import DropZone from './components/DropZone';
import PipelineSteps from './components/PipelineSteps';
import SrtOutput from './components/SrtOutput';
import { SrtService } from './services/api';
import { ProcessingState, SrtResult } from './types';
import { extractMetadata } from './services/metadata';
import { searchLyrics } from './services/lrclib';
import { lrcToSrt } from './utils/lrcToSrt';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>({ step: 'idle' });
  const [result, setResult] = useState<SrtResult | null>(null);
  const [resultSource, setResultSource] = useState<'backend' | 'lrclib' | null>(null);
  const [lyricsText, setLyricsText] = useState<string>('');
  const [srtMode, setSrtMode] = useState<'sentence' | 'paragraph'>('sentence');
  const [addInstrumentalTags, setAddInstrumentalTags] = useState<boolean>(false);
  const [detectedMetadata, setDetectedMetadata] = useState<{ artist: string | null; title: string | null } | null>(null);
  const [smartAlignStatus, setSmartAlignStatus] = useState<string | null>(null);

  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile);
    setResult(null);
    setResultSource(null);
    setDetectedMetadata(null);
    setSmartAlignStatus(null);
    setProcessingState({ step: 'idle' });

    if (!selectedFile) return;

    try {
      setSmartAlignStatus('Analyzing audio metadata…');
      const metadata = await extractMetadata(selectedFile);
      setDetectedMetadata({ artist: metadata.artist, title: metadata.title });

      if (!metadata.title) {
        setSmartAlignStatus('No title detected. Smart lyrics lookup skipped.');
        return;
      }

      setSmartAlignStatus('Searching LRCLIB for synced lyrics…');
      const lyricsData = await searchLyrics(metadata);

      if (lyricsData?.syncedLyrics) {
        const srtContent = lrcToSrt(lyricsData.syncedLyrics);
        if (srtContent.trim()) {
          setResult({ srt_content: srtContent });
          setResultSource('lrclib');
          setLyricsText((current) => (current.trim() ? current : (lyricsData.plainLyrics || lyricsData.syncedLyrics)));
          setSmartAlignStatus(`Synced lyrics found on LRCLIB (SRT ready): ${lyricsData.artistName} — ${lyricsData.trackName}`);
          return;
        }
      }

      setSmartAlignStatus('No synced lyrics found on LRCLIB. You can still generate via backend.');
    } catch (error) {
      console.error(error);
      setSmartAlignStatus('Smart lyrics lookup failed. You can still generate via backend.');
    }
  };

  const handleGenerate = async () => {
    if (!file) return;

    setResult(null);
    setResultSource(null);
    setProcessingState({ step: 'uploading', message: 'Preparing audio...' });

    try {
      setProcessingState({ step: 'uploading', message: 'Uploading audio to server...' });
      setProcessingState({ step: 'processing', message: 'Server processing: vocals → VAD → ASR → alignment...' });
      const data = await SrtService.generateSrt(file, {
        lyricsText,
        srtMode,
        addInstrumentalTags,
      });

      setResult(data);
      setResultSource('backend');
      setProcessingState({ step: 'completed', message: 'Done!' });
    } catch (error) {
      console.error(error);
      setProcessingState({
        step: 'error',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setResultSource(null);
    setProcessingState({ step: 'idle' });
    setLyricsText('');
    setAddInstrumentalTags(false);
    setSrtMode('sentence');
    setDetectedMetadata(null);
    setSmartAlignStatus(null);
  };

  const isBusy = processingState.step === 'uploading' || processingState.step === 'processing';
  const canGenerate = !!file && !isBusy;

  return (
    <div className="min-h-screen flex flex-col text-slate-100 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 right-[-10%] h-[520px] w-[520px] rounded-full bg-cyan-400/10 blur-[140px]" />

      <header className="relative z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.2)]">
              <Sparkles size={22} />
            </div>
            <div>
              <h1 className="text-lg font-semibold font-display tracking-tight">LyricSync</h1>
              <p className="text-xs text-slate-400">Production lyric-to-SRT (Demucs + VAD + Whisper)</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-full px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Production-ready pipeline
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
          <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-emerald-300/80 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Audio to SRT
              </div>
              <h2 className="text-3xl md:text-4xl font-display font-semibold leading-tight text-white">
                Generate clean SRT subtitles for lyric videos.
              </h2>
              <p className="text-base text-slate-300 max-w-2xl">
                Upload audio and (optionally) paste lyrics. If lyrics are provided, the SRT text follows them and aligns to the audio.
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200">
                  <ShieldCheck size={16} className="text-emerald-300" />
                  Whisper large-v2 (CPU, int8)
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200">
                  <Workflow size={16} className="text-cyan-300" />
                  Lyrics-guided alignment
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Session overview</h3>
                <span className="text-xs text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">Ready</span>
              </div>
              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Audio input</span>
                  <span className="text-slate-200">MP3, WAV, FLAC</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Inputs</span>
                  <span className="text-slate-200">Audio + optional lyrics</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Outputs</span>
                  <span className="text-slate-200">SRT</span>
                </div>
              </div>
              <div className="bg-slate-950/70 border border-white/10 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Terminal className="text-emerald-300 mt-0.5" size={18} />
                  <div className="space-y-1 text-sm text-slate-300">
                    <p>Pipeline configuration:</p>
                    <ul className="list-disc list-inside text-xs text-slate-400 ml-1 space-y-1">
                      <li>Vocals: Demucs separation</li>
                      <li>Instrumentals: VAD-based gap detection</li>
                      <li>ASR: faster-whisper large-v2 (CPU int8)</li>
                      <li>Lyrics: forced matching when provided</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 md:p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white">Audio upload</h3>
                <p className="text-xs text-slate-400">Drop a track to generate subtitles.</p>
              </div>
              <DropZone
                selectedFile={file}
                onFileSelected={handleFileSelect}
                onClear={() => {
                  setFile(null);
                  setResult(null);
                  setResultSource(null);
                  setDetectedMetadata(null);
                  setSmartAlignStatus(null);
                  setProcessingState({ step: 'idle' });
                }}
              />

              {smartAlignStatus && (
                <div className="flex items-start gap-3 text-xs text-slate-300 bg-slate-950/70 border border-white/10 rounded-xl p-3">
                  <Workflow size={16} className="text-emerald-300 mt-0.5 flex-shrink-0" />
                  <div className="leading-relaxed">
                    <div className="text-slate-200 font-medium">Smart lyrics (LRCLIB)</div>
                    <div className="text-slate-400">{smartAlignStatus}</div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 md:p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white">Optional lyrics (source of truth)</h3>
                <p className="text-xs text-slate-400">Paste lyrics to force the SRT text. If empty, the app will use best-effort transcription.</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <textarea
                  value={lyricsText}
                  onChange={(e) => setLyricsText(e.target.value)}
                  disabled={isBusy}
                  placeholder="Paste lyrics here..."
                  className="min-h-[140px] w-full px-4 py-3 rounded-2xl bg-slate-950/70 border border-white/10 text-slate-200 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                />

                <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                  <label className="text-xs text-slate-400">
                    Or upload a .txt lyrics file:{' '}
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      disabled={isBusy}
                      className="block mt-2 text-xs text-slate-300"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const text = await f.text();
                        setLyricsText(text);
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    disabled={isBusy || !lyricsText.trim()}
                    onClick={() => setLyricsText('')}
                    className={`px-5 py-2 rounded-xl border text-sm transition-colors ${
                      isBusy || !lyricsText.trim()
                        ? 'border-white/10 text-slate-500 bg-white/5 cursor-not-allowed'
                        : 'border-white/20 text-slate-300 hover:text-white hover:border-white/30'
                    }`}
                  >
                    Clear lyrics
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col items-center justify-center gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-full px-3 py-2">
              <span className="text-slate-400">SRT mode</span>
              <button
                type="button"
                onClick={() => setSrtMode('sentence')}
                disabled={isBusy}
                className={`px-2 py-1 rounded-full border transition-colors ${
                  srtMode === 'sentence'
                    ? 'bg-emerald-400/20 border-emerald-400/40 text-emerald-200'
                    : 'bg-transparent border-white/10 text-slate-300 hover:border-white/20'
                }`}
              >
                sentence
              </button>
              <button
                type="button"
                onClick={() => setSrtMode('paragraph')}
                disabled={isBusy}
                className={`px-2 py-1 rounded-full border transition-colors ${
                  srtMode === 'paragraph'
                    ? 'bg-emerald-400/20 border-emerald-400/40 text-emerald-200'
                    : 'bg-transparent border-white/10 text-slate-300 hover:border-white/20'
                }`}
              >
                paragraph
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-full px-3 py-2 select-none">
              <input
                type="checkbox"
                checked={addInstrumentalTags}
                disabled={isBusy}
                onChange={(e) => setAddInstrumentalTags(e.target.checked)}
              />
              <span className="text-slate-400">Add</span>
              <span className="text-slate-200">[INSTRUMENTAL]</span>
              <span className="text-slate-400">tags</span>
            </label>

            <div className="flex flex-col md:flex-row items-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`relative px-7 py-3.5 rounded-xl font-semibold text-base shadow-lg transition-all duration-200
                  ${!canGenerate
                    ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-400 text-slate-900 hover:bg-emerald-300 hover:-translate-y-0.5 hover:shadow-emerald-500/30'
                  }
                `}
              >
                {processingState.step === 'idle' ? 'Generate SRT' : 'Processing...'}
              </button>
              <button
                onClick={handleReset}
                disabled={isBusy && processingState.step !== 'completed'}
                className="px-5 py-3 rounded-xl border border-white/10 text-sm text-slate-300 hover:text-white hover:border-white/30 transition-colors"
              >
                Reset session
              </button>
            </div>

            {processingState.step === 'error' && (
              <div className="flex items-center gap-3 text-rose-200 bg-rose-500/10 px-4 py-2 rounded-lg border border-rose-500/20 max-w-lg">
                <AlertCircle size={18} className="flex-shrink-0" />
                <span className="text-sm">{processingState.message}</span>
              </div>
            )}
          </section>

          {processingState.step !== 'idle' && processingState.step !== 'error' && (
            <PipelineSteps state={processingState} />
          )}

          {result && (
            <div className="min-h-[420px] animate-in fade-in slide-in-from-bottom-4 duration-500">
              <SrtOutput
                result={result}
                filename={file?.name || 'output'}
                metadata={detectedMetadata}
                label={
                  resultSource === 'lrclib'
                    ? 'lrclib • synced'
                    : (lyricsText.trim() ? `${srtMode} • lyrics` : `${srtMode} • asr`)
                }
              />
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-10 py-6 text-center text-slate-500 text-xs border-t border-white/10">
        <p>
          Backend command: <code className="bg-white/10 px-1 py-0.5 rounded text-slate-300">uvicorn server:app --reload --port 7860</code>
        </p>
      </footer>
    </div>
  );
};

export default App;
