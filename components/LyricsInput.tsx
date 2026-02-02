import React from 'react';
import { AlignLeft } from 'lucide-react';

interface LyricsInputProps {
  value: string;
  onChange: (value: string) => void;
}

const LyricsInput: React.FC<LyricsInputProps> = ({ value, onChange }) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3 text-slate-300">
        <AlignLeft size={18} />
        <span className="font-medium text-sm">Lyrics or transcript</span>
      </div>
      <div className="relative flex-grow">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste the lyrics here..."
          className="w-full h-64 md:h-full min-h-[220px] p-4 bg-slate-950/70 border border-white/10 rounded-2xl 
            text-slate-200 placeholder-slate-500 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-transparent"
        />
        <div className="absolute bottom-3 right-3 text-xs text-slate-500 bg-slate-950/80 border border-white/10 px-2 py-1 rounded-full">
          {value.length} chars
        </div>
      </div>
    </div>
  );
};

export default LyricsInput;
