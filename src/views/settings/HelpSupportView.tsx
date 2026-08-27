import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, HelpCircle, ChevronDown, Mail, Wrench, BookOpen } from 'lucide-react';
import { Language } from '../../types';
import { translations } from '../../i18n/translations';

interface HelpSupportProps {
  language: Language;
  onBack: () => void;
}

export const HelpSupportView: React.FC<HelpSupportProps> = ({ language, onBack }) => {
  const t = translations[language] || translations.en;
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    { q: t.faq1Q, a: t.faq1A },
    { q: t.faq2Q, a: t.faq2A },
    { q: t.faq3Q, a: t.faq3A },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      <div className="flex items-center justify-between">
        <button
          id="help-back-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-mono text-white/60 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{t.backToSettings}</span>
        </button>
      </div>

      <div>
        <h2 className="font-luxury text-2xl font-bold text-white flex items-center gap-2.5">
          <HelpCircle className="w-6 h-6 text-[#D4AF37]" />
          <span>{t.helpSupportTitle}</span>
        </h2>
        <p className="text-xs text-white/50 font-mono mt-1">
          {t.helpSupportDesc}
        </p>
      </div>

      {/* FAQ Accordion Section */}
      <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-6 space-y-4">
        <h3 className="font-luxury font-bold text-white text-lg flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#D4AF37]" />
          <span>{t.faqTitle}</span>
        </h3>

        <div className="space-y-2.5">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-xl bg-white/[0.03] border border-white/5 overflow-hidden transition"
              >
                <button
                  id={`faq-btn-${idx}`}
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-4 flex items-center justify-between text-left gap-3 cursor-pointer hover:bg-white/[0.02]"
                >
                  <span className="font-luxury font-bold text-sm text-white">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-white/40 transition-transform duration-200 shrink-0 ${
                      isOpen ? 'rotate-180 text-[#D4AF37]' : ''
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-4 pb-4 text-xs text-white/70 font-sans leading-relaxed border-t border-white/5 pt-2"
                    >
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Troubleshooting Guide */}
      <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-6 space-y-3">
        <h3 className="font-luxury font-bold text-white text-lg flex items-center gap-2">
          <Wrench className="w-4 h-4 text-[#D4AF37]" />
          <span>{t.troubleshootingTitle}</span>
        </h3>
        <ul className="space-y-2 text-xs font-mono text-white/70">
          <li className="flex items-start gap-2">
            <span className="text-[#D4AF37]">•</span>
            <span>{t.troubleshooting1}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#D4AF37]">•</span>
            <span>{t.troubleshooting2}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#D4AF37]">•</span>
            <span>{t.troubleshooting3}</span>
          </li>
        </ul>
      </div>

      {/* App Usage Guide */}
      <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-6 space-y-2">
        <h3 className="font-luxury font-bold text-white text-base">
          {t.appUsageTitle}
        </h3>
        <p className="text-xs text-white/70 font-sans leading-relaxed">
          {t.appUsageText}
        </p>
      </div>

      {/* Contact Support Direct Action */}
      <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-luxury font-bold text-white text-base">
            {t.contactSupportTitle}
          </h3>
          <p className="text-xs text-white/50 mt-0.5">
            {t.contactSupportDesc}
          </p>
        </div>

        <a
          id="contact-support-email-btn"
          href="mailto:support@soberwatch.io?subject=SoberWatch%20Hardware%20Support"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#c49f2f] text-black font-bold font-mono text-xs transition shrink-0"
        >
          <Mail className="w-4 h-4" />
          <span>{t.sendSupportEmail}</span>
        </a>
      </div>
    </div>
  );
};
