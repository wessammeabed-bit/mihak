import React from 'react';

interface MihakLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'horizontal' | 'icon';
  showSubtitle?: boolean;
}

export const MihakLogo: React.FC<MihakLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'horizontal',
  showSubtitle = true
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-3xl',
    xl: 'text-5xl'
  };

  const englishSizes = {
    sm: 'text-[9px]',
    md: 'text-xs',
    lg: 'text-sm',
    xl: 'text-base'
  };

  // Modern SVG Emblem based on the official Mihak emblem in challenge palette
  const Emblem = ({ sizeClass }: { sizeClass: string }) => (
    <div className={`relative ${sizeClass} shrink-0 select-none`}>
      <svg
        viewBox="0 0 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_4px_12px_rgba(46,242,194,0.18)]"
      >
        <defs>
          {/* Deep Navy to Cobalt Gradient */}
          <linearGradient id="mihakNavyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E2B6D" />
            <stop offset="50%" stopColor="#12183F" />
            <stop offset="100%" stopColor="#0B0F28" />
          </linearGradient>

          {/* Electric Turquoise Gradient */}
          <linearGradient id="mihakTurquoiseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2EF2C2" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>

          {/* Tech Purple Gradient */}
          <linearGradient id="mihakPurpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#6150EA" />
          </linearGradient>

          {/* Book Pages Light Gradient */}
          <linearGradient id="mihakPagesGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>

          <filter id="glowTurquoise" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#2EF2C2" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Outer Islamic Arch / Mihrab Frame */}
        <path
          d="M80 14 C95 36 122 48 122 84 C122 108 110 120 80 124 C50 120 38 108 38 84 C38 48 65 36 80 14 Z"
          fill="url(#mihakNavyGrad)"
          stroke="url(#mihakTurquoiseGrad)"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        {/* Architectural Finial on Top */}
        <circle cx="80" cy="11" r="5" fill="#2EF2C2" filter="url(#glowTurquoise)" />
        <path d="M80 6 L80 11" stroke="#2EF2C2" strokeWidth="2.5" strokeLinecap="round" />

        {/* Tech Circuit Arms (Left & Right) */}
        <path
          d="M38 72 L22 72 M22 72 L14 78"
          stroke="#2EF2C2"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="14" cy="78" r="4.5" fill="#6150EA" stroke="#2EF2C2" strokeWidth="2" />

        <path
          d="M122 72 L138 72 M138 72 L146 78"
          stroke="#2EF2C2"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="146" cy="78" r="4.5" fill="#6150EA" stroke="#2EF2C2" strokeWidth="2" />

        {/* Inner Document / Page inside Arch */}
        <rect
          x="56"
          y="46"
          width="48"
          height="62"
          rx="6"
          fill="url(#mihakPagesGrad)"
          stroke="#6150EA"
          strokeWidth="2"
        />
        {/* Document Text Lines */}
        <line x1="64" y1="58" x2="84" y2="58" stroke="#12183F" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />
        <line x1="64" y1="68" x2="88" y2="68" stroke="#12183F" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />
        <line x1="64" y1="78" x2="80" y2="78" stroke="#12183F" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />

        {/* Open Book / Mushaf Wings at Bottom */}
        {/* Left Page Wing */}
        <path
          d="M80 118 C65 110 40 106 20 114 C28 128 55 132 80 138 Z"
          fill="url(#mihakPagesGrad)"
          stroke="#12183F"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M78 122 C64 115 42 112 25 119 C32 130 56 134 78 140 Z"
          fill="#12183F"
          stroke="#2EF2C2"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Right Page Wing */}
        <path
          d="M80 118 C95 110 120 106 140 114 C132 128 105 132 80 138 Z"
          fill="url(#mihakPagesGrad)"
          stroke="#12183F"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M82 122 C96 115 118 112 135 119 C128 130 104 134 82 140 Z"
          fill="#12183F"
          stroke="#2EF2C2"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Book Spine Center Diamond Accent */}
        <polygon points="80,136 84,142 80,148 76,142" fill="#2EF2C2" />

        {/* Prominent Verification Checkmark */}
        <path
          d="M66 84 L76 96 L130 42"
          stroke="url(#mihakTurquoiseGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glowTurquoise)"
        />
      </svg>
    </div>
  );

  if (variant === 'icon') {
    return <Emblem sizeClass={iconSizes[size]} />;
  }

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <Emblem sizeClass={iconSizes[size]} />

      <div className="flex flex-col text-right leading-none">
        {/* Arabic Calligraphy Typography */}
        <div className="flex items-baseline gap-2">
          <span
            className={`font-serif font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white via-[#F2F4FF] to-[#2EF2C2] ${textSizes[size]}`}
            style={{ textShadow: '0 2px 14px rgba(46,242,194,0.22)' }}
          >
            مِحَكّ
          </span>
          <span className={`font-mono font-bold tracking-widest text-[#2EF2C2] ${englishSizes[size]}`}>
            MIHAK
          </span>
        </div>

        {showSubtitle && (
          <span className="text-[11px] text-[#A5B4FC] font-normal tracking-tight mt-1 flex items-center gap-1.5">
            <span>مدقق سلامة المحتوى الإسلامي</span>
          </span>
        )}
      </div>
    </div>
  );
};
