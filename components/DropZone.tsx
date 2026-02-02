import React, { useCallback, useState } from 'react';
import { Upload, Music, X } from 'lucide-react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

const DropZone: React.FC<DropZoneProps> = ({ onFileSelected, selectedFile, onClear }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  }, [onFileSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  }, [onFileSelected]);

  if (selectedFile) {
    return (
      <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-5 flex items-center justify-between shadow-[0_12px_40px_rgba(15,23,42,0.35)]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-400/15 flex items-center justify-center text-emerald-300 border border-emerald-400/30">
            <Music size={22} />
          </div>
          <div>
            <p className="text-sm font-medium text-white">{selectedFile.name}</p>
            <p className="text-xs text-slate-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        </div>
        <button 
          onClick={onClear}
          className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-rose-300 transition-colors"
        >
          <X size={20} />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative group cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 ease-in-out
        ${isDragging ? 'border-emerald-400 bg-emerald-400/10' : 'border-white/15 hover:border-emerald-400/50 hover:bg-white/5'}
      `}
    >
      <input
        type="file"
        accept="audio/*"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className={`p-4 rounded-full bg-slate-950/80 border border-white/10 mb-4 transition-transform group-hover:scale-110 duration-200 ${isDragging ? 'text-emerald-300' : 'text-slate-300'}`}>
          <Upload size={30} />
        </div>
        <h3 className="text-lg font-semibold text-white mb-1">Upload audio</h3>
        <p className="text-sm text-slate-400 max-w-xs">
          Drag and drop or click to select MP3, WAV, or FLAC.
        </p>
      </div>
    </div>
  );
};

export default DropZone;
