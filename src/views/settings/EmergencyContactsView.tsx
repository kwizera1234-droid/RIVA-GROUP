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
  const [isActive, setIsActive] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('soberwatch_contacts', JSON.stringify(contacts));
    
    // Sync with emergencyService config
    const updated = {
      ...config,
      contacts: contacts.map((contact, index) => ({ ...contact, priority: contact.priority ?? index })),
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
    setIsActive(contacts.length === 0);
    setPhoneError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (contact: EmergencyContact) => {
    setEditingId(contact.id);
    setName(contact.name);
    setPhone(contact.phone);
    setEmail(contact.email || '');
    setRelationship(contact.relationship || '');
    setIsActive(contact.isActive !== false);
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
            isActive,
            priority: c.priority,
          };
        }
        // If this contact is marked primary, unmark others
        return c;
      });
    } else {
      const newContact: EmergencyContact = {
        id: 'contact-' + Date.now(),
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        relationship: relationship.trim(),
        isActive,
        priority: updatedContacts.length,
      };

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

  const handleSetActive = (contactId: string) => {
    setContacts((prev) =>
      prev.map((c) => ({
        ...c,
        isActive: c.id === contactId ? !c.isActive : c.isActive,
      }))
    );
    setFeedbackMsg('Emergency contact activation updated');
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

      <div className="rounded-[24px] bg-red-950/20 border border-red-500/30 p-5 sm:p-6 space-y-5 backdrop-blur-[24px]">
        <div>
          <h3 className="font-luxury font-bold text-white text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-300" />
            <span>Emergency Response Controls</span>
          </h3>
          <p className="text-xs font-mono text-red-200/70 mt-2 leading-relaxed">
            Automatic emergency calling can contact real people and emergency services. Enable it only after confirming your contacts, permissions, location sharing, and countdown settings.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1.5 text-xs font-mono text-white/70">
            <span>SIM preference</span>
            <select value={config.simPreference} onChange={(e) => handleUpdateConfigField('simPreference', e.target.value as EmergencySettingsConfig['simPreference'])} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white">
              <option value="AUTOMATIC">Automatic available SIM</option>
              <option value="SIM_1">SIM 1</option>
              <option value="SIM_2">SIM 2</option>
              <option value="ASK">Ask before calling</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-mono text-white/70">
            <span>Emergency countdown</span>
            <input type="number" min={5} max={60} value={config.autoCountdownSeconds} onChange={(e) => handleUpdateConfigField('autoCountdownSeconds', Math.max(5, Math.min(60, Number(e.target.value) || 15)))} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white" />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['locationSharingEnabled', 'Share current location with configured contacts'],
            ['cameraVerificationEnabled', 'Use camera as additional evidence when permission and foreground access allow'],
            ['satelliteDisplayEnabled', 'Show legitimate map/satellite imagery when a provider is available'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs font-mono text-white/75">
              <input type="checkbox" checked={Boolean(config[key as keyof EmergencySettingsConfig])} onChange={(e) => handleUpdateConfigField(key as keyof EmergencySettingsConfig, e.target.checked as never)} className="mt-0.5 accent-[#D4AF37]" />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <label className="block space-y-1.5 text-xs font-mono text-white/70">
          <span>Emergency message shared when location sharing is enabled</span>
          <textarea value={config.emergencyMessage} onChange={(e) => handleUpdateConfigField('emergencyMessage', e.target.value)} rows={5} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white resize-y" />
        </label>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] font-mono text-amber-100/80">
          Camera verification is never treated as proof of an accident. Android may deny camera access in the background. SIM selection is delegated to Android because unsupported silent SIM routing cannot be safely or legally bypassed.
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
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-[#D4AF37] w-4 h-4 rounded" />
                  <span>Use for automatic emergency response</span>
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
              const isActiveContact = contact.isActive !== false;

              return (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-[22px] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition backdrop-blur-[20px] ${
                    isActiveContact ? 'bg-white/[0.07] border-2 border-[#D4AF37]/70 shadow-[0_0_25px_rgba(212,175,55,0.15)]' : 'bg-white/[0.03] border border-white/10'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-luxury font-bold text-white text-base">
                        {contact.name}
                      </span>
                      {isActiveContact && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[#D4AF37] text-black font-extrabold flex items-center gap-1">
                          <Star className="w-3 h-3 fill-black" />
                          <span>ACTIVE</span>
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
                    <button
                      onClick={() => handleSetActive(contact.id)}
                      className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-white/70 hover:text-white transition cursor-pointer"
                    >
                      {isActiveContact ? 'Deactivate' : 'Activate'}
                    </button>

                    {false && (
                      <button
                        onClick={() => handleSetActive(contact.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-white/70 hover:text-white transition cursor-pointer"
                      >
                        Activate
                      </button>
                    )}

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
