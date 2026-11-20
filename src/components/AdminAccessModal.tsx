import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

interface AdminAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccessGranted: () => void;
}

export function AdminAccessModal({ isOpen, onClose, onAccessGranted }: AdminAccessModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim() === '2013') {
      sessionStorage.setItem('mideocode_admin_password_unlocked', 'true');
      setError(null);
      setPassword('');
      onAccessGranted();
    } else {
      setError('Incorrect admin password. Required password is 2013.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/30 text-blue-500 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Admin Console Verification
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          Administrator access requires secure authentication. Please enter the master security code to proceed.
        </p>

        <form onSubmit={handleVerify} className="space-y-4 pt-1">
          <div>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter admin password"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-center font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
            {error && <p className="text-xs text-red-500 mt-1.5 text-center">{error}</p>}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow"
            >
              Verify
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
