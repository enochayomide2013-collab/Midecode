import { useState, useEffect } from 'react';
import { Volume2, VolumeX, Music, CloudRain, Radio } from 'lucide-react';
import { focusSound } from '../utils/focusSound';

export function FocusSoundWidget() {
  const [activeMode, setActiveMode] = useState<'off' | 'lofi' | 'rain' | 'whitenoise'>('off');
  const [volume, setVolume] = useState(0.3);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setActiveMode(focusSound.getMode());
  }, []);

  const handleToggleMode = (mode: 'lofi' | 'rain' | 'whitenoise') => {
    if (activeMode === mode) {
      focusSound.stop();
      setActiveMode('off');
    } else {
      focusSound.play(mode);
      setActiveMode(mode);
    }
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    focusSound.setVolume(val);
  };

  const isPlaying = activeMode !== 'off';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Focus Mode Ambient Audio"
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
          isPlaying
            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 animate-pulse'
            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Music className={`w-3.5 h-3.5 ${isPlaying ? 'animate-bounce' : ''}`} />
        <span>Focus Audio {isPlaying ? `(${activeMode.toUpperCase()})` : ''}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-4 shadow-2xl z-50 space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Coding Focus Ambience</h3>
            </div>
            <button
              onClick={() => {
                focusSound.stop();
                setActiveMode('off');
              }}
              className="text-[11px] text-red-500 hover:underline cursor-pointer font-medium"
            >
              Turn Off
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleToggleMode('lofi')}
              className={`p-2.5 rounded-lg border text-center transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                activeMode === 'lofi'
                  ? 'border-blue-600 bg-blue-600/15 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 text-slate-600 dark:text-slate-400 text-xs'
              }`}
            >
              <Music className="w-4 h-4" />
              <span className="text-[11px]">Lofi Chill</span>
            </button>

            <button
              type="button"
              onClick={() => handleToggleMode('rain')}
              className={`p-2.5 rounded-lg border text-center transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                activeMode === 'rain'
                  ? 'border-blue-600 bg-blue-600/15 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 text-slate-600 dark:text-slate-400 text-xs'
              }`}
            >
              <CloudRain className="w-4 h-4" />
              <span className="text-[11px]">Cozy Rain</span>
            </button>

            <button
              type="button"
              onClick={() => handleToggleMode('whitenoise')}
              className={`p-2.5 rounded-lg border text-center transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                activeMode === 'whitenoise'
                  ? 'border-blue-600 bg-blue-600/15 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 text-slate-600 dark:text-slate-400 text-xs'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span className="text-[11px]">White Noise</span>
            </button>
          </div>

          <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Volume</span>
              <span className="font-mono">{Math.round(volume * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              {volume === 0 ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-blue-500" />}
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
