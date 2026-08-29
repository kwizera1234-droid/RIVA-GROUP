import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Plus, 
  Trash2, 
  Edit2, 
  Phone, 
  Mail, 
  UserCheck, 
  ShieldAlert, 
  Check, 
  Star, 
  AlertOctagon, 
  Flame, 
  Ambulance, 
  Car, 
  Activity, 
  FlaskConical, 
  MapPin, 
  ExternalLink,
  PhoneCall,
  Sliders,
  Sparkles
} from 'lucide-react';
import { EmergencyContact, Language, EmergencySettingsConfig, EmergencyEventRecord } from '../../types';
import { translations } from '../../i18n/translations';
import { emergencyService } from '../../services/emergencyService';
import { getLocalEmergencyHistory } from '../../services/api';
import { triggerNativeEmergencyCall } from '../../services/nativeBridge';

interface EmergencyContactsProps {
  language: Language;
  onBack: () => void;
}

export const EmergencyContactsView: React.FC<EmergencyContactsProps> = ({ language, onBack }) => {
  const t = translations[language] || translations.en;

  const [contacts, setContacts] = useState<EmergencyContact[]>(() => {
    const saved = localStorage.getItem('soberwatch_contacts');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  });

  const [config, setConfig] = useState<EmergencySettingsConfig>(() => emergencyService.getConfig());
  const [history, setHistory] = useState<EmergencyEventRecord[]>(() => getLocalEmergencyHistory());

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [isSecondary, setIsSecondary] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('soberwatch_contacts', JSON.stringify(contacts));
    
    // Sync with emergencyService config
    const primary = contacts.find((c) => c.isPrimary) || contacts[0] || null;
    const secondary = contacts.find((c) => c.isSecondary) || (contacts.length > 1 && !contacts[1].isPrimary ? contacts[1] : null);

    const updated = {
      ...config,
      primaryContact: primary,
      secondaryContact: secondary,
    };
    setConfig(updated);
    emergencyService.updateConfig(updated);
  }, [contacts]);

  const validatePhone = (val: string): boolean => {
    // Allows international (+250 788 123 456) or national formats (0788123456 or 112)
    const clean = val.replace(/[\s\-()]/g, '');
    const phoneRegex = /^(\+?[0-9]{3,15}|[0-9]{3,12})$/;
    return phoneRegex.test(clean);
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setEmail('');
    setRelationship('');
    setIsPrimary(contacts.length === 0);
    setIsSecondary(contacts.length === 1);
    setPhoneError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (contact: EmergencyContact) => {
    setEditingId(contact.id);
    setName(contact.name);
    setPhone(contact.phone);
    setEmail(contact.email || '');
    setRelationship(contact.relationship || '');
    setIsPrimary(!!contact.isPrimary);
    setIsSecondary(!!contact.isSecondary);
    setPhoneError(null);
    setIsFormOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    if (!validatePhone(phone.trim())) {
      setPhoneError(t.phoneValidationErr);
      return;
    }

    setPhoneError(null);

    let updatedContacts = [...contacts];

    if (editingId) {
      updatedContacts = updatedContacts.map((c) => {
        if (c.id === editingId) {
          return {
            ...c,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            relationship: relationship.trim(),
            isPrimary,
            isSecondary: !isPrimary && isSecondary,
          };
        }
        // If this contact is marked primary, unmark others
        if (isPrimary && c.isPrimary) {
          return { ...c, isPrimary: false };
        }
        if (isSecondary && c.isSecondary) {
          return { ...c, isSecondary: false };
        }
        return c;
      });
    } else {
      const newContact: EmergencyContact = {
        id: 'contact-' + Date.now(),
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        relationship: relationship.trim(),
        isPrimary,
        isSecondary: !isPrimary && isSecondary,
      };

      if (isPrimary) {
        updatedContacts = updatedContacts.map((c) => ({ ...c, isPrimary: false }));
      }
      if (isSecondary) {
        updatedContacts = updatedContacts.map((c) => ({ ...c, isSecondary: false }));
      }

      updatedContacts = [newContact, ...updatedContacts];
    }

    setContacts(updatedContacts);
    setIsFormOpen(false);
    setFeedbackMsg(t.contactAddedSuccess);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleDelete = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setFeedbackMsg(t.contactDeletedSuccess);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleSetPrimary = (contactId: string) => {
    setContacts((prev) =>
      prev.map((c) => ({
        ...c,
        isPrimary: c.id === contactId,
        isSecondary: c.id === contactId ? false : c.isSecondary,
      }))
    );
    setFeedbackMsg('Primary emergency contact updated');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleSetSecondary = (contactId: string) => {
    setContacts((prev) =>
      prev.map((c) => ({
        ...c,
        isSecondary: c.id === contactId,
        isPrimary: c.id === contactId ? false : c.isPrimary,
      }))
    );
    setFeedbackMsg('Secondary emergency contact updated');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleUpdateConfigField = <K extends keyof EmergencySettingsConfig>(
    key: K,
    val: EmergencySettingsConfig[K]
  ) => {
    const next = { ...config, [key]: val };
    setConfig(next);
    emergencyService.updateConfig(next);
  };

  const handleDirectTestCall = async (phoneToCall: string) => {
    try {
      const res = await triggerNativeEmergencyCall(phoneToCall, config.isTestMode, false);
      setFeedbackMsg(res.message);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      setFeedbackMsg(`Call test error: ${err.message}`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const refreshHistory = () => {
    setHistory(getLocalEmergencyHistory());
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-32 space-y-8">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          id="emergency-back-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-mono text-white/60 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{t.backToSettings}</span>
        </button>

        <button
          id="add-contact-btn"
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#c49f2f] text-black text-xs font-bold font-mono transition cursor-pointer shadow-[0_0_15px_rgba(212,175,55,0.3)]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t.addContact}</span>
        </button>
      </div>

      <div>
        <h2 className="font-luxury text-2xl sm:text-3xl font-bold text-white flex items-center gap-2.5">
          <ShieldAlert className="w-7 h-7 text-[#D4AF37]" />
          <span>{t.emergencyContactsTitle}</span>
        </h2>
        <p className="text-xs text-white/50 font-mono mt-1 max-w-2xl leading-relaxed">
          {t.emergencyContactsDesc}
        </p>
      </div>

      {feedbackMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-mono flex items-center gap-2"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{feedbackMsg}</span>
        </motion.div>
      )}

      {/* Developer / Testing Mode Card */}
      <div className="rounded-[24px] bg-white/[0.04] border border-white/10 p-5 sm:p-6 space-y-4 backdrop-blur-[24px]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.isTestMode ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'bg-white/5 text-white/40'}`}>
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-luxury font-bold text-white text-base">{t.testMode}</span>
                {config.isTestMode && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-[#D4AF37] text-black font-bold">
                    ENABLED
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-white/50 mt-0.5">{t.testModeDesc}</p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              id="test-mode-toggle"
              type="checkbox"
              checked={config.isTestMode}
              onChange={(e) => handleUpdateConfigField('isTestMode', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D4AF37]"></div>
          </label>
        </div>

        {/* Live Simulation Trigger Buttons */}
        <div className="pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            id="simulate-crash-btn"
            onClick={() => emergencyService.triggerEmergency('crash', { notes: 'Crash collision simulated via Test Suite' })}
            className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <AlertOctagon className="w-4 h-4 text-red-400" />
            <span>{t.testEmergencyTrigger}</span>
          </button>

          <button
            id="simulate-fall-btn"
            onClick={() => emergencyService.triggerEmergency('fall', { notes: 'Free-fall & impact simulated via Test Suite' })}
            className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Activity className="w-4 h-4 text-amber-400" />
            <span>Simulate Fall Impact</span>
          </button>

          <button
            id="simulate-sos-btn"
            onClick={() => emergencyService.triggerEmergency('manual_sos', { notes: 'Emergency SOS simulated via Test Suite' })}
            className="px-3.5 py-2.5 rounded-xl bg-red-950/40 hover:bg-red-950/60 border border-red-500/40 text-red-200 text-xs font-mono font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span>{t.testSosTrigger}</span>
          </button>
        </div>
      </div>

      {/* National Emergency Hotline Section */}
      <div className="rounded-[24px] bg-white/[0.04] border border-white/10 p-5 sm:p-6 space-y-4 backdrop-blur-[24px]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-luxury font-bold text-white text-base flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-[#D4AF37]" />
              <span>{t.emergencyServiceNumber}</span>
            </h3>
            <p className="text-xs font-mono text-white/50 mt-0.5">
              Public emergency services hotline in Rwanda (falls back automatically if personal contacts are unavailable).
            </p>
          </div>
          <span className="font-luxury text-lg font-bold text-[#D4AF37] px-3 py-1 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30">
            {config.emergencyServiceNumber || '112'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {[
            { num: '112', label: 'Rwanda National Emergency', icon: ShieldAlert },
            { num: '912', label: 'SAMU Medical Ambulance', icon: Ambulance },
            { num: '113', label: 'Rwanda Traffic Police', icon: Car },
            { num: '111', label: 'Rwanda Fire Brigade', icon: Flame },
          ].map((srv) => {
            const Icon = srv.icon;
            const isSelected = config.emergencyServiceNumber === srv.num;
            return (
              <button
                key={srv.num}
                type="button"
                onClick={() => handleUpdateConfigField('emergencyServiceNumber', srv.num)}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                  isSelected
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white shadow-[0_0_15px_rgba(212,175,55,0.2)]'
                    : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-[#D4AF37]' : 'text-white/40'}`} />
                  <span className="font-luxury font-bold text-sm">{srv.num}</span>
                </div>
                <span className="text-[10px] font-mono leading-tight">{srv.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sensor Automation Engine Settings */}
      <div className="rounded-[24px] bg-white/[0.04] border border-white/10 p-5 sm:p-6 space-y-5 backdrop-blur-[24px]">
        <h3 className="font-luxury font-bold text-white text-base flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#D4AF37]" />
          <span>Automated Sensor Detection Rules</span>
        </h3>

        {/* Crash Detection */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="space-y-0.5">
            <span className="font-luxury font-semibold text-white text-sm">{t.crashDetection}</span>
            <p className="text-xs font-mono text-white/50 max-w-xl">{t.crashDetectionDesc}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              id="crash-detection-toggle"
              type="checkbox"
              checked={config.crashDetectionEnabled}
              onChange={(e) => handleUpdateConfigField('crashDetectionEnabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D4AF37]"></div>
          </label>
        </div>

        {/* Sensitivity selector */}
        {config.crashDetectionEnabled && (
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-mono text-white/70">{t.crashSensitivity}:</span>
            <div className="flex items-center gap-1.5">
              {(['low', 'medium', 'high'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => handleUpdateConfigField('crashSensitivity', lvl)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono capitalize transition cursor-pointer ${
                    config.crashSensitivity === lvl
                      ? 'bg-[#D4AF37] text-black font-bold'
                      : 'bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  {lvl === 'low' ? t.lowSensitivity : lvl === 'medium' ? t.medSensitivity : t.highSensitivity}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fall Detection */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/5">
          <div className="space-y-0.5">
            <span className="font-luxury font-semibold text-white text-sm">{t.fallDetection}</span>
            <p className="text-xs font-mono text-white/50 max-w-xl">{t.fallDetectionDesc}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              id="fall-detection-toggle"
              type="checkbox"
              checked={config.fallDetectionEnabled}
              onChange={(e) => handleUpdateConfigField('fallDetectionEnabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D4AF37]"></div>
          </label>
        </div>
      </div>

      {/* Add / Edit Contact Form */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-[24px] bg-white/[0.06] border border-[#D4AF37]/50 backdrop-blur-[24px] p-6 space-y-4 shadow-[0_10px_35px_rgba(0,0,0,0.8)] overflow-hidden"
          >
            <h3 className="font-luxury font-bold text-white text-base">
              {editingId ? t.editContact : t.addContact}
            </h3>

            <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-white/50 uppercase block mb-1">
                  {t.contactName} *
                </label>
                <input
                  id="contact-name-input"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dr. Jean Paul Mugisha"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37] font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-white/50 uppercase block mb-1">
                  {t.contactPhone} *
                </label>
                <input
                  id="contact-phone-input"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+250 788 123 456"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37] font-mono"
                />
                {phoneError && (
                  <span className="text-[10px] font-mono text-red-400 mt-1 block">
                    {phoneError}
                  </span>
                )}
              </div>

              <div>
                <label className="text-[10px] font-mono text-white/50 uppercase block mb-1">
                  {t.contactEmail}
                </label>
                <input
                  id="contact-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="guardian@example.rw"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37] font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-white/50 uppercase block mb-1">
                  {t.contactRelationship}
                </label>
                <input
                  id="contact-rel-input"
                  type="text"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="e.g. Spouse / Emergency Guardian"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37] font-mono"
                />
              </div>

              {/* Priority Radio Toggles */}
              <div className="sm:col-span-2 flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-white/80">
                  <input
                    type="checkbox"
                    checked={isPrimary}
                    onChange={(e) => {
                      setIsPrimary(e.target.checked);
                      if (e.target.checked) setIsSecondary(false);
                    }}
                    className="accent-[#D4AF37] w-4 h-4 rounded"
                  />
                  <span>Mark as Primary Emergency Contact</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-white/80">
                  <input
                    type="checkbox"
                    checked={isSecondary}
                    onChange={(e) => {
                      setIsSecondary(e.target.checked);
                      if (e.target.checked) setIsPrimary(false);
                    }}
                    className="accent-[#D4AF37] w-4 h-4 rounded"
                  />
                  <span>Mark as Secondary Emergency Contact</span>
                </label>
              </div>

              <div className="sm:col-span-2 flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs font-mono transition cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  id="contact-submit-btn"
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#c49f2f] text-black font-bold text-xs font-mono transition cursor-pointer shadow-[0_0_15px_rgba(212,175,55,0.3)]"
                >
                  {t.saveContact}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emergency Contacts List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-luxury font-bold text-white text-base flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#D4AF37]" />
            <span>Configured Emergency Contacts ({contacts.length})</span>
          </h3>
        </div>

        {contacts.length === 0 ? (
          <div className="rounded-[24px] bg-white/[0.04] border border-white/10 backdrop-blur-[20px] p-10 text-center space-y-3 flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
              <UserCheck className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-luxury font-bold text-white text-base">
                {t.noContacts}
              </h3>
              <p className="text-xs font-mono text-white/40 max-w-md mx-auto mt-1">
                {t.noContactsDesc}
              </p>
            </div>
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 rounded-xl bg-[#D4AF37] text-black font-bold text-xs font-mono transition cursor-pointer"
            >
              {t.addContact}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {contacts.map((contact) => {
              const isPrimaryContact = !!contact.isPrimary;
              const isSecondaryContact = !!contact.isSecondary;

              return (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-[22px] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition backdrop-blur-[20px] ${
                    isPrimaryContact
                      ? 'bg-white/[0.07] border-2 border-[#D4AF37]/70 shadow-[0_0_25px_rgba(212,175,55,0.15)]'
                      : isSecondaryContact
                      ? 'bg-white/[0.05] border border-white/20'
                      : 'bg-white/[0.03] border border-white/10'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-luxury font-bold text-white text-base">
                        {contact.name}
                      </span>
                      {isPrimaryContact && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#D4AF37] text-black font-extrabold flex items-center gap-1">
                          <Star className="w-3 h-3 fill-black" />
                          <span>{t.primaryBadge}</span>
                        </span>
                      )}
                      {isSecondaryContact && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20 text-white font-bold">
                          {t.secondaryBadge}
                        </span>
                      )}
                      {contact.relationship && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37]">
                          {contact.relationship}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-white/70">
                      <span className="flex items-center gap-1.5 font-bold text-white">
                        <Phone className="w-3.5 h-3.5 text-[#D4AF37]" />
                        {contact.phone}
                      </span>
                      {contact.email && (
                        <span className="flex items-center gap-1 text-white/50">
                          <Mail className="w-3 h-3" />
                          {contact.email}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                    {/* Primary / Secondary quick assignment pills */}
                    {!isPrimaryContact && (
                      <button
                        onClick={() => handleSetPrimary(contact.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-white/70 hover:text-white transition cursor-pointer"
                      >
                        {t.setPrimary}
                      </button>
                    )}

                    {!isSecondaryContact && !isPrimaryContact && (
                      <button
                        onClick={() => handleSetSecondary(contact.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-white/70 hover:text-white transition cursor-pointer"
                      >
                        {t.setSecondary}
                      </button>
                    )}

                    {/* Direct Test Call Button */}
                    <button
                      onClick={() => handleDirectTestCall(contact.phone)}
                      title="Test placing an emergency call to this contact"
                      className="px-2.5 py-1.5 rounded-xl bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <PhoneCall className="w-3 h-3" />
                      <span>Test Call</span>
                    </button>

                    <button
                      id={`edit-contact-${contact.id}`}
                      onClick={() => handleOpenEdit(contact)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      id={`delete-contact-${contact.id}`}
                      onClick={() => handleDelete(contact.id)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-white/70 hover:red-400 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Emergency & Incident History Log */}
      <div className="rounded-[24px] bg-white/[0.04] border border-white/10 p-5 sm:p-6 space-y-4 backdrop-blur-[24px]">
        <div className="flex items-center justify-between">
          <h3 className="font-luxury font-bold text-white text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#D4AF37]" />
            <span>{t.emergencyHistoryTitle}</span>
          </h3>
          <button
            onClick={refreshHistory}
            className="text-[11px] font-mono text-[#D4AF37] hover:underline transition cursor-pointer"
          >
            {t.refreshBtn}
          </button>
        </div>

        {history.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-center font-mono text-xs text-white/40">
            {t.noEmergencyHistoryDesc}
          </div>
        ) : (
          <div className="space-y-2.5">
            {history.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-red-500/20 text-red-300">
                      {item.type}
                    </span>
                    <span className="text-white font-semibold">{item.contactName || item.contactPhone}</span>
                    {item.testMode && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#D4AF37]/20 text-[#D4AF37] font-bold">
                        TEST
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-white/40">
                    {new Date(item.timestamp).toLocaleString()} • {item.notes || 'Emergency triggered'}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {item.latitude && (
                    <a
                      href={item.mapsUrl || `https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[#D4AF37] hover:underline flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>Maps</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}

                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                    item.callStatus === 'success' ? 'bg-emerald-500/20 text-emerald-300' :
                    item.callStatus === 'simulated' ? 'bg-amber-500/20 text-amber-300' :
                    item.callStatus === 'cancelled' ? 'bg-white/10 text-white/50' : 'bg-red-500/20 text-red-300'
                  }`}>
                    {item.callStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
