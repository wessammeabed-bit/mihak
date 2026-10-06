import React from 'react';
import {
  ArrowLeft,
  Bot,
  Languages,
  SearchCheck,
  Users,
  ShieldCheck,
  Sparkles,
  Trophy
} from 'lucide-react';
import { MihakLogo } from '../components/MihakLogo';
import { ChallengeRosette } from '../components/ChallengeBadge';

interface AboutPageProps {
  onNavigate: (tab: string) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  const users = [
    {
      icon: SearchCheck,
      title: 'الباحثون والمحققون الشرعيون',
      text: 'فحص الاقتباسات والادعاءات بدقة، والوصول المباشر إلى نصوص الآيات والأحاديث وتفاسيرها المعتمدة.'
    },
    {
      icon: Languages,
      title: 'المترجمون وفرق التحرير',
      text: 'مراجعة ما قد يطرأ من تحول أو انزياح دلالي عند ترجمة المعاني الإسلامية أو اختصارها أو إعادة صياغتها.'
    },
    {
      icon: Users,
      title: 'منصات ومواقع المحتوى الإسلامي',
      text: 'تدقيق المقالات والمسودات قبل النشر لحماية المحتوى من النقل المشوه أو التلفيق غير المقصود.'
    },
    {
      icon: Bot,
      title: 'مهندسو منتجات الذكاء الاصطناعي',
      text: 'استخدام مِحَكّ كطبقة أمان وتحقق رقابية (Integrity Guardrail) تمنع هلوسة النماذج التوليدية في الدين.'
    }
  ];

  return (
    <div className="max-w-6xl mx-auto pb-20 space-y-12" dir="rtl">
      {/* Header with Project Identity */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#2EF2C2]/30 bg-[#12183F] px-3.5 py-1 text-xs text-[#2EF2C2]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>نظام رقابي متخصص</span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-[#6150EA]/40 bg-[#12183F] px-3.5 py-1 text-xs text-[#A5B4FC]">
            <ChallengeRosette size="w-3.5 h-3.5" />
            <span>مشارك في تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي</span>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-1">
          <MihakLogo size="lg" variant="horizontal" showSubtitle={false} />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white font-serif">
          عن منصة مِحَكّ (MIHAK)
        </h1>
        <p className="max-w-3xl text-sm sm:text-base leading-8 text-[#94A3B8]">
          مِحَكّ هو نظام رائد لتدقيق سلامة ونزاهة المحتوى الإسلامي؛ صُمم ليعالج تحدي هلوسة وتوليد الذكاء الاصطناعي مع النصوص الشرعية من خلال التثبت الصارم المقيد بالمصادر المعتمدة.
        </p>
      </header>

      {/* Challenge Affiliation Card */}
      <section className="rounded-2xl border border-[#6150EA]/30 bg-gradient-to-r from-[#12183F] via-[#10163C] to-[#0C1033] p-6 sm:p-7 space-y-3 shadow-[0_0_25px_rgba(97,80,234,0.1)]">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#6150EA]/20 border border-[#6150EA]/40 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-[#2EF2C2]" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-white text-base">المشاركة في تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي</h3>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-7">
              يشارك مشروع «مِحَكّ» ضمن <span className="text-[#2EF2C2] font-semibold">المسار الرابع: أدوات المعرفة والتحقق لتمكين المعرّفين بالإسلام</span>، بتنظيم من <span className="text-white font-semibold">مؤسسة باذل الأهلية (BATHEL)</span> تزامناً مع عام الذكاء الاصطناعي 2026م.
            </p>
          </div>
        </div>
      </section>

      {/* Core Philosophy Banner */}
      <section className="manuscript-frame rounded-2xl p-8 sm:p-10 text-center">
        <p className="text-xl sm:text-2xl leading-10 font-serif text-white max-w-3xl mx-auto">
          لا نطلب من الذكاء الاصطناعي أن يكون هو المرجع الديني؛ بل نلزمه بأن يوضح
          <span className="text-[#2EF2C2]"> أين وجد الدليل</span>،
          <span className="text-[#A5B4FC]"> وماذا يدعم الدليل تحديداً</span>،
          ومتى يجب أن <span className="text-orange-400 font-bold">يمتنع معلناً نقص الأدلة</span>.
        </p>
      </section>

      {/* Target Audiences */}
      <section className="space-y-6">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-[#2EF2C2]" />
          <h2 className="text-xl sm:text-2xl font-bold text-white font-serif">لمن صُمم مِحَكّ؟</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {users.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="mushaf-card p-6 rounded-2xl border border-[#263168] bg-[#12183F] flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#162054] border border-[#6150EA]/30 flex items-center justify-center mb-2">
                  <Icon className="w-5 h-5 text-[#2EF2C2]" />
                </div>
                <h3 className="text-base font-bold text-white font-serif">{title}</h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="manuscript-frame rounded-2xl p-8 text-center space-y-4">
        <h3 className="text-xl font-bold text-white font-serif">جاهز لبدء تدقيق نصوصك؟</h3>
        <p className="text-xs text-[#94A3B8]">ابدأ الآن بالتحقق وتدقيق أي نص أو سؤال ديني عبر المصادر المعتمدة مباشرة.</p>
        <div>
          <button
            type="button"
            onClick={() => onNavigate('audit')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2EF2C2] px-8 py-3 font-bold text-[#0C1033] hover:brightness-105 transition cursor-pointer shadow-[0_0_20px_rgba(46,242,194,0.2)]"
          >
            <span>فتح منصة التدقيق</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
};
