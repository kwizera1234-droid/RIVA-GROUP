import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Cpu, Activity } from 'lucide-react';

interface SmartLoaderProps {
  label?: string;
  isCompact?: boolean;
}

export const SmartLoader: React.FC<SmartLoaderProps> = ({ 
  label = 'AI Smart Telemetry Sync...', 
  isCompact = false 
}) => {
  if (isCompact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-[#D4AF37]/30 backdrop-blur-[20px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
          className="w-3.5 h-3.5 rounded-full border border-dashed border-[#D4AF37] border-t-transparent"
        />
        <span className="text-[11px] font-mono text-[#D4AF37] font-medium tracking-wide">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-[20px] bg-white/[0.04] backdrop-blur-[20px] border border-white/10 p-8 flex flex-col items-center justify-center overflow-hidden">
      {/* Dynamic Laser Scanning Line */}
      <motion.div
        className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent shadow-[0_0_15px_#D4AF37]"
        animate={{
          top: ['0%', '100%', '0%']
        }}
        transition={{
          repeat: Infinity,
          duration: 3,
          ease: 'easeInOut'
        }}
      />

      {/* AI Concentric Telemetry Scanner Rings */}
      <div className="relative w-24 h-24 flex items-center justify-center my-4">
        {/* Outer Orbit */}
        <motion.div
          className="absolute inset-0 rounded-full border border-white/10 border-dashed"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 10, ease: 'linear' }}
        />

        {/* Mid Glowing Ring */}
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-t-[#D4AF37] border-r-transparent border-b-cyan-400/40 border-l-transparent"
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
        />

        {/* Inner Core Pulse */}
        <motion.div
          className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#D4AF37]/30 to-white/10 border border-[#D4AF37] flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.4)]"
          animate={{ scale: [0.9, 1.1, 0.9] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
        >
          <Sparkles className="w-5 h-5 text-[#D4AF37]" />
        </motion.div>
      </div>

      {/* Label and Neural Analysis Text */}
      <div className="text-center space-y-1.5 z-10">
        <div className="flex items-center justify-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[#D4AF37] animate-pulse" />
          <span className="font-luxury font-bold text-white text-base tracking-wide">
            {label}
          </span>
        </div>
        <p className="text-xs font-mono text-white/50 tracking-wider uppercase">
          Neural Hardware Link • 5s Polling
        </p>
      </div>
    </div>
  );
};
