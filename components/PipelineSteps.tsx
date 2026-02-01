import React, { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, FileAudio, FileText, AlignCenter, FileCheck } from 'lucide-react';
import { ProcessingState, ProcessingStep } from '../types';

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

  // Reset timer when processing starts
  useEffect(() => {
    if (state.step === 'uploading' || state.step === 'transcribing' || state.step === 'aligning') {
      setElapsedTime(0);
      const interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [state.step]);

  // Update estimated messages based on elapsed time
  useEffect(() => {
    if (state.step === 'transcribing' || state.step === 'aligning') {
      if (elapsedTime < 10) {
        setEstimatedMessage('Envoi au serveur...');
      } else if (elapsedTime < 30) {
        setEstimatedMessage('Chargement du modèle...');
      } else if (elapsedTime < 60) {
        setEstimatedMessage('Transcription en cours...');
      } else if (elapsedTime < 120) {
        setEstimatedMessage('Alignement des paroles...');
      } else {
        setEstimatedMessage('Finalisation...');
      }
    }
  }, [elapsedTime, state.step]);

  // Determine current active index based on state
  let activeIndex = -1;
  if (state.step === 'uploading') activeIndex = 0;
  if (state.step === 'transcribing') activeIndex = 1;
  if (state.step === 'aligning') activeIndex = 2;
  if (state.step === 'completed') activeIndex = 3;

  const isProcessing = state.step === 'transcribing' || state.step === 'aligning';

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between max-w-3xl mx-auto relative">
        {/* Connecting Line */}
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-700 -z-10 transform -translate-y-1/2"></div>
        <div
          className="absolute top-1/2 left-0 h-0.5 bg-indigo-500 -z-10 transform -translate-y-1/2 transition-all duration-500"
          style={{ width: `${Math.max(0, (activeIndex / (steps.length - 1)) * 100)}%` }}
        ></div>

        {steps.map((step, index) => {
          const isActive = index === activeIndex;
          const isCompleted = index < activeIndex || state.step === 'completed';
          const isPending = index > activeIndex && state.step !== 'completed';

          return (
            <div key={step.id} className="flex flex-col items-center bg-slate-900 px-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                  ${isCompleted
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : isActive
                      ? 'bg-slate-900 border-indigo-500 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                      : 'bg-slate-800 border-slate-700 text-slate-500'
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
                  ${isActive || isCompleted ? 'text-indigo-400' : 'text-slate-500'}
                `}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Indeterminate Progress Bar (only when processing) */}
      <div className="max-w-3xl mx-auto mt-6">
        {isProcessing ? (
          <>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden shadow-inner relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-[shimmer_2s_ease-in-out_infinite] opacity-80"
                style={{
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s ease-in-out infinite'
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs">
              <span className="text-slate-400">{estimatedMessage}</span>
              <span className="font-mono font-bold text-indigo-400">
                {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </>
        ) : state.step === 'completed' ? (
          <>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden shadow-inner">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 w-full" />
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              <span>Terminé</span>
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

      {/* Add shimmer animation CSS */}
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