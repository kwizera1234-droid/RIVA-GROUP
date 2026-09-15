import React, { useState } from 'react';
import { motion } from 'motion/react';
import { KeyRound } from 'lucide-react';
import { UserProfile, Language } from '../types';
import { translations } from '../i18n/translations';
import { firebaseErrorMessage, refreshFirebaseUser, resendVerificationEmail, userToProfile } from '../services/firebase';

interface VerifyProps {
  email: string;
  onVerified: (user: UserProfile) => void;
  onBackToLogin: () => void;
  language: Language;
}

export const VerifyScreen: React.FC<VerifyProps> = ({ 
  email, 
  onVerified, 
  onBackToLogin,
  language 
}) => {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const t = translations[language] || translations.en;

  const handleDigitChange = (index: number, val: string) => {
    if (val.length > 1) {
      val = val.slice(-1);
    }
    const newDigits = [...digits];
    newDigits[index] = val;
    setDigits(newDigits);

    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const user = await refreshFirebaseUser();
      if (!user) throw new Error('Authentication session expired. Please sign in again.');
      if (!user.emailVerified) throw new Error('Email verification is not complete. Open the verification email and try again.');
      const savedPhoto = localStorage.getItem('soberwatch_temp_avatar') || undefined;
      onVerified({
        ...userToProfile(user),
        photoUrl: savedPhoto,
      });
    } catch (error) {
      setIsVerifying(false);
      const message = firebaseErrorMessage(error);
      window.alert(message);
    }
  };

  const handleResend = async () => {
    try {
      await resendVerificationEmail();
      window.alert('Verification email sent.');
    } catch (error) {
      window.alert(firebaseErrorMessage(error));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-transparent">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="rounded-[20px] bg-white/[0.05] backdrop-blur-[20px] border border-white/10 p-6 sm:p-8 space-y-6 text-center shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
          <div className="w-12 h-12 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] mx-auto">
            <KeyRound className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h2 className="font-luxury text-2xl font-bold text-white">
              {t.verifyTitle}
            </h2>
            <p className="text-xs text-white/50 font-mono">
              {t.verifySubtitle} {email}
            </p>
          </div>

          <div className="flex justify-center gap-2">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                id={`otp-input-${idx}`}
                type="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                className="w-10 h-12 rounded-[12px] bg-white/5 border border-white/15 text-center font-mono text-lg font-bold text-white focus:outline-none focus:border-[#D4AF37] transition"
              />
            ))}
          </div>

          <button
            id="verify-submit-btn"
            type="button"
            onClick={handleVerify}
            disabled={isVerifying}
            className="w-full py-3 rounded-[16px] bg-[#D4AF37] hover:bg-[#c49f2f] text-black font-semibold text-xs tracking-wider uppercase transition cursor-pointer active:scale-98"
          >
            {isVerifying ? t.verifying : t.verifyBtn}
          </button>

          <button type="button" onClick={handleResend} className="text-xs font-mono text-[#D4AF37] hover:underline">
            Resend verification email
          </button>

          <button
            id="back-to-login-btn"
            onClick={onBackToLogin}
            className="text-xs font-mono text-white/40 hover:text-white transition cursor-pointer"
          >
            {t.backToLogin}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
