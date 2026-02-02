import React, { useState } from 'react';
import { Download, Copy, FileJson, FileText, Check } from 'lucide-react';
import { AlignmentResult } from '../types';

interface SrtOutputProps {
  result: AlignmentResult;
  filename?: string;
  metadata?: { artist: string | null; title: string | null } | null;
}

const SrtOutput: React.FC<SrtOutputProps> = ({ result, filename = 'output', metadata }) => {
  const [activeTab, setActiveTab] = useState<'srt' | 'json'>('srt');
  const [copied, setCopied] = useState(false);

  const generateFilename = (): string => {
    // Priority 1: Use metadata if available
    if (metadata?.artist && metadata?.title) {
      const sanitized = `${metadata.artist} - ${metadata.title}`
        .replace(/[<>:"/\\|?*]/g, '-') // Remove invalid filename chars
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
      return sanitized;
    }

    // Priority 2: Use audio filename without extension
    const nameWithoutExt = filename.replace(/\.(mp3|wav|m4a|flac|ogg|aac)$/i, '');
    return nameWithoutExt || 'output';
  };

  const handleCopy = () => {
    const content = activeTab === 'srt' ? result.srt_content : JSON.stringify(result.full_json, null, 2);
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = activeTab === 'srt' ? result.srt_content : JSON.stringify(result.full_json, null, 2);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generateFilename()}.${activeTab}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col h-full shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/70 border-b border-white/10">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('srt')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5
              ${activeTab === 'srt'
                ? 'bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
          >
            <FileText size={14} />
            <span>SRT Subtitles</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5
              ${activeTab === 'json'
                ? 'bg-cyan-300 text-slate-900 shadow-lg shadow-cyan-300/30'
                : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
          >
            <FileJson size={14} />
            <span>Word Timestamps (JSON)</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center space-x-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            <Download size={14} />
            <span>Download</span>
          </button>
        </div>
      </div>

      <div className="flex-grow relative bg-slate-950/70 overflow-auto">
        <pre className="absolute inset-0 p-4 text-xs md:text-sm font-mono text-slate-200 whitespace-pre-wrap overflow-auto">
          {activeTab === 'srt'
            ? result.srt_content
            : JSON.stringify(result.full_json, null, 2)
          }
        </pre>
      </div>
    </div>
  );
};

export default SrtOutput;
