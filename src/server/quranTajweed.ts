import fs from 'fs';
import { gunzipSync } from 'zlib';
import { fileURLToPath } from 'url';


/* =========================================================
   MIHAK — QURAN TAJWEED LAYER

   Reads the local Tajweed dataset:
   src/data/quran_tajweed_mihak.json.gz

   Important:
   - No Gemini is used as a Tajweed source.
   - We expose the annotation stored in the dataset.
   - We do not invent a Tajweed rule when no annotation exists.
   ========================================================= */


type TajweedWordRecord = {
  word: number;
  location: string;
  text: string;
};


type TajweedDataset = {
  source_file?: string;
  format?: string;

  verses: Record<
    string,
    TajweedWordRecord[]
  >;
};


export type TajweedRuleKey =
  | 'ham_wasl'
  | 'laam_shamsiyah'
  | 'madda_normal'
  | 'madda_permissible'
  | 'madda_necessary'
  | 'madda_obligatory_monfasel'
  | 'madda_obligatory_mottasel'
  | 'idgham_wo_ghunnah'
  | 'idgham_ghunnah'
  | 'idgham_shafawi'
  | 'idgham_mutajanisayn'
  | 'idgham_mutaqaribayn'
  | 'ikhafa'
  | 'ikhafa_shafawi'
  | 'iqlab'
  | 'ghunnah'
  | 'qalaqah'
  | 'slnt';


export type TajweedRuleInfo = {
  key: TajweedRuleKey | string;

  label: string;

  shortDescription: string;
};


export type TajweedOccurrence = {
  ruleKey: string;

  ruleLabel: string;

  description: string;

  markedText: string;

  wordNumber: number;

  wordText: string;

  location: string;
};


export type TajweedWordResult = {
  wordNumber: number;

  location: string;

  plainText: string;

  annotatedText: string;

  rules: TajweedOccurrence[];
};


export type TajweedAyahResult = {
  surahNumber: number;

  ayahNumber: number;

  words: TajweedWordResult[];

  rules: TajweedOccurrence[];

  uniqueRules: TajweedRuleInfo[];
};


/* =========================================================
   RULE DICTIONARY
   ========================================================= */


