import React, { useState } from 'react';
import { Sparkles, Terminal, AlertCircle, RefreshCw, ShieldCheck, Workflow, Wand2 } from 'lucide-react';
import DropZone from './components/DropZone';
import LyricsInput from './components/LyricsInput';
import PipelineSteps from './components/PipelineSteps';
import SrtOutput from './components/SrtOutput';
import { AlignmentService } from './services/api';
import { AlignmentResult, ProcessingState } from './types';
import { extractMetadata, getAudioDuration } from './services/metadata';
import { searchLyrics } from './services/lrclib';
import { lrcToSrt } from './utils/lrcToSrt';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState<string>('');
  const [processingState, setProcessingState] = useState<ProcessingState>({ step: 'idle' });
  const [result, setResult] = useState<AlignmentResult | null>(null);
  const [useMock, setUseMock] = useState(false);
  const [smartAlignStatus, setSmartAlignStatus] = useState<string | null>(null);
  const [detectedMetadata, setDetectedMetadata] = useState<{ artist: string | null; title: string | null } | null>(null);

  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile);
    setSmartAlignStatus(null);
    setLyrics('');
    setResult(null);

    if (!selectedFile) return;

    try {
      setSmartAlignStatus('Analyzing audio metadata...');

      const [metadata, duration] = await Promise.all([
        extractMetadata(selectedFile),
        getAudioDuration(selectedFile),
      ]);

      setDetectedMetadata({ artist: metadata.artist, title: metadata.title });

      if (metadata.artist && metadata.title) {
        setSmartAlignStatus(`Detected: ${metadata.artist} - ${metadata.title}`);

        setSmartAlignStatus('Searching lyric database...');
        const lyricsData = await searchLyrics({ ...metadata, duration });

        if (lyricsData?.syncedLyrics) {
          setSmartAlignStatus('Synced lyrics found. Ready to export.');

          const srtContent = lrcToSrt(lyricsData.syncedLyrics);

          setResult({
            srt_content: srtContent,
            word_segments: [],
            full_json: { segments: [] },
          });

          setLyrics(lyricsData.plainLyrics || lyricsData.syncedLyrics);
          setSmartAlignStatus('Ready. Lyrics loaded from database.');
        } else {
          setSmartAlignStatus('No lyrics found. Paste them manually to continue.');
        }
      } else {
        setSmartAlignStatus('No metadata found. Paste lyrics manually.');
      }
    } catch (error) {
      console.error('Smart Align error:', error);
      setSmartAlignStatus('Auto-detection failed. You can still generate manually.');
    }
  };

  const handleGenerate = async () => {
    if (!file && !useMock) return;
    if (!lyrics) {
      alert('Please enter lyrics first.');
      return;
    }

    setResult(null);
    setProcessingState({ step: 'uploading', message: 'Preparing audio...' });

    try {
      let data: AlignmentResult;

      if (useMock) {
        setProcessingState({ step: 'uploading', message: 'Simulating upload...' });
        await new Promise(r => setTimeout(r, 800));
        setProcessingState({ step: 'transcribing', message: 'Simulating WhisperX transcription...' });
        await new Promise(r => setTimeout(r, 1500));
        setProcessingState({ step: 'aligning', message: 'Simulating phoneme alignment...' });
        data = await AlignmentService.mockAlign(lyrics);
      } else {
        setProcessingState({ step: 'uploading', message: 'Uploading audio to server...' });
        setProcessingState({ step: 'transcribing', message: 'Server processing: transcribing & aligning...' });
        if (file) {
          data = await AlignmentService.alignAudio(file, lyrics);
        } else {
          throw new Error('No file provided');
        }
      }

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
    setLyrics('');
    setResult(null);
    setProcessingState({ step: 'idle' });
  };

  const isBusy = processingState.step !== 'idle';
  const canGenerate = (!!file || useMock) && !isBusy;

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
            <label className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-xs text-slate-300">
              <input
                type="checkbox"
                id="mockMode"
                checked={useMock}
                onChange={(e) => setUseMock(e.target.checked)}
                className="rounded border-white/20 bg-slate-900 text-emerald-400 focus:ring-emerald-500/40"
              />
              Demo mode
            </label>
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
                Upload a track, paste lyrics, and export production-grade SRT or JSON. The pipeline is tuned for
                fast alignment, clean timestamps, and dependable exports.
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200">
                  <ShieldCheck size={16} className="text-emerald-300" />
                  Word-level timestamps
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200">
                  <Workflow size={16} className="text-cyan-300" />
                  SRT + JSON exports
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200">
                  <Wand2 size={16} className="text-amber-300" />
                  Smart auto-detect
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
                  <span className="text-slate-200">SRT and JSON</span>
                </div>
              </div>
              <div className="bg-slate-950/70 border border-white/10 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Terminal className="text-emerald-300 mt-0.5" size={18} />
                  <div className="space-y-1 text-sm text-slate-300">
                    <p>Pipeline configuration:</p>
                    <ul className="list-disc list-inside text-xs text-slate-400 ml-1 space-y-1">
                      <li>Engine: Faster-Whisper (CPU)</li>
                      <li>Alignment: Word-level timestamps</li>
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

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 md:p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white">Audio upload</h3>
                <p className="text-xs text-slate-400">Drop a track to start smart alignment.</p>
              </div>
              <DropZone
                selectedFile={file}
                onFileSelected={handleFileSelect}
                onClear={() => { setFile(null); setSmartAlignStatus(null); setResult(null); }}
              />
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 md:p-6 h-full">
              <LyricsInput value={lyrics} onChange={setLyrics} />
            </div>
          </section>

          <section className="flex flex-col items-center justify-center gap-4">
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
                {processingState.message?.includes('Demo Mode') && (
                  <button
                    onClick={() => setUseMock(true)}
                    className="ml-auto text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 px-2 py-1 rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                  >
                    <RefreshCw size={12} />
                    Enable demo
                  </button>
                )}
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
