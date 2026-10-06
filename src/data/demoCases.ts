import { AuditRun, ComparisonRun } from '../types';

export interface DemoAuditPreset {
  id: string;
  title: string;
  badge: string;
  description: string;
  inputText: string;
  expectedResult?: Partial<AuditRun>;
}

export interface DemoComparePreset {
  id: string;
  title: string;
  badge: string;
  description: string;
  isSynthetic: boolean;
  derivedType: string;
  sourceText: string;
  derivedText: string;
  expectedCategory: string;
  expectedDeltaExplanation: string;
  expectedResult?: Partial<ComparisonRun>;
}

/**
 * Audit Content Presets
 */
export const DEMO_AUDIT_PRESETS: DemoAuditPreset[] = [
  {
    id: 'demo-quran-ikhlas',
    title: 'الحالة النموذجية 1: آية سورة الإخلاص (مطابقة تامة وموثقة)',
    badge: 'SUPPORTED / مدعوم',
    description: 'تحقق قطعي لنسبة افتتاحية سورة الإخلاص مع مطابقة نصية كاملة في المصحف الشريف.',
    inputText: 'تبدأ سورة الإخلاص بقوله تعالى: «قُلْ هُوَ اللَّهُ أَحَدٌ».',
    expectedResult: {
      input_text: 'تبدأ سورة الإخلاص بقوله تعالى: «قُلْ هُوَ اللَّهُ أَحَدٌ».',
      detected_language: 'ar',
      stats: {
        total: 1,
        supported: 1,
        partiallySupported: 0,
        insufficientEvidence: 0,
        needsSpecialistReview: 0,
        verifiedQuotes: 1
      },
      claims: [
        {
          id: 'CLM-001',
          claim_text: 'تبدأ سورة الإخلاص بالآية: «قُلْ هُوَ اللَّهُ أَحَدٌ».',
          source_span: {
            text: 'تبدأ سورة الإخلاص بقوله تعالى: «قُلْ هُوَ اللَّهُ أَحَدٌ»',
            start: 0,
            end: 49
          },
          status: 'SUPPORTED',
          confidence_score: 0.99,
          evidence_relation: 'DIRECT_SUPPORT',
          evidence_passage: 'قُلْ هُوَ اللَّهُ أَحَدٌ',
          verification_rationale: 'تطابق تام وموثق بين نص الادعاء وموضع الآية الأولى من سورة الإخلاص في القرآن الكريم برواية حفص عن عاصم.',
          evidence: {
            source_id: 'QURAN-112-001',
            source_name: 'القرآن الكريم',
            canonical_reference: 'سورة الإخلاص، الآية 1',
            language: 'ar',
            raw_text: 'قُلْ هُوَ اللَّهُ أَحَدٌ',
            version: 'مصحف المدينة النبوية — مجمع الملك فهد لطباعة المصحف الشريف (رواية حفص عن عاصم)',
            license_note: 'نص قرآني قطعي الثبوت — متاح للاستخدام الأكاديمي والتحقق الشرعي',
            surah_number: 112,
            ayah_number: 1,
            category: 'quran'
          }
        }
      ]
    }
  },
  {
    id: 'demo-mixed-abstention',
    title: 'الحالة النموذجية 2: نص مركب يحتوي اقتباساً صحيحاً وادعاءً غير مثبت',
    badge: 'INSUFFICIENT_EVIDENCE / امتناع',
    description: 'يختبر قدرة النظام على تفكيك النص وتوثيق الجزء الثابت والامتناع عن إثبات الادعاء غير الموثق في المدونة.',
    inputText: 'ذكر الله تعالى في سورة الحجرات: «يَا أَيُّهَا الَّذِينَ آمَنُوا إِنْ جَاءَكُمْ فَاسِقٌ بِنَبَإٍ فَتَبَيَّنُوا». وقد أجمع العلماء المعاصرون على أن هذا النص ينطبق حرفياً وبصورة حصرية على منصات التواصل الاجتماعي الرقمية دون غيرها.',
    expectedResult: {
      stats: {
        total: 2,
        supported: 1,
        partiallySupported: 0,
        insufficientEvidence: 1,
        needsSpecialistReview: 1,
        verifiedQuotes: 1
      },
      claims: [
        {
          id: 'CLM-001',
          claim_text: 'ورد في سورة الحجرات الأمر بالتبيّن عند مجيء الفاسق بنبأ: «يَا أَيُّهَا الَّذِينَ آمَنُوا إِنْ جَاءَكُمْ فَاسِقٌ بِنَبَإٍ فَتَبَيَّنُوا».',
          source_span: {
            text: 'ذكر الله تعالى في سورة الحجرات: «يَا أَيُّهَا الَّذِينَ آمَنُوا إِنْ جَاءَكُمْ فَاسِقٌ بِنَبَإٍ فَتَبَيَّنُوا»',
            start: 0,
            end: 104
          },
          status: 'VERIFIED_QUOTE',
          confidence_score: 0.98,
          evidence_relation: 'DIRECT_SUPPORT',
          evidence_passage: 'يَا أَيُّهَا الَّذِينَ آمَنُوا إِنْ جَاءَكُمْ فَاسِقٌ بِنَبَإٍ فَتَبَيَّنُوا أَنْ تُصِيبُوا قَوْمًا بِجَهَالَةٍ',
          verification_rationale: 'مقطع قرآني موثق من سورة الحجرات الآية 6 يطابق نص الآية.',
          evidence: {
            source_id: 'QURAN-049-006',
            source_name: 'القرآن الكريم',
            canonical_reference: 'سورة الحجرات، الآية 6',
            language: 'ar',
            raw_text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا إِنْ جَاءَكُمْ فَاسِقٌ بِنَبَإٍ فَتَبَيَّنُوا أَنْ تُصِيبُوا قَوْمًا بِجَهَالَةٍ فَتُصْبِحُوا عَلَىٰ مَا فَعَلْتُمْ نَادِمِينَ',
            version: 'مصحف المدينة النبوية — مجمع الملك فهد لطباعة المصحف الشريف (رواية حفص عن عاصم)',
            license_note: 'نص قرآني قطعي الثبوت — متاح للاستخدام الأكاديمي والتحقق الشرعي',
            surah_number: 49,
            ayah_number: 6,
            category: 'quran'
          }
        },
        {
          id: 'CLM-002',
          claim_text: 'انعقد إجماع العلماء المعاصرين على قصر حكم الآية على منصات التواصل الاجتماعي الرقمية حصراً.',
          source_span: {
            text: 'وقد أجمع العلماء المعاصرون على أن هذا النص ينطبق حرفياً وبصورة حصرية على منصات التواصل الاجتماعي الرقمية دون غيرها',
            start: 106,
            end: 220
          },
          status: 'INSUFFICIENT_EVIDENCE',
          confidence_score: 0.15,
          evidence_relation: 'UNVERIFIED',
          verification_rationale: 'امتناع مِحَكّ: لا يوجد في المصادر المتاحة أي مستند يثبت دعوى الإجماع أو حصر دلالة النص القرآني العام في وسيلة رقمية معاصرة.',
          specialist_review_reason: 'ادعاء الإجماع وتخصيص عموم النص القرآني يتطلب إحالة لمتخصصين في أصول الفقه.'
        }
      ]
    }
  }
];

