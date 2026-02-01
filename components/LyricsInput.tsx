import React from 'react';
import { AlignLeft } from 'lucide-react';

interface LyricsInputProps {
  value: string;
  onChange: (value: string) => void;
}

const LyricsInput: React.FC<LyricsInputProps> = ({ value, onChange }) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center space-x-2 mb-3 text-slate-300">
        <AlignLeft size={18} />
        <span className="font-medium text-sm">Lyrics / Transcript</span>
      </div>
      <div className="relative flex-grow">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste the raw lyrics here..."
          className="w-full h-64 md:h-full min-h-[200px] p-4 bg-slate-800 border border-slate-700 rounded-xl 
            text-slate-300 placeholder-slate-500 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent scrollbar-thin"
        />
        <div className="absolute bottom-3 right-3 text-xs text-slate-500 bg-slate-800/80 px-2 py-1 rounded">
          {value.length} chars
        </div>
      </div>
    </div>
  );
};

export default LyricsInput;