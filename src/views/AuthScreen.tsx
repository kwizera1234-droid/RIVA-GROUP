import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, Camera, Trash2, User, UploadCloud } from 'lucide-react';
import { UserProfile, Language } from '../types';
import { SoberWatchLogo } from '../components/SoberWatchLogo';
import { translations } from '../i18n/translations';
import {
  firebaseErrorMessage,
  registerWithEmail,
  resendVerificationEmail,
  signInWithEmail,
  signInWithGoogle,
  userToProfile,
} from '../services/firebase';

interface AuthProps {
  onSuccess: (user: UserProfile) => void;
  onRequireVerification: (email: string) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  startupError?: string | null;
}

export const AuthScreen: React.FC<AuthProps> = ({ 
  onSuccess, 
  onRequireVerification,
  language,
  onLanguageChange,
  startupError = null,
}) => {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => {
    return localStorage.getItem('soberwatch_temp_avatar') || null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(startupError);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const t = translations[language] || translations.en;

  const handlePhotoSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WEBP)');
      return;
    }
    // Limit to 5MB max
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPhotoUrl(dataUrl);
      localStorage.setItem('soberwatch_temp_avatar', dataUrl);
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePhotoSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handlePhotoSelect(file);
    }
  };

  const handleRemovePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotoUrl(null);
    localStorage.removeItem('soberwatch_temp_avatar');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please enter email and password');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    if (isRegister) {
      if (photoUrl) {
        localStorage.setItem('soberwatch_temp_avatar', photoUrl);
      }
      try {
        await registerWithEmail(email, password, name.trim() || undefined);
        await resendVerificationEmail();
        onRequireVerification(email);
      } catch (error) {
        setErrorMessage(firebaseErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    } else {
      try {
        const firebaseUser = await signInWithEmail(email, password);
        const savedAvatar = photoUrl || localStorage.getItem('soberwatch_temp_avatar') || undefined;
        onSuccess({
          ...userToProfile(firebaseUser),
          photoUrl: savedAvatar,
        });
      } catch (error) {
        setErrorMessage(firebaseErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const firebaseUser = await signInWithGoogle();
      const savedAvatar = photoUrl || localStorage.getItem('soberwatch_temp_avatar') || undefined;
      onSuccess({
        ...userToProfile(firebaseUser),
        photoUrl: savedAvatar,
      });
    } catch (error) {
      setErrorMessage(firebaseErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = () => {
    setErrorMessage('Guest access is unavailable because telemetry requires an authenticated Firebase account.');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-transparent">
      {/* Quick Language bar */}
      <div className="mb-4 flex items-center gap-1.5 p-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-[20px]">
        {(['en', 'rw', 'sw'] as Language[]).map((lang) => (
          <button
            key={lang}
            onClick={() => onLanguageChange(lang)}
            className={`px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase transition cursor-pointer ${
              language === lang ? 'bg-[#D4AF37] text-black' : 'text-white/60 hover:text-white'
            }`}
          >
            {lang}
          </button>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="rounded-[24px] bg-[#0B0D14]/90 backdrop-blur-[28px] border border-white/15 p-6 sm:p-8 space-y-5 shadow-[0_15px_45px_rgba(0,0,0,0.85)]">
          {/* App Header with Logo */}
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <SoberWatchLogo size={48} variant="original" />
            </div>
            <div>
              <h1 className="font-luxury text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {t.appName}
              </h1>
              <p className="text-xs text-white/50 font-mono mt-0.5">
                {isRegister 
                  ? (language === 'rw' ? 'Kora Konti Nshya & Shyiraho Ifoto yawe' : 'Create Account & Upload Photo')
                  : t.subtitle}
              </p>
            </div>
          </div>

          {/* Registration Profile Photo Uploader */}
          {isRegister && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-2 py-2"
            >
              <div 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="relative group cursor-pointer"
                title="Click or drag to upload profile photo"
              >
                {/* Instagram Story-Style Glowing Ring */}
                <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-[#D4AF37] via-amber-300 to-cyan-400 shadow-[0_0_20px_rgba(212,175,55,0.4)] transition-transform group-hover:scale-105">
                  <div className="w-full h-full rounded-full overflow-hidden bg-[#12141F] flex flex-col items-center justify-center relative">
                    {photoUrl ? (
                      <img 
                        src={photoUrl} 
                        alt="Profile preview" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-white/60 group-hover:text-white transition">
                        <UploadCloud className="w-7 h-7 text-[#D4AF37] mb-1 group-hover:scale-110 transition-transform" />
                        <span className="text-[9px] font-mono text-[#D4AF37] font-semibold uppercase tracking-wider">
                          {language === 'rw' ? 'Shyiraho Ifoto' : 'Upload Photo'}
                        </span>
                      </div>
                    )}

                    {/* Camera icon badge in corner */}
                    <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-[#D4AF37] text-black shadow-md border-2 border-black">
                      <Camera className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* Remove Photo Action if uploaded */}
                {photoUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    title="Remove Photo"
                    className="absolute -top-1 -right-1 p-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg border border-white/20 transition cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              <input 
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp, image/gif"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <span className="text-[11px] font-mono text-white/40 text-center">
                {photoUrl 
                  ? (language === 'rw' ? 'Ifoto yashyizweho neza' : 'Profile photo ready')
                  : (language === 'rw' ? 'Kanda hano uhitemo ifoto yawe y\'umwirondoro' : 'Tap above to upload your profile photo')}
              </span>
            </motion.div>
          )}

          {/* Google Sign-In Button */}
          <button
            id="google-signin-btn"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-[16px] bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold tracking-wide flex items-center justify-center gap-2.5 transition cursor-pointer active:scale-98"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.3l3.7 2.9C6.2 7.3 8.9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.3 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.6 7.3C.6 9.3 0 11.1 0 12s.6 2.7 1.6 4.7l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.2L1.6 16C3.5 19.7 7.4 23 12 23z"
              />
            </svg>
            <span>{t.googleLogin}</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="h-[1px] flex-1 bg-white/10" />
            <span className="text-[10px] font-mono text-white/40 uppercase">{t.or}</span>
            <span className="h-[1px] flex-1 bg-white/10" />
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isRegister && (
              <div>
                <div className="relative">
                  <User className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-name-input"
                    type="text"
                    placeholder={language === 'rw' ? 'Izina ryawe (Full Name)' : 'Full Name'}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-[16px] pl-10 pr-4 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#D4AF37] transition font-mono"
                  />
                </div>
              </div>
            )}

            <div>
              <div className="relative">
                <Mail className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email-input"
                  type="email"
                  required
                  placeholder={t.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-[16px] pl-10 pr-4 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#D4AF37] transition font-mono"
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-password-input"
                  type="password"
                  required
                  placeholder={t.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-[16px] pl-10 pr-4 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#D4AF37] transition font-mono"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/30 text-red-300 text-xs font-mono">
                {errorMessage}
              </div>
            )}

            <button
              id="auth-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-[16px] bg-[#D4AF37] hover:bg-[#c49f2f] text-black font-semibold text-xs tracking-wider uppercase transition cursor-pointer active:scale-98 shadow-[0_4px_15px_rgba(212,175,55,0.3)]"
            >
              {isLoading ? t.processing : (isRegister ? t.register : t.login)}
            </button>
          </form>

          {/* Toggle login / register & Guest access */}
          <div className="flex items-center justify-between text-xs font-mono text-white/50 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => { setIsRegister(!isRegister); setErrorMessage(null); }}
              className="hover:text-[#D4AF37] transition cursor-pointer text-left"
            >
              {isRegister ? t.haveAccount : t.noAccount}
            </button>

            <button
              type="button"
              onClick={handleGuestLogin}
              className="text-white/60 hover:text-white transition cursor-pointer shrink-0 ml-2"
            >
              {t.guestLogin}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
