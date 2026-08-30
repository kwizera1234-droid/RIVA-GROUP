import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { SoberWatchLogo } from '../components/SoberWatchLogo';
import { applyPasswordReset, firebaseErrorMessage, signInWithEmail, validatePasswordResetCode } from '../services/firebase';

interface PasswordResetViewProps {
  onBackToLogin: () => void;
}

function passwordError(password: string, confirmation: string) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Use uppercase, lowercase, and a number.';
  }
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split('@');
  if (!localPart || !domain) return 'your account email';
  return `${localPart.slice(0, 2)}${'*'.repeat(Math.max(2, localPart.length - 2))}@${domain}`;
}

export const PasswordResetView: React.FC<PasswordResetViewProps> = ({ onBackToLogin }) => {
  const [code, setCode] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const actionCode = params.get('oobCode');
    if (!actionCode || params.get('mode') !== 'resetPassword') {
      setErrorMessage('This password reset link is invalid or incomplete.');
      setIsChecking(false);
      return;
    }
    validatePasswordResetCode(actionCode)
      .then((info) => {
        setCode(actionCode);
        setAccountEmail(info.data.email || '');
      })
      .catch((error) => setErrorMessage(firebaseErrorMessage(error)))
      .finally(() => setIsChecking(false));
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = passwordError(password, confirmation);
    if (validationError || !code) {
      setErrorMessage(validationError || 'This password reset link is no longer valid.');
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await applyPasswordReset(code, password);
      if (accountEmail) {
        try {
          await signInWithEmail(accountEmail, password);
        } catch (signInError) {
          console.warn('Password reset succeeded but auto sign-in failed:', signInError);
        }
      }
      setIsComplete(true);
    } catch (error) {
      setErrorMessage(firebaseErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-transparent">
      <div className="w-full max-w-md rounded-[24px] bg-[#0B0D14]/90 backdrop-blur-[28px] border border-white/15 p-6 sm:p-8 space-y-6 shadow-[0_15px_45px_rgba(0,0,0,0.85)]">
        <div className="text-center space-y-2">
          <SoberWatchLogo size={48} variant="original" />
          <h1 className="font-luxury text-2xl font-bold text-white">Reset your password</h1>
          <p className="text-xs text-white/50 font-mono">Secure SoberWatch account recovery</p>
        </div>

        {isChecking && <p className="text-center text-xs text-white/60 font-mono">Checking reset link...</p>}
        {isComplete ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400" />
            <p className="text-sm text-white">Your password has been updated successfully.</p>
            <button type="button" onClick={onBackToLogin} className="w-full py-3 rounded-[16px] bg-[#D4AF37] text-black font-semibold text-xs uppercase">Return to Sign In</button>
          </div>
        ) : !isChecking && code ? (
          <form onSubmit={handleSave} className="space-y-4">
            {accountEmail && <p className="text-xs text-white/50 font-mono text-center">Updating password for {maskEmail(accountEmail)}</p>}
            <label className="block relative">
              <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input aria-label="New Password" required type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New Password" className="w-full bg-white/5 border border-white/10 rounded-[16px] pl-10 pr-11 py-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#D4AF37]" />
              <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </label>
            <label className="block relative">
              <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input aria-label="Confirm Password" required type={showConfirmation ? 'text' : 'password'} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirm Password" className="w-full bg-white/5 border border-white/10 rounded-[16px] pl-10 pr-11 py-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#D4AF37]" />
              <button type="button" aria-label={showConfirmation ? 'Hide confirmation password' : 'Show confirmation password'} onClick={() => setShowConfirmation(!showConfirmation)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50">{showConfirmation ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </label>
            <p className="text-[11px] text-white/40 font-mono">At least 8 characters, with uppercase, lowercase, and a number.</p>
            {errorMessage && <p role="alert" className="flex gap-2 items-center p-3 rounded-xl bg-red-950/50 border border-red-500/30 text-red-300 text-xs font-mono"><AlertCircle className="w-4 h-4 shrink-0" />{errorMessage}</p>}
            <button type="submit" disabled={isSaving} className="w-full py-3 rounded-[16px] bg-[#D4AF37] text-black font-semibold text-xs uppercase disabled:opacity-50">{isSaving ? 'Saving...' : 'Save New Password'}</button>
          </form>
        ) : (
          <div className="space-y-4 text-center">
            {errorMessage && <p role="alert" className="text-xs text-red-300 font-mono">{errorMessage}</p>}
            <button type="button" onClick={onBackToLogin} className="w-full py-3 rounded-[16px] bg-[#D4AF37] text-black font-semibold text-xs uppercase">Return to Sign In</button>
          </div>
        )}
      </div>
    </div>
  );
};