export const TAJWEED_RULES:
  Record<string, TajweedRuleInfo> = {

  ham_wasl: {
    key: 'ham_wasl',
    label: 'همزة الوصل',
    shortDescription:
      'همزة يُبدأ بها في الابتداء وتسقط في درج الكلام وفق موضعها.'
  },

  laam_shamsiyah: {
    key: 'laam_shamsiyah',
    label: 'اللام الشمسية',
    shortDescription:
      'لام التعريف التي تُدغم في الحرف الشمسي الذي يليها.'
  },

  madda_normal: {
    key: 'madda_normal',
    label: 'مد طبيعي',
    shortDescription:
      'المد الأصلي الذي لا تقوم ذات حرف المد إلا به.'
  },

  madda_permissible: {
    key: 'madda_permissible',
    label: 'مد جائز',
    shortDescription:
      'موضع مد مصنف في بيانات المصدر ضمن المد الجائز.'
  },

  madda_necessary: {
    key: 'madda_necessary',
    label: 'مد لازم',
    shortDescription:
      'موضع مد مصنف في بيانات المصدر ضمن المد اللازم.'
  },

  madda_obligatory_monfasel: {
    key: 'madda_obligatory_monfasel',
    label: 'مد منفصل',
    shortDescription:
      'موضع مد منفصل كما هو مصنف في بيانات التجويد المستخدمة.'
  },

  madda_obligatory_mottasel: {
    key: 'madda_obligatory_mottasel',
    label: 'مد متصل',
    shortDescription:
      'موضع مد متصل كما هو مصنف في بيانات التجويد المستخدمة.'
  },

  idgham_wo_ghunnah: {
    key: 'idgham_wo_ghunnah',
    label: 'إدغام بغير غنة',
    shortDescription:
      'إدغام للنون الساكنة أو التنوين بغير غنة في موضعه.'
  },

  idgham_ghunnah: {
    key: 'idgham_ghunnah',
    label: 'إدغام بغنة',
    shortDescription:
      'إدغام مصحوب بالغنة في موضعه.'
  },

  idgham_shafawi: {
    key: 'idgham_shafawi',
    label: 'إدغام شفوي',
    shortDescription:
      'إدغام متعلق بالميم الساكنة عند موضعه.'
  },

  idgham_mutajanisayn: {
    key: 'idgham_mutajanisayn',
    label: 'إدغام متجانسين',
    shortDescription:
      'إدغام بين حرفين اتفقا في المخرج واختلفا في بعض الصفات.'
  },

  idgham_mutaqaribayn: {
    key: 'idgham_mutaqaribayn',
    label: 'إدغام متقاربين',
    shortDescription:
      'إدغام بين حرفين متقاربين في المخرج أو الصفات.'
  },

  ikhafa: {
    key: 'ikhafa',
    label: 'إخفاء',
    shortDescription:
      'نطق بين الإظهار والإدغام مع بقاء الغنة في موضع الإخفاء.'
  },

  ikhafa_shafawi: {
    key: 'ikhafa_shafawi',
    label: 'إخفاء شفوي',
    shortDescription:
      'حكم متعلق بالميم الساكنة في موضع الإخفاء الشفوي.'
  },

  iqlab: {
    key: 'iqlab',
    label: 'إقلاب',
    shortDescription:
      'قلب النون الساكنة أو التنوين ميمًا مخفاة في موضع الإقلاب.'
  },

  ghunnah: {
    key: 'ghunnah',
    label: 'غنة',
    shortDescription:
      'صوت يخرج من الخيشوم ويظهر في مواضع التجويد المعلَّمة.'
  },

  qalaqah: {
    key: 'qalaqah',
    label: 'قلقلة',
    shortDescription:
      'اضطراب صوت الحرف الساكن من حروف القلقلة عند النطق به.'
  },

  slnt: {
    key: 'slnt',
    label: 'حرف غير منطوق وفق ترميز المصحف',
    shortDescription:
      'علامة في بيانات المصدر لحرف موجود في الرسم ولا يُنطق في هذا الموضع وفق القراءة الممثلة.'
  }

};


/* =========================================================
   LOAD LOCAL DATASET
   ========================================================= */


const tajweedPath =
  fileURLToPath(
    new URL(
      '../data/quran_tajweed_mihak.json.gz',
      import.meta.url
    )
  );


function loadTajweedDataset():
  TajweedDataset {

  const compressed =
    fs.readFileSync(
      tajweedPath
    );


  const jsonText =
    gunzipSync(
      compressed
    ).toString(
      'utf8'
    );


  return JSON.parse(
    jsonText
  ) as TajweedDataset;
}


const TAJWEED_DATA =
  loadTajweedDataset();


/* =========================================================
   HELPERS
   ========================================================= */


function verseKey(
  surahNumber: number,
  ayahNumber: number
): string {

  return `${surahNumber}:${ayahNumber}`;
}


function stripRuleTags(
  text: string
): string {

  return text
    .replace(
      /<\/?rule\b[^>]*>/gi,
      ''
    )
    .trim();
}


function getRuleInfo(
  ruleKey: string
): TajweedRuleInfo {

  return (
    TAJWEED_RULES[
      ruleKey
    ] || {
      key: ruleKey,

      label:
        ruleKey,

      shortDescription:
        'قاعدة تجويد معلّمة في المصدر.'
    }
  );
}


/* =========================================================
   PARSE <rule class=...>...</rule>
   ========================================================= */


function parseRulesFromWord(
  word: TajweedWordRecord
): TajweedOccurrence[] {

  const results:
    TajweedOccurrence[] = [];


  /*
   * Handles:
   *
   * <rule class=ikhafa>...</rule>
   * <rule class="ikhafa">...</rule>
   * <rule class='ikhafa'>...</rule>
   */
  const pattern =
    /<rule\s+class=(?:"([^"]+)"|'([^']+)'|([^\s>]+))>(.*?)<\/rule>/gi;


  let match:
    RegExpExecArray | null;


  while (
    (
      match =
        pattern.exec(
          word.text
        )
    ) !== null
  ) {

    const ruleKey =
      (
        match[1] ||
        match[2] ||
        match[3] ||
        ''
      ).trim();


    const markedText =
      stripRuleTags(
        match[4] || ''
      );


    const info =
      getRuleInfo(
        ruleKey
      );


    results.push({

      ruleKey,

      ruleLabel:
        info.label,

      description:
        info.shortDescription,

      markedText,

      wordNumber:
        word.word,

      wordText:
        stripRuleTags(
          word.text
        ),

      location:
        word.location

    });

  }


  return results;
}


