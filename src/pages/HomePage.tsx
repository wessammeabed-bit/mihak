import React, { useState } from 'react';
import {
  ArrowLeft,
  FileSearch,
  GitCompare,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  BookOpen,
  Scale,
  SplitSquareVertical
} from 'lucide-react';
import { MihakLogo } from '../components/MihakLogo';
import { ChallengeBadge } from '../components/ChallengeBadge';

interface HomePageProps {
  onNavigate: (tab: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [activeDemo, setActiveDemo] = useState<'quote' | 'drift' | 'abstention'>('quote');

  const demoCases = {
    quote: {
      tag: 'اقتباس موثق • VERIFIED_QUOTE',
      tagColor: 'text-[#2EF2C2] border-[#2EF2C2]/30 bg-[#2EF2C2]/10',
      claim: '«إِنَّمَا الْأَعْمَالُ بِالنِّيَّةِ، وَإِنَّمَا لِامْرِئٍ مَا نَوَى»',
      source: 'موسوعة الأحاديث النبوية المعتمدة (متفق عليه)',
      finding: 'المتن مطابق حرفياً للرواية المحفوظة في الصحيحين، والإسناد صحيح متفق عليه، مع ثبوت اللفظ الآخر «بالنيات».',
      relation: 'DIRECT_SUPPORT'
    },
    drift: {
      tag: 'انزياح دلالي • TRANSFORMATION_DRIFT',
      tagColor: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
      claim: '«أجمع كل المفسرين قطعاً وبلا خلاف أن الآية تحرّم كذا...»',
      source: 'التفسير الميسر ومصادر التفسير المقارن',
      finding: 'رُصدت زيادة في درجة اليقين (Certainty Escalation) وتوسيع في النطاق (Scope Broadening) لا تدعمه عبارات المفسرين المعتمدة.',
      relation: 'SCOPE_MISMATCH'
    },
    abstention: {
      tag: 'امتناع مؤسسي • INSUFFICIENT_EVIDENCE',
      tagColor: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
      claim: 'سؤال عن مسألة أو حديث لم يرد في المصادر المتصلة',
      source: 'مصادر الحديث والسيرة المتصلة',
      finding: 'تعذر التحقق من هذا السؤال من المصادر المتصلة حاليًا. ويمتنع مِحَكّ عن التخمين أو الإجابة من ذاكرة النموذج.',
      relation: 'UNVERIFIED'
    }
  };

  const workflowSteps = [
    {
      num: '01',
      title: 'تفكيك الادعاءات الذرية',
      desc: 'تحليل النص وتفكيكه إلى وحدات ادعائية مستقلة قابلة للتحقق والفحص المنفصل بدل التعامل مع النص ككتلة عامة.'
    },
    {
      num: '02',
      title: 'الاسترجاع المقيد بالمصادر',
      desc: 'توجيه كل ادعاء حتمياً للمصدر المعتمد (القرآن الكريم، التفسير الميسر، غريب القرآن، السنة النبوية) دون وسيط تخميني.'
    },
    {
      num: '03',
      title: 'تدقيق التحول الدلالي',
      desc: 'مقارنة دلالية دقيقة ترصد: الإضافة، الحذف، تغيّر النفي والإثبات، تصعيد اليقين، أو انزياح المصطلح الشرعي.'
    },
    {
      num: '04',
      title: 'الإثبات أو الامتناع الشرعي',
      desc: 'إصدار بطاقة تدقيق شفافة تربط النص بالدليل الأصلي، أو الامتناع المعلن عند عدم كفاية الأدلة المسندة.'
    }
  ];

  return (
    <div className="pb-24 space-y-24">
      {/* 1. HERO SECTION */}
      <section className="relative pt-6 sm:pt-12 pb-14 overflow-hidden">
        {/* Soft atmospheric radial glows in Challenge palette */}
        <div className="absolute inset-0 pointer-events-none -z-10">
          <div className="absolute top-1/4 right-1/3 w-96 h-96 rounded-full bg-[#6150EA]/10 blur-[130px]" />
          <div className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full bg-[#2EF2C2]/08 blur-[140px]" />
        </div>

        <div className="max-w-5xl mx-auto text-center space-y-7">
          {/* Secondary Badge: Challenge Affiliation */}
          <div className="flex justify-center">
            <ChallengeBadge variant="pill" />
          </div>

          {/* Primary Logo & Brand Section */}
          <div className="space-y-4 flex flex-col items-center">
            <div className="p-2 sm:p-3 rounded-2xl bg-gradient-to-b from-[#12183F]/80 to-[#0C1033]/90 border border-[#2EF2C2]/20 shadow-[0_0_35px_rgba(46,242,194,0.08)]">
              <MihakLogo size="xl" variant="horizontal" showSubtitle={false} />
            </div>

            <p className="text-xl sm:text-2xl text-[#F2F4FF] font-light max-w-3xl mx-auto leading-relaxed pt-2">
              تتبّع الادعاء الديني إلى مصدره المعتمد، واكشف ما طرأ عليه من انزياح دلالي
            </p>
          </div>

          {/* Core Philosophy Quote */}
          <div className="relative py-2 max-w-2xl mx-auto">
            <p className="text-base sm:text-lg leading-8 text-[#2EF2C2] font-serif italic border-y border-[#6150EA]/30 bg-[#12183F]/40 py-3.5 px-6 rounded-xl">
              «لا نعتمد على ذاكرة النموذج في نقل الدين، بل نقيد الإجابة بما استُرجع وثَبُت في المصادر»
            </p>
          </div>

          <p className="max-w-2xl mx-auto text-sm sm:text-base leading-7 text-[#94A3B8]">
            أداة رقابية متخصصة للباحثين ومحققي المحتوى والمنصات الإسلامية؛ تفحص الاقتباسات، ترصد الفروق الدلالية الدقيقة، وتمتنع عن التخمين عند غياب الدليل.
          </p>

          {/* CTA Buttons in Official Challenge Colors */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-3">
            <button
              type="button"
              onClick={() => onNavigate('audit')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#2EF2C2] px-8 py-4 font-bold text-[#0C1033] shadow-[0_0_25px_rgba(46,242,194,0.25)] hover:brightness-105 transition-all cursor-pointer text-sm sm:text-base"
            >
              <FileSearch className="w-5 h-5 text-[#0C1033]" />
              <span>تدقيق نص أو سؤال ديني</span>
              <ArrowLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('compare')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#6150EA]/50 bg-[#12183F] px-8 py-4 font-semibold text-[#F2F4FF] hover:border-[#2EF2C2] hover:bg-[#162054] shadow-[0_0_15px_rgba(0,0,0,0.3)] transition-all cursor-pointer text-sm sm:text-base"
            >
              <GitCompare className="w-5 h-5 text-[#2EF2C2]" />
              <span>مقارنة نصين ورصد الانزياح</span>
            </button>
          </div>
        </div>

        {/* Refined Geometric Motif Card */}
        <div className="mt-14 max-w-3xl mx-auto relative px-4">
          <div className="mushaf-card p-6 sm:p-8 manuscript-frame rounded-2xl border border-[#2EF2C2]/25">
            {/* Fine Corner Marks in Turquoise */}
            <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#2EF2C2]/60" />
            <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-[#2EF2C2]/60" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-[#2EF2C2]/60" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-[#2EF2C2]/60" />

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-right">
                <div className="flex items-center gap-2 text-xs text-[#2EF2C2] font-semibold">
                  <BookOpen className="w-4 h-4 text-[#2EF2C2]" />
                  <span>محرك التدقيق المقيد بالمصادر</span>
                </div>
                <h3 className="text-lg font-bold text-white">تحقق حتمي من نصوص القرآن وتفاسيره والسنة</h3>
                <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                  ربط كامل مع الرسم العثماني لمصحف المدينة النبوية، التفسير الميسر، غريب القرآن، وموسوعة الأحاديث النبوية.
                </p>
              </div>

              {/* Decorative Geometric Seal SVG in Challenge Palette */}
              <div className="shrink-0 w-24 h-24 relative flex items-center justify-center">
                <svg className="w-full h-full text-[#6150EA]/50 animate-subtle-float" viewBox="0 0 100 100" fill="none">
                  <rect x="25" y="25" width="50" height="50" stroke="currentColor" strokeWidth="1.5" transform="rotate(0 50 50)" />
                  <rect x="25" y="25" width="50" height="50" stroke="#2EF2C2" strokeWidth="1.5" strokeOpacity="0.7" transform="rotate(45 50 50)" />
                  <circle cx="50" cy="50" r="18" stroke="#6150EA" strokeWidth="1.5" strokeOpacity="0.7" />
                  <circle cx="50" cy="50" r="4" fill="#2EF2C2" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. INTERACTIVE DEMO & PROOF */}
      <section className="max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold font-serif text-white">كيف يختلف «مِحَكّ» عن روبوتات المحادثة العادية؟</h2>
          <p className="text-sm text-[#94A3B8]">
            الروبوت العادي يجيب من ذاكرته التوليدية، أما مِحَكّ فيقيد الحكم بوجود الدليل الفعلي ويفحص تطابق المعنى
          </p>
        </div>

        {/* Demo Tabs */}
        <div className="flex items-center justify-center gap-2 border-b border-[#263168] pb-3">
          <button
            type="button"
            onClick={() => setActiveDemo('quote')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer ${
              activeDemo === 'quote'
                ? 'bg-[#12183F] text-[#2EF2C2] border border-[#2EF2C2]/40 shadow-[0_0_12px_rgba(46,242,194,0.15)] font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            1. توثيق الاقتباس
          </button>
          <button
            type="button"
            onClick={() => setActiveDemo('drift')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer ${
              activeDemo === 'drift'
                ? 'bg-[#12183F] text-amber-400 border border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.15)] font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            2. رصد الانزياح الدلالي
          </button>
          <button
            type="button"
            onClick={() => setActiveDemo('abstention')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition cursor-pointer ${
              activeDemo === 'abstention'
                ? 'bg-[#12183F] text-orange-400 border border-orange-400/40 shadow-[0_0_12px_rgba(251,146,60,0.15)] font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            3. الامتناع عند غياب الدليل
          </button>
        </div>

        {/* Active Demo Card */}
        <div className="manuscript-frame rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${demoCases[activeDemo].tagColor}`}>
              {demoCases[activeDemo].tag}
            </span>
            <span className="text-xs text-[#94A3B8]">المصدر: {demoCases[activeDemo].source}</span>
          </div>

          <div className="bg-[#0C1033] p-4 rounded-xl border border-[#263168]">
            <div className="text-xs text-[#94A3B8] mb-1">الادعاء أو النص المُدخَل:</div>
            <div className="text-white font-serif text-base sm:text-lg">{demoCases[activeDemo].claim}</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-[#2EF2C2] font-semibold">نتيجة التدقيق والتعليل:</div>
            <p className="text-sm text-[#F2F4FF] leading-relaxed">{demoCases[activeDemo].finding}</p>
          </div>
        </div>
      </section>

      {/* 3. FOUR-STAGE AUDITING PIPELINE */}
      <section className="max-w-6xl mx-auto space-y-10">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold font-serif text-white">منهجية التدقيق رباعية المراحل</h2>
          <p className="text-sm text-[#94A3B8] max-w-xl mx-auto">
            بنية تدقيق صارمة تفصل بين استرجاع النص، وبين إثبات أن النص يدعم الادعاء بالفعل
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {workflowSteps.map((step) => (
            <div
              key={step.num}
              className="mushaf-card p-6 rounded-2xl border border-[#263168] bg-[#12183F] flex flex-col justify-between hover:border-[#6150EA]/50 transition"
            >
              <div className="space-y-3">
                <span className="text-3xl font-bold font-mono text-[#2EF2C2]/60 block">{step.num}</span>
                <h3 className="text-base font-bold text-white font-serif">{step.title}</h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. VERDICT & STATUS MATRIX */}
      <section className="max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold font-serif text-white">مستويات التصنيف والنزاهة</h2>
          <p className="text-sm text-[#94A3B8]">
            لا يكتفي مِحَكّ بـ «صواب / خطأ»، بل يعتمد مصفوفة تصنيف دلالية تعكس بدقة طبيعة العلاقة بالدليل
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-[#2EF2C2]/30 bg-[#12183F]/70 space-y-2">
            <div className="flex items-center gap-2 text-[#2EF2C2] font-bold text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>اقتباس موثق (Verified Quote)</span>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              النص القرآني أو الحديثي منسوب لموضعه الصحيح ومطابق للرسم والرواية المعتمدة حرفياً.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[#2EF2C2]/30 bg-[#12183F]/70 space-y-2">
            <div className="flex items-center gap-2 text-[#2EF2C2] font-bold text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>مدعوم بالدليل (Supported)</span>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              الدليل المسترجع من المصدر المعتمد يثبت معنى الادعاء ونطاقه وشروطه بالكامل دون زيادة.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-amber-400/30 bg-[#12183F]/70 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>مدعوم جزئياً (Partially Supported)</span>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              الدليل يثبت جزءاً من المعنى، ولكن هناك تقييداً أو شرطاً أهمله الناقل في صياغته.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-purple-400/30 bg-[#12183F]/70 space-y-2">
            <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
              <SplitSquareVertical className="w-4 h-4" />
              <span>انزياح دلالي (Transformation Drift)</span>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              إضافة معنى لم يرد في الأصل، أو تغيير النفي إلى إثبات، أو تحويل الظني إلى قطعي.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-indigo-400/30 bg-[#12183F]/70 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
              <Scale className="w-4 h-4" />
              <span>يحتاج مراجعة متخصصة</span>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              مسائل الفتوى والأحكام الإنشائية ودعاوى الإجماع الخلافية التي لا يقضي فيها نموذج آلي.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-orange-400/30 bg-[#12183F]/70 space-y-2">
            <div className="flex items-center gap-2 text-orange-400 font-bold text-sm">
              <HelpCircle className="w-4 h-4" />
              <span>دليل غير كافٍ (Abstention)</span>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              تعذر استرجاع نص صريح من المصادر المتصلة؛ يمتنع مِحَكّ عن التوليد أو التلفيق.
            </p>
          </div>
        </div>
      </section>

      {/* 5. BOTTOM CTA BANNER */}
      <section className="max-w-4xl mx-auto">
        <div className="manuscript-frame rounded-2xl p-8 sm:p-10 text-center space-y-5">
          <h2 className="text-2xl sm:text-3xl font-bold font-serif text-white">ابدأ فحص نصوصك واقتباساتك الدينية الآن</h2>
          <p className="text-sm text-[#94A3B8] max-w-xl mx-auto">
            أداة مفتوحة المعايير تضمن سلامة النقل، وتحفظ قدسية النصوص من الهلوسة والتحريف غير المقصود.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onNavigate('audit')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2EF2C2] px-8 py-3.5 font-bold text-[#0C1033] hover:brightness-105 transition cursor-pointer shadow-[0_0_20px_rgba(46,242,194,0.2)]"
            >
              <span>فتح منصة التدقيق</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
