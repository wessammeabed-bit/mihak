import React from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';

interface ReliabilityBannerProps {
  compact?: boolean;
}

export const ReliabilityBanner: React.FC<ReliabilityBannerProps> = ({
  compact = false
}) => {
  if (compact) {
    return (
      <div className="rounded-xl border border-[#D4A64A]/30 bg-[#0B1730] px-4 py-3 flex items-start gap-2.5 shadow-[0_0_12px_rgba(212,166,74,0.08)]">
        <ShieldCheck className="w-4 h-4 mt-0.5 text-[#D4A64A] shrink-0" />
        <p className="text-xs sm:text-sm leading-6 text-[#E2E8F0]">
          مِحَكّ يقيد أحكامه بما استُرجع من المصادر المعتمدة، ويمتنع عن التخمين عند نقص الدليل.
        </p>
      </div>
    );
  }

  return (
    <section className="mushaf-card p-6 sm:p-7 border border-[#D4A64A]/30 bg-[#0B1730]">
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-[#112240] border border-[#D4A64A]/30 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-[#D4A64A]" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white font-serif text-base">ضمانات الموثوقية الشرعية والحسابية</h3>
            <span className="text-[10px] text-[#D4A64A] font-mono border border-[#D4A64A]/30 px-2 py-0.5 rounded-full">
              ZERO-MEMORY GUARANTEE
            </span>
          </div>
          <p className="text-xs sm:text-sm leading-7 text-[#94A3B8]">
            لا يُعامل الذكاء الاصطناعي كمرجع في نقل القرآن أو السنة أو التفسير. كافة النصوص والمراجع تُسترجع حتمياً من المصادر المعتمدة، وعند غياب الدليل يمتنع النظام صراحة عن التوليد أو التلفيق.
          </p>
        </div>
      </div>
    </section>
  );
};
