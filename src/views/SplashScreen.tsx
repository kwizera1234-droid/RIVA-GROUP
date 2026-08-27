import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { SoberWatchLogo } from '../components/SoberWatchLogo';

interface SplashProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashProps> = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 text-center bg-transparent">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.6 }}
        className="space-y-5 flex flex-col items-center"
      >
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-[#D4AF37]/20 blur-xl animate-pulse" />
          <SoberWatchLogo size={80} variant="original" />
        </div>

        <div className="space-y-1">
          <h1 className="font-luxury text-4xl font-bold tracking-tight text-white">
            SoberWatch
          </h1>
          <p className="text-xs font-mono text-[#D4AF37] tracking-widest uppercase">
            Biometric Telemetry Suite
          </p>
        </div>
      </motion.div>
    </div>
  );
};
