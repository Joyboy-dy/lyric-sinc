import React, { useState } from 'react';
import { Sparkles, Terminal, AlertCircle, RefreshCw } from 'lucide-react';
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

  // Smart Align: auto-detect lyrics when file is selected
  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile);
    setSmartAlignStatus(null);
    setLyrics('');
    setResult(null);

    if (!selectedFile) return;

    try {
      setSmartAlignStatus('🔍 Analyzing audio...');

      // Extract metadata
      const [metadata, duration] = await Promise.all([
        extractMetadata(selectedFile),
        getAudioDuration(selectedFile),
      ]);

      if (metadata.artist && metadata.title) {
        setSmartAlignStatus(`🎵 Detected: ${metadata.artist} - ${metadata.title}`);

        // Search LRCLIB
        setSmartAlignStatus(`⏳ Searching lyrics database...`);
        const lyricsData = await searchLyrics({ ...metadata, duration });

        if (lyricsData?.syncedLyrics) {
          setSmartAlignStatus(`✅ Synced lyrics found!`);

          // Convert LRC to SRT
          const srtContent = lrcToSrt(lyricsData.syncedLyrics);

          // Display instantly as result
          setResult({
            srt_content: srtContent,
            word_segments: [],
            full_json: { segments: [] },
          });

          setLyrics(lyricsData.plainLyrics || lyricsData.syncedLyrics);
          setSmartAlignStatus(`🎉 Ready! (from LRCLIB database)`);
        } else {
          setSmartAlignStatus(`ℹ️ No lyrics found in database. Please paste lyrics manually.`);
        }
      } else {
        setSmartAlignStatus(`ℹ️ No metadata found. Please paste lyrics manually.`);
      }
    } catch (error) {
      console.error('Smart Align error:', error);
      setSmartAlignStatus(`⚠️ Auto-detection failed. You can still generate manually.`);
    }
  };

  const handleGenerate = async () => {
    if (!file && !useMock) return;
    if (!lyrics) {
      alert("Please enter lyrics first.");
      return;
    }

    setResult(null);
    setProcessingState({ step: 'uploading', message: 'Preparing audio...' });

    try {
      let data: AlignmentResult;

      if (useMock) {
        // Mock flow
        setProcessingState({ step: 'uploading', message: 'Simulating upload...' });
        await new Promise(r => setTimeout(r, 800));
        setProcessingState({ step: 'transcribing', message: 'Simulating WhisperX transcription...' });
        await new Promise(r => setTimeout(r, 1500));
        setProcessingState({ step: 'aligning', message: 'Simulating Phoneme alignment...' });
        data = await AlignmentService.mockAlign(lyrics);
      } else {
        // Real flow
        // 1. Upload & Transcribe happens in one server call usually, but we update UI
        setProcessingState({ step: 'uploading', message: 'Uploading audio to server...' });
        // The service call waits for the whole process
        setProcessingState({ step: 'transcribing', message: 'Server processing: Transcribing & Aligning...' });
        if (file) {
          data = await AlignmentService.alignAudio(file, lyrics);
        } else {
          throw new Error("No file provided");
        }
      }

      setResult(data);
      setProcessingState({ step: 'completed', message: 'Done!' });
    } catch (error) {
      console.error(error);
      setProcessingState({
        step: 'error',
        message: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    }
  };

  const handleReset = () => {
    setFile(null);
    setLyrics('');
    setResult(null);
    setProcessingState({ step: 'idle' });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-lg">
              <Sparkles className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                LyricSync
              </h1>
              <p className="text-xs text-slate-500 font-mono tracking-wide">WHISPERX POWERED</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
              <input
                type="checkbox"
                id="mockMode"
                checked={useMock}
                onChange={(e) => setUseMock(e.target.checked)}
                className="rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500/50"
              />
              <label htmlFor="mockMode" className="text-xs text-slate-400 cursor-pointer select-none">
                Demo Mode (No Backend)
              </label>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-4 md:p-8 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full flex flex-col space-y-6">

          {/* Top Section: Inputs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-auto lg:h-[400px]">

            {/* Left: Audio & Controls */}
            <div className="flex flex-col space-y-4">
              <div className="flex-grow">
                <DropZone
                  selectedFile={file}
                  onFileSelected={handleFileSelect}
                  onClear={() => { setFile(null); setSmartAlignStatus(null); setResult(null); }}
                />
              </div>

              {/* Info Box */}
              <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <Terminal className="text-slate-500 mt-1" size={18} />
                  <div className="text-sm text-slate-400 space-y-1">
                    <p>Pipeline configuration:</p>
                    <ul className="list-disc list-inside text-xs text-slate-500 ml-1">
                      <li>Engine: Faster-Whisper (CPU)</li>
                      <li>Alignment: Word-level timestamps</li>
                      <li>Output: Millisecond-accurate SRT</li>
                    </ul>
                    {smartAlignStatus && (
                      <div className="mt-3 pt-3 border-t border-slate-700">
                        <p className="text-sm text-indigo-400">{smartAlignStatus}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Lyrics Input */}
            <div className="h-[400px] lg:h-auto">
              <LyricsInput value={lyrics} onChange={setLyrics} />
            </div>
          </div>

          {/* Action Area */}
          <div className="flex flex-col items-center justify-center space-y-4 py-2">
            <button
              onClick={handleGenerate}
              disabled={(!file && !useMock) || processingState.step !== 'idle'}
              className={`
                  relative px-8 py-4 rounded-xl font-bold text-lg shadow-xl transition-all duration-200
                  ${(!file && !useMock) || processingState.step !== 'idle'
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-indigo-500/25 hover:-translate-y-0.5'
                }
                `}
            >
              {processingState.step === 'idle' ? 'Generate Synchronized SRT' : 'Processing...'}
            </button>

            {processingState.step === 'error' && (
              <div className="flex items-center space-x-3 text-red-400 bg-red-400/10 px-4 py-2 rounded-lg max-w-lg">
                <AlertCircle size={20} className="flex-shrink-0" />
                <span className="text-sm">{processingState.message}</span>
                {processingState.message?.includes("Demo Mode") && (
                  <button
                    onClick={() => setUseMock(true)}
                    className="ml-auto text-xs bg-red-500/20 hover:bg-red-500/30 text-red-200 px-2 py-1 rounded transition-colors flex items-center space-x-1 whitespace-nowrap"
                  >
                    <RefreshCw size={12} />
                    <span>Enable Demo</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Pipeline Visualization */}
          {processingState.step !== 'idle' && processingState.step !== 'error' && (
            <PipelineSteps state={processingState} />
          )}

          {/* Results Section */}
          {result && (
            <div className="flex-grow min-h-[400px] animate-in fade-in slide-in-from-bottom-4 duration-500">
              <SrtOutput result={result} />
            </div>
          )}

        </div>
      </main>

      {/* Footer Instructions */}
      <footer className="py-6 text-center text-slate-600 text-xs border-t border-slate-800/50 mt-8">
        <p>To run the backend: <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-400">uvicorn backend_server:app --reload</code></p>
      </footer>
    </div>
  );
};

export default App;