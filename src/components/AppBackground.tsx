import React from 'react';

export const AppBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative min-h-screen w-full bg-[#05070B] text-white overflow-x-hidden selection:bg-[#D4AF37] selection:text-black font-sans">
      {/* High-Tech Biometric Hologram Background from uploaded design */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Real Medical Biometric Phone Hologram Backdrop */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 mix-blend-screen transform scale-105"
          style={{
            backgroundImage: `url('/medical_biometrics_bg.jpg')`,
            backgroundAttachment: 'fixed',
          }}
        />

        {/* Sophisticated Dark Sci-Fi Overlay & Contrast Gradients */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070B]/85 via-[#05070B]/90 to-[#05070B]/96 backdrop-blur-[1px]" />

        {/* Subtle Cybernetic Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `linear-gradient(to right, #00E5FF 1px, transparent 1px), linear-gradient(to bottom, #D4AF37 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />

        {/* Glowing Aura Accents */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#D4AF37]/12 blur-[130px]" />
        <div className="absolute top-1/2 -right-24 w-96 h-96 rounded-full bg-cyan-500/10 blur-[140px]" />
        <div className="absolute -bottom-24 left-1/3 w-96 h-96 rounded-full bg-emerald-500/8 blur-[150px]" />

        {/* Deep Vignette Mask */}
        <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_0%,rgba(0,0,0,0.75)_100%]" />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {children}
      </div>
    </div>
  );
};

