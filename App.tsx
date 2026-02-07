import React, { useState } from 'react';
import { Sparkles, Terminal, AlertCircle, ShieldCheck, Workflow } from 'lucide-react';
import DropZone from './components/DropZone';
import PipelineSteps from './components/PipelineSteps';
import SrtOutput from './components/SrtOutput';
import { AlignmentService } from './services/api';
import { AlignmentResult, ProcessingState } from './types';
import { extractMetadata } from './services/metadata';
import { searchLyrics } from './services/lrclib';
import { lrcToSrt } from './utils/lrcToSrt';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>({ step: 'idle' });
  const [result, setResult] = useState<AlignmentResult | null>(null);
  const [srtMode, setSrtMode] = useState<'paragraph' | 'sentence'>('sentence');
  const [trackLookupState, setTrackLookupState] = useState<'idle' | 'checking' | 'known' | 'unknown' | 'error'>('idle');
  const [smartAlignStatus, setSmartAlignStatus] = useState<string | null>(null);
  const [detectedMetadata, setDetectedMetadata] = useState<{ artist: string | null; title: string | null } | null>(null);

  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile);
    setResult(null);
    setTrackLookupState('idle');
    setSmartAlignStatus(null);
    setDetectedMetadata(null);

    if (!selectedFile) return;

    setTrackLookupState('checking');
    try {
      setSmartAlignStatus('Analyzing audio metadata...');
      const metadata = await extractMetadata(selectedFile);
      setDetectedMetadata({ artist: metadata.artist, title: metadata.title });

      if (metadata.title) {
        const display = [metadata.artist, metadata.title].filter(Boolean).join(' - ');
        if (display) setSmartAlignStatus(`Detected: ${display}`);

        setSmartAlignStatus('Searching lyric database...');
        const lyricsData = await searchLyrics(metadata);

        if (lyricsData?.syncedLyrics) {
          const srtContent = lrcToSrt(lyricsData.syncedLyrics);
          if (srtContent.trim()) {
            setResult({
              srt_content: srtContent,
              word_segments: [],
              full_json: { segments: [] },
            });
            setTrackLookupState('known');
            setSmartAlignStatus('Synced lyrics found. Ready to export.');
            return;
          }
        }
      }

      setTrackLookupState('unknown');
      setSmartAlignStatus('No synced lyrics found. You can generate from audio.');
    } catch (error) {
      console.error(error);
      setTrackLookupState('error');
      setSmartAlignStatus('Track analysis failed. You can still generate from audio.');
    }
  };

  const handleGenerate = async () => {
    if (!file) return;

    setResult(null);
    setProcessingState({ step: 'uploading', message: 'Preparing audio...' });

    try {
      setProcessingState({ step: 'uploading', message: 'Uploading audio to server...' });
      setProcessingState({ step: 'transcribing', message: 'Server processing: transcribing & aligning...' });
      const data = await AlignmentService.alignAudio(file, srtMode);

      setResult(data);
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
    setProcessingState({ step: 'idle' });
    setTrackLookupState('idle');
    setSmartAlignStatus(null);
    setDetectedMetadata(null);
  };

  const isBusy = processingState.step !== 'idle';
  const canGenerate = !!file && !isBusy && trackLookupState !== 'checking';

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
              <p className="text-xs text-slate-400">WhisperX alignment studio</p>
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
                Build precise, time-aligned lyrics in minutes.
              </h2>
              <p className="text-base text-slate-300 max-w-2xl">
                Upload a track and export production-grade SRT. The pipeline is tuned for
                fast alignment, clean timestamps, and dependable exports.
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200">
                  <ShieldCheck size={16} className="text-emerald-300" />
                  Word-level timestamps
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200">
                  <Workflow size={16} className="text-cyan-300" />
                  SRT export
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
                  <span>Alignment target</span>
                  <span className="text-slate-200">Lyrics + transcript</span>
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
                      <li>Engine: WhisperX medium (CPU)</li>
                      <li>Alignment: WhisperX word-level alignment</li>
                      <li>Export: Millisecond-accurate SRT</li>
                    </ul>
                    {smartAlignStatus && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-sm text-emerald-300">{smartAlignStatus}</p>
                      </div>
                    )}
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
                onClear={() => { setFile(null); setResult(null); }}
              />
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
                {processingState.step === 'idle' ? 'Generate synchronized SRT' : 'Processing...'}
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
              />
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-10 py-6 text-center text-slate-500 text-xs border-t border-white/10">
        <p>
          Backend command: <code className="bg-white/10 px-1 py-0.5 rounded text-slate-300">uvicorn backend_server:app --reload</code>
        </p>
      </footer>
    </div>
  );
};

export default App;
