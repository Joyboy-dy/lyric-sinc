import React from 'react';
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
  // Determine current active index based on state
  let activeIndex = -1;
  if (state.step === 'uploading') activeIndex = 0;
  if (state.step === 'transcribing') activeIndex = 1;
  if (state.step === 'aligning') activeIndex = 2;
  if (state.step === 'completed') activeIndex = 3;

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

      {/* Progress Bar */}
      <div className="max-w-3xl mx-auto mt-6">
        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
            style={{ width: `${Math.max(5, (activeIndex / (steps.length - 1)) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span>Progression</span>
          <span className="font-mono font-bold text-indigo-400">
            {Math.round((activeIndex / (steps.length - 1)) * 100)}%
          </span>
        </div>
      </div>

      {state.message && (
        <div className="text-center mt-4 text-sm text-slate-400 animate-pulse">
          {state.message}...
        </div>
      )}
    </div>
  );
};

export default PipelineSteps;