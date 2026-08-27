import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  variant?: 'original' | 'gold' | 'monochrome';
}

export const SoberWatchLogo: React.FC<LogoProps> = ({ 
  size = 36, 
  className = '',
  variant = 'original'
}) => {
  return (
    <div 
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
      >
        {variant === 'original' && (
          <defs>
            <linearGradient id="swGreenGrad" x1="0" y1="100" x2="100" y2="200" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#7AC142" />
              <stop offset="100%" stopColor="#5CA626" />
            </linearGradient>
            <linearGradient id="swOrangeGrad" x1="80" y1="20" x2="180" y2="160" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FF9800" />
              <stop offset="100%" stopColor="#F57C00" />
            </linearGradient>
          </defs>
        )}

        {variant === 'gold' && (
          <defs>
            <linearGradient id="swGoldGrad" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFF6D6" />
              <stop offset="50%" stopColor="#D4AF37" />
              <stop offset="100%" stopColor="#AA820A" />
            </linearGradient>
          </defs>
        )}

        {/* Cradling Protective Hand (Green Arc / Palm) */}
        <path
          d="M 82 32 C 45 34 16 68 16 112 C 16 160 54 188 108 188 C 120 188 126 172 118 168 C 92 154 50 162 44 148 C 38 132 82 160 88 160 C 96 160 92 144 80 144 C 68 144 48 144 38 132 C 30 120 30 90 48 64 C 62 46 76 42 82 32 Z"
          fill={variant === 'gold' ? 'url(#swGoldGrad)' : (variant === 'monochrome' ? '#FFFFFF' : 'url(#swGreenGrad)')}
        />

        {/* Dynamic Joyful Person Head (Circle) */}
        <circle
          cx="124"
          cy="42"
          r="16"
          fill={variant === 'gold' ? 'url(#swGoldGrad)' : (variant === 'monochrome' ? '#D4AF37' : '#FF9800')}
        />

        {/* Dynamic Reaching Person Body / Wings (V-Shape Rising Upwards) */}
        <path
          d="M 106 164 C 114 138 138 98 190 42 C 172 68 148 106 126 128 C 118 100 114 74 110 6 C 104 36 90 92 84 104 C 84 104 100 134 106 164 Z"
          fill={variant === 'gold' ? 'url(#swGoldGrad)' : (variant === 'monochrome' ? '#D4AF37' : 'url(#swOrangeGrad)')}
        />
      </svg>
    </div>
  );
};
