import React from 'react';
import { ChevronLeft, Info, Cpu, ShieldCheck } from 'lucide-react';
import { SoberWatchLogo } from '../../components/SoberWatchLogo';
import { Language } from '../../types';
import { translations } from '../../i18n/translations';

interface AboutProps {
  language: Language;
  onBack: () => void;
}

export const AboutView: React.FC<AboutProps> = ({ language, onBack }) => {
  const t = translations[language] || translations.en;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      <div className="flex items-center justify-between">
        <button
          id="about-back-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-mono text-white/60 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{t.backToSettings}</span>
        </button>
      </div>

      {/* Brand Hero Card */}
      <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[24px] p-8 text-center space-y-4 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
        <div className="flex justify-center">
          <SoberWatchLogo size={64} variant="original" />
        </div>
        <div className="space-y-1">
          <h2 className="font-luxury text-3xl font-bold text-white">
            {t.appName}
          </h2>
          <div className="text-xs font-mono text-[#D4AF37] font-semibold">
            {t.version}
          </div>
        </div>
        <p className="text-xs text-white/70 max-w-lg mx-auto font-sans leading-relaxed">
          {t.productDesc}
        </p>
      </div>

      {/* Hardware & Cloud Technology Specs */}
      <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-6 space-y-3">
        <h3 className="font-luxury font-bold text-white text-base flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#D4AF37]" />
          <span>{t.hardwareSpecsTitle}</span>
        </h3>
        <p className="text-xs text-white/70 font-mono leading-relaxed bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
          {t.hardwareSpecs}
        </p>
      </div>

      {/* Security Certification */}
      <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-6 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="font-luxury font-bold text-white text-sm">
            Zero-Trust Biometric Security
          </h3>
          <p className="text-xs text-white/50 font-sans">
            End-to-end encrypted hardware authentication connecting directly with Render Cloud Backend.
          </p>
        </div>
      </div>

      {/* Useful Footer Links */}
      <div className="pt-2 flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-white/60 border-t border-white/5">
        <a 
          href="https://soberwatch-backend.onrender.com/api/telemetry/health" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-[#D4AF37] hover:underline"
        >
          Cloud Backend Status ↗
        </a>
        <span className="text-white/20">•</span>
        <a 
          href="mailto:support@soberwatch.io" 
          className="hover:text-white transition"
        >
          Developer Contact
        </a>
        <span className="text-white/20">•</span>
        <a 
          href="tel:112" 
          className="text-red-400 hover:text-red-300 font-bold"
        >
          Emergency: 112
        </a>
      </div>

      {/* Copyright Notice */}
      <div className="text-center pt-2">
        <p className="text-[11px] font-mono text-white/40">
          {t.copyrightNotice}
        </p>
      </div>
    </div>
  );
};
