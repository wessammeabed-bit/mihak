import React from 'react';
import {
  BookOpenCheck,
  Database,
  Eye,
  Scale,
  ShieldCheck,
  UserCheck,
  Sparkles,
  SplitSquareVertical,
  CheckCircle2,
  AlertTriangle,
  HelpCircle
} from 'lucide-react';
import { ReliabilityBanner } from '../components/ReliabilityBanner';

export const MethodologyPage: React.FC = () => {
  const principles = [
    {
      icon: Database,
      title: 'المصدر قبل الاستدلال (Source-Bound Rigor)',
      text: 'النموذج اللغوي ليس مرجعاً دينياً ولا مصدراً للرواية. الدليل المعروض يجب أن يُسترجع حصرياً وبشكل حتمي من مصادر القرآن والحديث المعتمدة.'
    },
    {
      icon: BookOpenCheck,
      title: 'وجود الشاهد لا يعني إثبات الادعاء (Semantic Precision)',
      text: 'يفصل مِحَكّ بين مجرد العثور على آية أو حديث ذي صلة موضوعية، وبين ثبوت أن النص يدعم بالضبط شروط الادعاء ونطاقه ودرجة يقينه.'
    },
    {
      icon: Scale,
      title: 'الامتناع الصارم عند نقص الدليل (Principled Abstention)',
      text: 'إذا لم تتوافر الأدلة الكافية في المصادر المتصلة، تكون النتيجة الصريحة «تعذر التحقق» بدلاً من الهلوسة أو التوليد غير الموثق من الذاكرة.'
    },
    {
      icon: SplitSquareVertical,
      title: 'رصد التحول الدلالي (Transformation Drift Auditing)',
      text: 'فحص التغيرات التي تطرأ على النصوص عند الترجمة أو التلخيص: إضافة المعنى، حذف القيد، تصعيد اليقين، أو تبديل جهة النسبة.'
    },
    {
      icon: UserCheck,
      title: 'إحالة الفتوى للمراجعة المتخصصة',
      text: 'المسائل التي تتطلب ترجيحاً فقهياً أو استنباطاً اجتهادياً تُحال صراحة لمراجعة العلماء ولا يُقضى فيها بنموذج حسابي.'
    },
    {
      icon: Eye,
      title: 'الشفافية الكاملة وقابلية التدقيق (Traceability)',
      text: 'يتمكن الباحث من مراجعة النص المسترجع كاملاً برسمه وروايته وإسناده، مع تبيان المرجع الدقيق وسبب التصنيف.'
    }
  ];

  const statuses = [
    ['اقتباس موثّق', 'VERIFIED QUOTE', 'مطابقة نصية تامة مع المصحف برواية حفص أو متن الحديث المحفوظ.', 'text-[#38BDF8] border-[#38BDF8]/30 bg-[#38BDF8]/10'],
    ['مدعوم بالدليل', 'SUPPORTED', 'الدليل المعتمد يثبت معنى الادعاء ونطاقه وقيوده دون زيادة أو نقصان.', 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'],
    ['مدعوم جزئيًا', 'PARTIALLY SUPPORTED', 'يوجد دعم لجزء من الادعاء، مع وجود قيود أو تفصيلات أُغفلت في الصياغة.', 'text-amber-400 border-amber-400/30 bg-amber-400/10'],
    ['انزياح دلالي', 'TRANSFORMATION DRIFT', 'رُصدت زيادة في المعنى، أو تصعيد في اليقين، أو توسيع للنطاق غير مثبت في المصدر.', 'text-purple-400 border-purple-400/30 bg-purple-400/10'],
    ['يحتاج مراجعة متخصصة', 'SPECIALIST REVIEW', 'يتضمن حكماً إنشائياً أو فتوى تتطلب فحصاً فقهياً متخصصاً.', 'text-indigo-400 border-indigo-400/30 bg-indigo-400/10'],
    ['الأدلة غير كافية', 'INSUFFICIENT EVIDENCE', 'المصادر المتصلة لا تسعف بإثبات الادعاء؛ ويمتنع النظام عن التوليد غير المسند.', 'text-orange-400 border-orange-400/30 bg-orange-400/10']
  ];

  return (
    <div className="max-w-6xl mx-auto pb-20 space-y-12" dir="rtl">
      {/* Header */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#D4A64A]/30 bg-[#0B1730] px-3.5 py-1 text-xs text-[#E0B85C]">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>METHODOLOGY & ARCHITECTURAL RIGOR</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white font-serif">
          منهجية مِحَكّ في حفظ حدود الدليل والنزاهة المعرفية
        </h1>
        <p className="max-w-3xl text-sm sm:text-base leading-8 text-[#94A3B8]">
          صُمم مِحَكّ ليكون أداة تدقيق وتحقق مقيدة بالمصادر، لا جهة فتوى ولا بديلاً عن العلماء؛ يفصل بشكل قطعي بين قدرات النموذج التوليدي وبين النصوص الدينية التوقيفية.
        </p>
      </header>

      <ReliabilityBanner />

      {/* Principles */}
      <section className="space-y-6">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-[#D4A64A]" />
          <h2 className="text-xl sm:text-2xl font-bold text-white font-serif">مبادئ التدقيق الحسابي الرصين</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {principles.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="mushaf-card p-6 rounded-2xl border border-[#D4A64A]/20 bg-[#0B1730] flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#112240] border border-[#D4A64A]/30 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[#D4A64A]" />
                </div>
                <h3 className="text-base font-bold text-white font-serif">{title}</h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Statuses Breakdown */}
      <section className="space-y-6">
        <div className="flex items-center gap-2.5">
          <Scale className="w-5 h-5 text-[#D4A64A]" />
          <h2 className="text-xl sm:text-2xl font-bold text-white font-serif">مصفوفة الحالات والتصنيفات الدلالية</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {statuses.map(([title, en, desc, colorClass]) => (
            <div
              key={title}
              className="manuscript-frame rounded-2xl p-5 space-y-2"
            >
              <div className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold border ${colorClass}`}>
                {title} <span className="text-[10px] opacity-75 font-mono">({en})</span>
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
