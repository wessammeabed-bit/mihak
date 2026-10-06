import React from 'react';
import { MihakLogo } from './MihakLogo';
import { ChallengeBadge } from './ChallengeBadge';

interface FooterProps {
  onSelectTab: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onSelectTab }) => {
  return (
    <footer className="mt-20 border-t border-[#263168]/80 bg-[#0C1033]/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Secondary Challenge Affiliation Banner */}
        <ChallengeBadge variant="footer" />

        {/* Primary Project Identity & Links */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-4 border-t border-white/5">
          <div className="text-center sm:text-right space-y-2">
            <MihakLogo size="sm" variant="horizontal" showSubtitle={false} />
            <p className="text-xs text-[#94A3B8] max-w-xl">
              نظام رقابي متخصص لتدقيق سلامة المحتوى الإسلامي ورصد التحول الدلالي، يقيد الإجابة بالأدلة المسترجعة حتمياً من المصادر المعتمدة.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[#94A3B8]">
            <button
              type="button"
              onClick={() => onSelectTab('audit')}
              className="hover:text-[#2EF2C2] transition cursor-pointer"
            >
              تدقيق المحتوى
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('compare')}
              className="hover:text-[#2EF2C2] transition cursor-pointer"
            >
              مقارنة نصين
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('methodology')}
              className="hover:text-[#2EF2C2] transition cursor-pointer"
            >
              المنهجية والمعايير
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('about')}
              className="hover:text-[#2EF2C2] transition cursor-pointer"
            >
              عن مِحَكّ
            </button>
          </div>
        </div>

        {/* Copyright notice */}
        <div className="text-center text-[11px] text-[#64748B] pt-2">
          مِحَكّ (MIHAK) — تدقيق المحتوى الإسلامي بالذكاء الاصطناعي المقيد بالمصادر • 2026م
        </div>
      </div>
    </footer>
  );
};
