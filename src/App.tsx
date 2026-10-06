import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { AuditPage } from './pages/AuditPage';
import { ComparePage } from './pages/ComparePage';
import { MethodologyPage } from './pages/MethodologyPage';
import { AboutPage } from './pages/AboutPage';

const TABS = ['home', 'audit', 'compare', 'methodology', 'about'];

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [corpusReady, setCorpusReady] = useState(false);
  const [corpusError, setCorpusError] = useState<string | null>(null);

  // فحص جاهزية المصادر المعتمدة من الخادم المركزي (Single Source of Truth)
  useEffect(() => {
    fetch('/api/status')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(() => {
        setCorpusReady(true);
      })
      .catch((err) => {
        console.warn('[MIHAK] فحص حالة المصادر:', err);
        setCorpusReady(true);
      });
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (TABS.includes(hash)) {
        setCurrentTab(hash);
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const handleSelectTab = (tab: string) => {
    setCurrentTab(tab);
    window.location.hash = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      className="min-h-screen bg-[#0C1033] text-[#F2F4FF] flex flex-col font-sans selection:bg-[#2EF2C2]/30 selection:text-white"
      dir="rtl"
    >
      <Header currentTab={currentTab} onSelectTab={handleSelectTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10">
        {!corpusReady && (
          <div className="text-center py-24 space-y-3">
            <div className="text-[#2EF2C2] text-lg font-serif animate-pulse">⏳ جاري تهيئة المصادر المعتمدة...</div>
            <div className="text-[#94A3B8] text-xs">القرآن الكريم برواية حفص • التفسير الميسر • غريب القرآن • السنة النبوية</div>
          </div>
        )}

        {corpusReady && (
          <>
            {corpusError && (
              <div className="mb-4 p-3 rounded-lg bg-yellow-900/30 border border-yellow-600/50 text-yellow-200 text-sm">
                ⚠️ تحذير: {corpusError}. يتم استخدام البيانات الاحتياطية.
              </div>
            )}
            {currentTab === 'home' && <HomePage onNavigate={handleSelectTab} />}
            {currentTab === 'audit' && <AuditPage />}
            {currentTab === 'compare' && <ComparePage />}
            {currentTab === 'methodology' && <MethodologyPage />}
            {currentTab === 'about' && <AboutPage onNavigate={handleSelectTab} />}
          </>
        )}
      </main>

      <Footer onSelectTab={handleSelectTab} />
    </div>
  );
}