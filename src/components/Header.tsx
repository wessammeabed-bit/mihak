import React from 'react';
import { FileSearch, GitCompare, Home, Info, ShieldCheck, Clock, LogIn, LogOut, User } from 'lucide-react';
import type { UserProfile } from '../services/firebase';
import { MihakLogo } from './MihakLogo';
import { ChallengeBadge } from './ChallengeBadge';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  user?: UserProfile | null;
  onLogin?: () => void;
  onLogout?: () => void;
  onOpenHistory?: () => void;
}

const NAV_ITEMS = [
  { id: 'home', label: 'الرئيسية', icon: Home },
  { id: 'audit', label: 'تدقيق المحتوى', icon: FileSearch },
  { id: 'compare', label: 'مقارنة نصين', icon: GitCompare },
  { id: 'methodology', label: 'المنهجية', icon: ShieldCheck },
  { id: 'about', label: 'عن مِحَكّ', icon: Info }
];

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  user,
  onLogin,
  onLogout,
  onOpenHistory
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-[#263168]/80 bg-[#0C1033]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 flex items-center gap-4 justify-between">
        {/* Right side: Primary MIHAK logo */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => onSelectTab('home')}
            className="shrink-0 flex items-center text-right group cursor-pointer focus:outline-none"
            aria-label="مِحَكّ - العودة إلى الرئيسية"
          >
            <MihakLogo size="md" variant="horizontal" showSubtitle={true} />
          </button>

          {/* Secondary Badge: Participation in AI Challenge */}
          <div className="hidden lg:flex items-center">
            <ChallengeBadge variant="header" />
          </div>
        </div>

        {/* Center: Navigation tabs */}
        <nav className="overflow-x-auto hidden md:block">
          <div className="flex items-center gap-1.5 min-w-max py-2">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = currentTab === id;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTab(id)}
                  className={[
                    'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer',
                    active
                      ? 'bg-gradient-to-r from-[#12183F] to-[#1E2B6D] text-[#2EF2C2] border border-[#2EF2C2]/40 shadow-[0_0_15px_rgba(46,242,194,0.12)] font-bold'
                      : 'text-[#94A3B8] hover:text-[#F2F4FF] hover:bg-[#12183F]/70 border border-transparent'
                  ].join(' ')}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-[#2EF2C2]' : 'text-[#A5B4FC]'}`} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Left side: User Account Controls & Mobile Challenge Badge */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="lg:hidden flex items-center">
            <ChallengeBadge variant="header" className="scale-90 origin-left" />
          </div>

          {user ? (
            <div className="flex items-center gap-2">
              {onOpenHistory && (
                <button
                  type="button"
                  onClick={onOpenHistory}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs text-slate-300 hover:text-white transition"
                  title="سجل التدقيق المحفوظ"
                >
                  <Clock className="w-3.5 h-3.5 text-[#2EF2C2]" />
                  <span className="hidden sm:inline">السجل</span>
                </button>
              )}

              <div className="flex items-center gap-2 rounded-xl border border-[#6150EA]/40 bg-[#12183F] px-2.5 py-1">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-6 h-6 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#6150EA]/30 text-[#2EF2C2] flex items-center justify-center text-xs font-bold">
                    {user.displayName ? user.displayName[0] : <User className="w-3.5 h-3.5" />}
                  </div>
                )}
                <span className="text-xs text-white font-medium max-w-[100px] truncate hidden sm:inline">
                  {user.displayName || 'المستخدم'}
                </span>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="text-slate-400 hover:text-rose-400 p-1 transition"
                    title="تسجيل الخروج"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            onLogin && (
              <button
                type="button"
                onClick={onLogin}
                className="inline-flex items-center gap-2 rounded-xl border border-[#2EF2C2]/40 bg-[#2EF2C2]/10 hover:bg-[#2EF2C2]/20 px-3.5 py-1.5 text-xs font-bold text-[#2EF2C2] transition cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>تسجيل الدخول</span>
              </button>
            )
          )}
        </div>
      </div>
    </header>
  );
};