/**
 * Compare Transformation Presets
 */
export const DEMO_COMPARE_PRESETS: DemoComparePreset[] = [
  {
    id: 'demo-modality-shift-synthetic',
    title: 'الحالة الاختبارية 1: تغيّر درجة اليقين (Synthetic Modality Shift)',
    badge: 'MODALITY_SHIFT / تغيّر درجة اليقين',
    description: 'مثال اصطناعي مخصص لاختبار قدرة المحرك على رصد الانتقال من دلالة احتمالية مشروطة إلى جزم قطعي.',
    isSynthetic: true,
    derivedType: 'إعادة صياغة ذكاء اصطناعي (AI Rewrite)',
    sourceText: 'قد يدل النص في هذا السياق على معنى معين.',
    derivedText: 'النص يدل قطعًا على هذا المعنى.',
    expectedCategory: 'MODALITY_SHIFT',
    expectedDeltaExplanation: 'تحولت صياغة احتمالية (قد يدل) إلى صياغة أكثر يقينًا وقطعية (يدل قطعًا).',
    expectedResult: {
      integrity_score: 52,
      alignment_summary: 'تم رصد انزياح في قوة الحكم الشرعي/الدلالي من درجة الاحتمال والترجيح إلى درجة القطع والجزم، مما يغير المعنى المقصود في المصدر.',
      deltas: [
        {
          id: 'DELTA-001',
          category: 'MODALITY_SHIFT',
          category_label_ar: 'تغيّر درجة اليقين (Modality Shift)',
          source_span: 'قد يدل النص في هذا السياق',
          derived_span: 'النص يدل قطعًا',
          explanation: 'تحولت صياغة احتمالية («قد يدل») إلى صياغة أكثر يقينًا وقطعية («يدل قطعًا»)، وهو ما لا يدعمه النص المصدر.',
          impact_level: 'CRITICAL'
        }
      ]
    }
  },
  {
    id: 'demo-scope-omission',
    title: 'الحالة النموذجية 2: حذف القيد وتوسيع النطاق (Scope & Omission Shift)',
    badge: 'OMISSION & SCOPE / حذف وتعميم',
    description: 'إسقاط قيد الاحتراز أو الظرف الزماني/المكاني مما أدى إلى تعميم حكم خاص.',
    isSynthetic: false,
    derivedType: 'تلخيص صحفي وترجمة (Summary & Translation)',
    sourceText: 'يجوز للمسافر رخصة قصر الصلاة الرباعية بشرط بلوغ مسافة السفر المعتبرة وعدم نية الإقامة المطلقة.',
    derivedText: 'يجوز للمسلم في أي ظرف قصر الصلوات دائمًا دون شروط مقيدة.',
    expectedCategory: 'SCOPE_SHIFT',
    expectedDeltaExplanation: 'تم حذف قيد السفر ونية الإقامة، وتوسيع نطاق الرخصة إلى عموم المسلمين في أي ظرف.',
    expectedResult: {
      integrity_score: 35,
      alignment_summary: 'تم رصد حذف قيود جوهرية وتوسيع غير مبرر في نطاق الرخصة الفقهية.',
      deltas: [
        {
          id: 'DELTA-001',
          category: 'OMISSION',
          category_label_ar: 'حذف معنى أو قيد (Omission)',
          source_span: 'بشرط بلوغ مسافة السفر المعتبرة وعدم نية الإقامة المطلقة',
          derived_span: 'دون شروط مقيدة',
          explanation: 'حذف القيود والشروط الجوهرية (مسافة السفر، نية الإقامة) الواردة في النص المصدر.',
          impact_level: 'CRITICAL'
        },
        {
          id: 'DELTA-002',
          category: 'SCOPE_SHIFT',
          category_label_ar: 'توسيع النطاق (Scope Shift)',
          source_span: 'للمسافر',
          derived_span: 'للمسلم في أي ظرف ... دائمًا',
          explanation: 'تحويل الحكم من حالة مخصوصة للمسافر إلى عموم دائم لجميع المسلمين دون مبرر نصي.',
          impact_level: 'CRITICAL'
        }
      ]
    }
  },
  {
    id: 'demo-attribution-shift',
    title: 'الحالة النموذجية 3: انزياح جهة النسبة (Attribution Shift)',
    badge: 'ATTRIBUTION_SHIFT / انزياح النسبة',
    description: 'تغيير الشخص أو الجهة المنسوب إليها القول من قول عالم اجتهادي إلى أمر مجمع عليه أو منسوب للنص.',
    isSynthetic: false,
    derivedType: 'مخرجات نموذج لغوي (LLM Output)',
    sourceText: 'ذهب الإمام الشافعي في أحد قوليه إلى استحباب هذا العمل في أوقات الفراغ.',
    derivedText: 'أجمعت الأمة الإسلامية كافة وفرضت الشريعة هذا العمل فرضًا لازمًا على كل مكلف.',
    expectedCategory: 'ATTRIBUTION_SHIFT',
    expectedDeltaExplanation: 'تم نقل القول من رأي اجتهادي لأحد الأئمة مع الاستحباب إلى ادعاء إجماع وفرضية قطعية.',
    expectedResult: {
      integrity_score: 20,
      alignment_summary: 'انزياح خطر في جهة النسبة وفي نوع الحكم التكليفي من الاستحباب الفردي إلى الفرضية والإجماع.',
      deltas: [
        {
          id: 'DELTA-001',
          category: 'ATTRIBUTION_SHIFT',
          category_label_ar: 'تغيّر جهة النسبة (Attribution Shift)',
          source_span: 'ذهب الإمام الشافعي في أحد قوليه',
          derived_span: 'أجمعت الأمة الإسلامية كافة',
          explanation: 'تغيير جهة النسبة من رأي فردي مجتهد فيه إلى إجماع الأمة بأسرها.',
          impact_level: 'CRITICAL'
        },
        {
          id: 'DELTA-002',
          category: 'TERM_DRIFT',
          category_label_ar: 'انزياح المصطلح (Term Drift)',
          source_span: 'استحباب هذا العمل',
          derived_span: 'فرضت الشريعة هذا العمل فرضًا لازمًا',
          explanation: 'تبديل الحكم التكليفي من «الاستحباب» إلى «الفرض اللازم»، وهو انزياح دلالي فقهي جوهري.',
          impact_level: 'CRITICAL'
        }
      ]
    }
  }
];
