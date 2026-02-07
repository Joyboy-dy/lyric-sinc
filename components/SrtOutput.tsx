import React, { useState } from 'react';
import { Download, Copy, FileText, Check } from 'lucide-react';
import { SrtResult } from '../types';

interface SrtOutputProps {
  result: SrtResult;
  filename?: string;
  metadata?: { artist: string | null; title: string | null } | null;
  label?: string;
}

const SrtOutput: React.FC<SrtOutputProps> = ({ result, filename = 'output', metadata, label }) => {
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
    navigator.clipboard.writeText(result.srt_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([result.srt_content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generateFilename()}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col h-full shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/70 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/30 flex items-center gap-1.5">
            <FileText size={14} />
            <span>{label ? `SRT • ${label}` : 'SRT Subtitles'}</span>
          </div>
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
          {result.srt_content}
        </pre>
      </div>
    </div>
  );
};

export default SrtOutput;
