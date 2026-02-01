import React, { useState } from 'react';
import { Download, Copy, FileJson, FileText, Check } from 'lucide-react';
import { AlignmentResult } from '../types';

interface SrtOutputProps {
  result: AlignmentResult;
}

const SrtOutput: React.FC<SrtOutputProps> = ({ result }) => {
  const [activeTab, setActiveTab] = useState<'srt' | 'json'>('srt');
  const [copied, setCopied] = useState(false);

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
    a.download = `output.${activeTab}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col h-full shadow-lg">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('srt')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5
              ${activeTab === 'srt' 
                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}
          >
            <FileText size={14} />
            <span>SRT Subtitles</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5
              ${activeTab === 'json' 
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}
          >
            <FileJson size={14} />
            <span>Word Timestamps (JSON)</span>
          </button>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center space-x-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            <Download size={14} />
            <span>Download</span>
          </button>
        </div>
      </div>

      <div className="flex-grow relative bg-slate-900 overflow-auto">
        <pre className="absolute inset-0 p-4 text-xs md:text-sm font-mono text-slate-300 whitespace-pre-wrap overflow-auto scrollbar-thin">
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