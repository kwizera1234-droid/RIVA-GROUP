import React from 'react';
import { motion } from 'motion/react';

export const LoadingState: React.FC<{ label: string }> = ({ label }) => (
  <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-10 flex flex-col items-center justify-center gap-4 text-center">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
      className="h-9 w-9 rounded-full border-2 border-[#D4AF37]/25 border-t-[#D4AF37] border-r-cyan-300/70"
      aria-hidden="true"
    />
    <span className="text-xs font-mono text-white/60">{label}</span>
  </div>
);