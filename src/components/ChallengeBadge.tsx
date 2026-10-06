import React from 'react';

interface ChallengeBadgeProps {
  variant?: 'header' | 'footer' | 'pill' | 'full';
  className?: string;
}

/**
 * Challenge Rosette Emblem
 * The geometric multi-petal radial emblem of the AI Challenge for Islamic Content
 */
export const ChallengeRosette: React.FC<{ size?: string; className?: string }> = ({
  size = 'w-6 h-6',
  className = ''
}) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${size} ${className} shrink-0`}
  >
    <defs>
      <linearGradient id="rosetteTurq" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2EF2C2" />
        <stop offset="100%" stopColor="#6150EA" />
      </linearGradient>
    </defs>
    {/* Geometric radial petals */}
    {Array.from({ length: 16 }).map((_, i) => {
      const angle = (i * 360) / 16;
      return (
        <ellipse
          key={i}
          cx="50"
          cy="26"
          rx="6.5"
          ry="18"
          fill="none"
          stroke="url(#rosetteTurq)"
          strokeWidth="1.8"
          opacity="0.85"
          transform={`rotate(${angle} 50 50)`}
        />
      );
    })}
    <circle cx="50" cy="50" r="8" fill="#2EF2C2" opacity="0.9" />
    <circle cx="50" cy="50" r="4" fill="#12183F" />
  </svg>
);

export const ChallengeBadge: React.FC<ChallengeBadgeProps> = ({
  variant = 'header',
  className = ''
}) => {
  if (variant === 'header') {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-xl border border-[#6150EA]/30 bg-[#12183F]/80 backdrop-blur-sm px-2.5 py-1 text-xs text-[#F2F4FF] hover:border-[#2EF2C2]/50 transition-all select-none ${className}`}
        title="تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي — مؤسسة باذل الأهلية 2026م"
      >
        <ChallengeRosette size="w-4 h-4" />
        <div className="flex flex-col text-right leading-none">
          <span className="text-[10px] text-[#A5B4FC]">مشارك في</span>
          <span className="text-[11px] font-semibold text-white truncate max-w-[170px] sm:max-w-none">
            تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي
          </span>
        </div>
      </div>
    );
  }

  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-full border border-[#2EF2C2]/30 bg-[#12183F]/90 px-3 py-1 text-xs text-[#2EF2C2] shadow-[0_0_15px_rgba(46,242,194,0.1)] select-none ${className}`}
      >
        <ChallengeRosette size="w-3.5 h-3.5" />
        <span className="font-medium text-white">مشارك في تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي</span>
        <span className="text-[10px] text-[#A5B4FC] font-mono hidden sm:inline">• باذل 2026</span>
      </div>
    );
  }

  // Footer full attribution block
  return (
    <div
      className={`rounded-2xl border border-[#6150EA]/30 bg-[#0E1538]/90 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-right ${className}`}
    >
      <div className="flex items-center gap-3.5">
        <ChallengeRosette size="w-9 h-9 sm:w-10 sm:h-10" />
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#6150EA]/20 text-[#A5B4FC] border border-[#6150EA]/40">
              مشروع مشارك
            </span>
            <span className="text-sm font-bold text-white">
              تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي
            </span>
          </div>
          <p className="text-xs text-[#94A3B8]">
            تنظيم مؤسسة باذل الأهلية (BATHEL) • عام الذكاء الاصطناعي 2026م • مسار أدوات المعرفة والتحقق
          </p>
        </div>
      </div>

      <a
        href="https://IslamicAIch.org"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[#2EF2C2]/30 bg-[#2EF2C2]/10 hover:bg-[#2EF2C2]/20 px-3.5 py-2 text-xs font-semibold text-[#2EF2C2] transition"
      >
        <span>IslamicAIch.org</span>
      </a>
    </div>
  );
};