/* =========================================================
   GET TAJWEED FOR ONE AYAH
   ========================================================= */


export function getTajweedForAyah(
  surahNumber: number,
  ayahNumber: number
): TajweedAyahResult | null {

  const key =
    verseKey(
      surahNumber,
      ayahNumber
    );


  const records =
    TAJWEED_DATA
      .verses[
        key
      ];


  if (
    !records ||
    records.length === 0
  ) {

    return null;
  }


  const words:
    TajweedWordResult[] =
    records.map(
      (record) => {

        const rules =
          parseRulesFromWord(
            record
          );


        return {

          wordNumber:
            record.word,

          location:
            record.location,

          plainText:
            stripRuleTags(
              record.text
            ),

          annotatedText:
            record.text,

          rules

        };

      }
    );


  const rules =
    words.flatMap(
      (word) =>
        word.rules
    );


  const uniqueRuleMap =
    new Map<
      string,
      TajweedRuleInfo
    >();


  for (
    const occurrence of
      rules
  ) {

    if (
      !uniqueRuleMap.has(
        occurrence.ruleKey
      )
    ) {

      uniqueRuleMap.set(
        occurrence.ruleKey,
        getRuleInfo(
          occurrence.ruleKey
        )
      );

    }

  }


  return {

    surahNumber,

    ayahNumber,

    words,

    rules,

    uniqueRules:
      Array.from(
        uniqueRuleMap.values()
      )

  };
}


/* =========================================================
   GET A SPECIFIC RULE INSIDE AN AYAH
   ========================================================= */


export function findTajweedRuleInAyah(
  surahNumber: number,
  ayahNumber: number,
  ruleName: string
): TajweedOccurrence[] {

  const result =
    getTajweedForAyah(
      surahNumber,
      ayahNumber
    );


  if (!result) {
    return [];
  }


  const normalized =
    ruleName
      .trim()
      .toLowerCase();


  return result.rules.filter(
    (rule) => {

      const info =
        getRuleInfo(
          rule.ruleKey
        );


      return (
        rule.ruleKey
          .toLowerCase()
          .includes(
            normalized
          ) ||

        info.label
          .includes(
            ruleName
          )
      );

    }
  );
}


/* =========================================================
   GET ALL AVAILABLE RULE TYPES
   ========================================================= */


export function getAvailableTajweedRules():
  TajweedRuleInfo[] {

  return Object.values(
    TAJWEED_RULES
  );
}


/* =========================================================
   DATA HEALTH CHECK
   ========================================================= */


export function getTajweedStatus() {

  const verseCount =
    Object.keys(
      TAJWEED_DATA.verses
    ).length;


  let wordCount = 0;

  let annotatedWordCount = 0;

  const detectedRuleTypes =
    new Set<string>();


  for (
    const words of
      Object.values(
        TAJWEED_DATA.verses
      )
  ) {

    wordCount +=
      words.length;


    for (
      const word of
        words
    ) {

      const rules =
        parseRulesFromWord(
          word
        );


      if (
        rules.length > 0
      ) {

        annotatedWordCount++;

      }


      for (
        const rule of
          rules
      ) {

        detectedRuleTypes.add(
          rule.ruleKey
        );

      }

    }

  }


  return {

    verses:
      verseCount,

    words:
      wordCount,

    annotatedWords:
      annotatedWordCount,

    detectedRuleTypes:
      Array.from(
        detectedRuleTypes
      ).sort(),

    source:
      'QPC Hafs Tajweed local dataset',

    note:
      'MIHAK reports the Tajweed annotations present in the connected dataset and does not invent missing rules.'

  };
}