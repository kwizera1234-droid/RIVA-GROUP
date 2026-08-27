import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AppBackground } from './components/AppBackground';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { DangerNotificationBanner } from './components/DangerNotificationBanner';
import { AppDrawerMenu } from './components/AppDrawerMenu';
import { EmergencyModal } from './components/EmergencyModal';
import { AppFooter } from './components/AppFooter';

import { SplashScreen } from './views/SplashScreen';
import { AuthScreen } from './views/AuthScreen';
import { VerifyScreen } from './views/VerifyScreen';
import { DashboardView } from './views/DashboardView';
import { HistoryView } from './views/HistoryView';
import { AlertsView } from './views/AlertsView';
import { SettingsView } from './views/SettingsView';

import { ActiveScreen, TelemetryReading, UserProfile, Language, SettingsSubPage } from './types';
import { apiFetchReadings, apiFetchHealth } from './services/api';
import { emergencyService } from './services/emergencyService';
import { VoiceAssistantView } from './views/VoiceAssistantView';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('splash');
  const [settingsSubPage, setSettingsSubPage] = useState<SettingsSubPage>('main');
  const [isDrawerMenuOpen, setIsDrawerMenuOpen] = useState<boolean>(false);
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('soberwatch_lang');
    if (saved === 'en' || saved === 'rw' || saved === 'sw') return saved;
    return 'en';
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('soberwatch_user');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return null;
  });
  const [verifyingEmail, setVerifyingEmail] = useState<string>('');

  const [readings, setReadings] = useState<TelemetryReading[]>([]);
  const [currentReading, setCurrentReading] = useState<TelemetryReading | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [dangerDismissed, setDangerDismissed] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const prevLatestTimestampRef = useRef<number | null>(null);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('soberwatch_lang', lang);
  };

  // Load real telemetry data strictly from backend
  const loadTelemetry = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    const uid = user?.uid || 'test-user';
    
    try {
      setFetchError(null);
      const fetched = await apiFetchReadings(uid);
      if (fetched && fetched.length > 0) {
        setReadings(fetched);
        const latest = fetched[0];
        
        // Check if fresh reading arrived to trigger auto-analysis animation
        if (latest && latest.timestamp !== prevLatestTimestampRef.current) {
          prevLatestTimestampRef.current = latest.timestamp;
          setIsAnalyzing(true);
          setTimeout(() => setIsAnalyzing(false), 2000);
        }

        setCurrentReading(latest);
      } else {
        const lastHealth = await apiFetchHealth(uid);
        if (lastHealth) {
          setReadings([lastHealth]);
          setCurrentReading(lastHealth);
        }
      }
    } catch (e) {
      console.error('Error fetching telemetry:', e);
      setFetchError('Could not reach backend');
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, [user]);

  // Polling every 5 seconds for real-time updates
  useEffect(() => {
    loadTelemetry(true);
    const interval = setInterval(() => {
      loadTelemetry(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadTelemetry]);

  // Reset danger dismissed if status changes or new reading arrives
  useEffect(() => {
    if (currentReading?.status === 'DANGER') {
      setDangerDismissed(false);
    }
  }, [currentReading?.id, currentReading?.status, currentReading?.timestamp]);

  const handleAuthSuccess = (authUser: UserProfile) => {
    setUser(authUser);
    localStorage.setItem('soberwatch_user', JSON.stringify(authUser));
    setActiveScreen('dashboard');
  };

  const handleSignOut = () => {
    setUser(null);
    localStorage.removeItem('soberwatch_user');
    setActiveScreen('auth');
  };

  const isDangerActive = currentReading?.status === 'DANGER' && !dangerDismissed;
  const deviceId = currentReading?.deviceId || 'SW-001';

  return (
    <AppBackground>
      {/* Real-time Emergency SOS & Automated Calling Full-screen / Float Modal */}
      <EmergencyModal language={language} uid={user?.uid} />

      <AnimatePresence mode="wait">
        {/* Splash Screen */}
        {activeScreen === 'splash' && (
          <SplashScreen
            key="splash"
            onComplete={() => {
              if (user) {
                setActiveScreen('dashboard');
              } else {
                setActiveScreen('auth');
              }
            }}
          />
        )}

        {/* Auth Screen */}
        {activeScreen === 'auth' && (
          <AuthScreen
            key="auth"
            language={language}
            onLanguageChange={handleLanguageChange}
            onSuccess={handleAuthSuccess}
            onRequireVerification={(email) => {
              setVerifyingEmail(email);
              setActiveScreen('verify');
            }}
          />
        )}

        {/* Verify Screen */}
        {activeScreen === 'verify' && (
          <VerifyScreen
            key="verify"
            email={verifyingEmail}
            language={language}
            onVerified={handleAuthSuccess}
            onBackToLogin={() => setActiveScreen('auth')}
          />
        )}

        {/* Main App Screens (Exactly 4 Tabs: Dashboard, History, Alerts, Settings) */}
        {activeScreen !== 'splash' && activeScreen !== 'auth' && activeScreen !== 'verify' && (
          <div key="main-app" className="min-h-screen flex flex-col">
            {/* Header with App Name, Instagram Actions, User Avatar, and Quick Language Switcher & Menu */}
            <Navbar
              deviceId={deviceId}
              status={currentReading?.status}
              user={user}
              language={language}
              onLanguageChange={handleLanguageChange}
              onOpenMenu={() => setIsDrawerMenuOpen(true)}
              onNavigate={(screen) => setActiveScreen(screen)}
            />

            {/* Quick Access Menu Drawer */}
            <AppDrawerMenu
              isOpen={isDrawerMenuOpen}
              onClose={() => setIsDrawerMenuOpen(false)}
              onSelectSubPage={(sub) => {
                if (sub === 'voice') {
                  setActiveScreen('voice');
                } else {
                  setSettingsSubPage(sub);
                  setActiveScreen('settings');
                }
              }}
              user={user}
              deviceId={deviceId}
              status={currentReading?.status}
              language={language}
              onLanguageChange={handleLanguageChange}
              onSignOut={handleSignOut}
            />

            {/* Danger Notification Banner (Only when backend reading status is DANGER) */}
            {isDangerActive && (
              <DangerNotificationBanner
                reading={currentReading}
                language={language}
                onDismiss={() => setDangerDismissed(true)}
              />
            )}

            {/* View Switching */}
            <main className="flex-1">
              <AnimatePresence mode="wait">
                {activeScreen === 'dashboard' && (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <DashboardView
                      currentReading={currentReading}
                      readings={readings}
                      language={language}
                      isLoading={isLoading}
                      isAnalyzing={isAnalyzing}
                      onOpenVoice={() => setActiveScreen('voice')}
                    />
                  </motion.div>
                )}

                {activeScreen === 'voice' && (
                  <motion.div
                    key="voice"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <VoiceAssistantView
                      currentLanguage={language}
                      onLanguageChange={handleLanguageChange}
                      primaryContact={emergencyService.getPrimaryContact()}
                      secondaryContact={emergencyService.getSecondaryContact()}
                      currentReading={currentReading}
                      onNavigateToSettings={() => {
                        setSettingsSubPage('emergency');
                        setActiveScreen('settings');
                      }}
                    />
                  </motion.div>
                )}

                {activeScreen === 'history' && (
                  <motion.div
                    key="history"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <HistoryView
                      readings={readings}
                      language={language}
                      isLoading={isLoading}
                      onRefresh={() => loadTelemetry(true)}
                      error={fetchError}
                    />
                  </motion.div>
                )}

                {activeScreen === 'alerts' && (
                  <motion.div
                    key="alerts"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <AlertsView
                      currentReading={currentReading}
                      readings={readings}
                      language={language}
                    />
                  </motion.div>
                )}

                {activeScreen === 'settings' && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <SettingsView
                      user={user}
                      deviceId={deviceId}
                      readings={readings}
                      language={language}
                      onLanguageChange={handleLanguageChange}
                      onSignOut={handleSignOut}
                      subPage={settingsSubPage}
                      onSubPageChange={setSettingsSubPage}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            {/* Application Footer with links at the bottom */}
            <AppFooter
              currentScreen={activeScreen}
              language={language}
              onNavigate={(screen) => {
                if (screen === 'settings') {
                  setSettingsSubPage('main');
                }
                setActiveScreen(screen);
              }}
              onSelectSubPage={(sub) => {
                setSettingsSubPage(sub);
                setActiveScreen('settings');
              }}
              onLanguageChange={handleLanguageChange}
            />

            {/* Bottom Navigation (Primary Tabs: Dashboard, History, Voice, Alerts, Settings) */}
            <BottomNav
              currentScreen={activeScreen}
              onNavigate={(screen) => {
                if (screen === 'settings') {
                  setSettingsSubPage('main');
                }
                setActiveScreen(screen);
              }}
              language={language}
              hasActiveDanger={currentReading?.status === 'DANGER'}
            />
          </div>
        )}
      </AnimatePresence>
    </AppBackground>
  );
}
