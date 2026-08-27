import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Bell, Mail, AlertOctagon, AlertTriangle, Volume2, Check } from 'lucide-react';
import { NotificationPreferences, Language } from '../../types';
import { translations } from '../../i18n/translations';

interface NotificationsProps {
  language: Language;
  onBack: () => void;
}

export const NotificationsView: React.FC<NotificationsProps> = ({ language, onBack }) => {
  const t = translations[language] || translations.en;

  const [prefs, setPrefs] = useState<NotificationPreferences>(() => {
    const saved = localStorage.getItem('soberwatch_notif_prefs');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      pushEnabled: true,
      emailEnabled: true,
      dangerAlertsEnabled: true,
      highCautionAlerts: true,
      soundEnabled: true
    };
  });

  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    localStorage.setItem('soberwatch_notif_prefs', JSON.stringify(prefs));
  }, [prefs]);

  const toggle = (key: keyof NotificationPreferences) => {
    setPrefs((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
      return updated;
    });
  };

  const items: {
    key: keyof NotificationPreferences;
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      key: 'pushEnabled',
      title: t.pushNotifications,
      desc: t.pushNotificationsDesc,
      icon: Bell
    },
    {
      key: 'emailEnabled',
      title: t.emailNotifications,
      desc: t.emailNotificationsDesc,
      icon: Mail
    },
    {
      key: 'dangerAlertsEnabled',
      title: t.dangerAlertToggle,
      desc: t.dangerAlertToggleDesc,
      icon: AlertOctagon
    },
    {
      key: 'highCautionAlerts',
      title: t.cautionAlertToggle,
      desc: t.cautionAlertToggleDesc,
      icon: AlertTriangle
    },
    {
      key: 'soundEnabled',
      title: t.soundAlerts,
      desc: t.soundAlertsDesc,
      icon: Volume2
    }
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      <div className="flex items-center justify-between">
        <button
          id="notif-back-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-mono text-white/60 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{t.backToSettings}</span>
        </button>

        {savedFeedback && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5 text-[11px] font-mono text-[#D4AF37] bg-[#D4AF37]/15 px-3 py-1 rounded-full border border-[#D4AF37]/30"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t.notificationSaved}</span>
          </motion.div>
        )}
      </div>

      <div>
        <h2 className="font-luxury text-2xl font-bold text-white flex items-center gap-2.5">
          <Bell className="w-6 h-6 text-[#D4AF37]" />
          <span>{t.notificationsTitle}</span>
        </h2>
        <p className="text-xs text-white/50 font-mono mt-1">
          {t.notificationsDesc}
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isEnabled = prefs[item.key];

          return (
            <div
              key={item.key}
              className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-5 flex items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-[#D4AF37] shrink-0 mt-0.5">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="font-luxury font-bold text-white text-base">
                    {item.title}
                  </h3>
                  <p className="text-xs text-white/50 font-sans max-w-lg">
                    {item.desc}
                  </p>
                </div>
              </div>

              {/* Luxury Toggle Switch */}
              <button
                id={`toggle-${item.key}`}
                type="button"
                onClick={() => toggle(item.key)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isEnabled ? 'bg-[#D4AF37]' : 'bg-white/10'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out ${
                    isEnabled ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/60'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
