import React, { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, FileAudio, FileText, AlignCenter, FileCheck } from 'lucide-react';
import { ProcessingState } from '../types';

interface PipelineStepsProps {
  state: ProcessingState;
}

const steps = [
  { id: 'uploading', label: 'Uploading', icon: FileAudio },
  { id: 'transcribing', label: 'Transcribing', icon: FileText },
  { id: 'aligning', label: 'Aligning', icon: AlignCenter },
  { id: 'completed', label: 'Ready', icon: FileCheck },
];

const PipelineSteps: React.FC<PipelineStepsProps> = ({ state }) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedMessage, setEstimatedMessage] = useState('');

  useEffect(() => {
    if (state.step === 'uploading' || state.step === 'transcribing' || state.step === 'aligning') {
      setElapsedTime(0);
      const interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [state.step]);

  useEffect(() => {
    if (state.step === 'transcribing' || state.step === 'aligning') {
      if (elapsedTime < 10) {
        setEstimatedMessage('Uploading to server...');
      } else if (elapsedTime < 30) {
        setEstimatedMessage('Loading model...');
      } else if (elapsedTime < 60) {
        setEstimatedMessage('Transcription in progress...');
      } else if (elapsedTime < 120) {
        setEstimatedMessage('Aligning lyrics...');
      } else {
        setEstimatedMessage('Finalizing output...');
      }
    }
  }, [elapsedTime, state.step]);

  let activeIndex = -1;
  if (state.step === 'uploading') activeIndex = 0;
  if (state.step === 'transcribing') activeIndex = 1;
  if (state.step === 'aligning') activeIndex = 2;
  if (state.step === 'completed') activeIndex = 3;

  const isProcessing = state.step === 'transcribing' || state.step === 'aligning';

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between max-w-3xl mx-auto relative">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/10 -z-10 transform -translate-y-1/2"></div>
        <div
          className="absolute top-1/2 left-0 h-0.5 bg-emerald-400 -z-10 transform -translate-y-1/2 transition-all duration-500"
          style={{ width: `${Math.max(0, (activeIndex / (steps.length - 1)) * 100)}%` }}
        ></div>

        {steps.map((step, index) => {
          const isActive = index === activeIndex;
          const isCompleted = index < activeIndex || state.step === 'completed';

          return (
            <div key={step.id} className="flex flex-col items-center bg-slate-950/60 px-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                  ${isCompleted
                    ? 'bg-emerald-400 border-emerald-400 text-slate-900'
                    : isActive
                      ? 'bg-slate-950 border-emerald-400 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.45)]'
                      : 'bg-slate-900 border-white/10 text-slate-500'
                  }
                `}
              >
                {isCompleted ? (
                  <CheckCircle2 size={20} />
                ) : isActive ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <step.icon size={18} />
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium transition-colors duration-300 
                  ${isActive || isCompleted ? 'text-emerald-300' : 'text-slate-500'}
                `}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="max-w-3xl mx-auto mt-6">
        {isProcessing ? (
          <>
            <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden shadow-inner relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-cyan-300 to-emerald-400 animate-[shimmer_2s_ease-in-out_infinite] opacity-80"
                style={{
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s ease-in-out infinite',
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs">
              <span className="text-slate-400">{estimatedMessage}</span>
              <span className="font-mono font-bold text-emerald-300">
                {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </>
        ) : state.step === 'completed' ? (
          <>
            <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden shadow-inner">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-300 w-full" />
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              <span>Completed</span>
              <span className="font-mono font-bold text-green-400">100%</span>
            </div>
          </>
        ) : null}
      </div>

      {state.message && (
        <div className="text-center mt-4 text-sm text-slate-400 animate-pulse">
          {state.message}...
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
      `}</style>
    </div>
  );
};

export default PipelineSteps;
