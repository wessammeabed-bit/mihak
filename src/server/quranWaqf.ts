/* =========================================================
   MIHAK — QURAN WAQF & SAKT LAYER

   Pause marks:
   Based on the pause marks present in Tanzil Uthmani text.

   Sakt:
   Kept separate from general waqf because it depends
   on the riwayah / tariq.

   This layer does NOT invent recitation rulings.
   ========================================================= */


export type WaqfMarkInfo = {
  symbol: string;
  arabicName: string;
  label: string;
  description: string;
  recommendation:
    | 'stop'
    | 'do_not_stop'
    | 'either'
    | 'stop_preferred'
    | 'continue_preferred'
    | 'paired';
};


export type WaqfOccurrence = {
  symbol: string;
  index: number;
  before: string;
  after: string;
  info: WaqfMarkInfo;
};


export type SaktPosition = {
  id: string;

  surahNumber: number;
  ayahNumber: number;

  nextSurahNumber?: number;
  nextAyahNumber?: number;

  beforeText: string;
  afterText: string;

  riwayah: string;
  tariq?: string;

  category:
    | 'four_famous_sakts'
    | 'optional_face';

  rulingLabel: string;

  description: string;

  note?: string;
};


/* =========================================================
   TANZIL / MADINAH MUSHAF PAUSE MARKS
   ========================================================= */


export const WAQF_MARKS:
  Record<string, WaqfMarkInfo> = {

  'ۘ': {
    symbol: 'ۘ',
    arabicName: 'الوقف اللازم',
    label: 'وقف لازم',
    description:
      'علامة تدل على أن الوقف أولى لتجنب إيهام معنى غير المراد عند الوصل.',
    recommendation:
      'stop'
  },

  'ۙ': {
    symbol: 'ۙ',
    arabicName: 'لا',
    label: 'لا تقف',
    description:
      'علامة تدل على أن الوقف في هذا الموضع غير مناسب، والأصل متابعة القراءة.',
    recommendation:
      'do_not_stop'
  },

  'ۚ': {
    symbol: 'ۚ',
    arabicName: 'الوقف الجائز',
    label: 'يجوز الوقف أو الوصل',
    description:
      'يجوز للقارئ الوقف أو مواصلة القراءة.',
    recommendation:
      'either'
  },

  'ۗ': {
    symbol: 'ۗ',
    arabicName: 'قلى',
    label: 'الوقف أولى',
    description:
      'يجوز الوقف والوصل، لكن الوقف أولى في هذا الموضع.',
    recommendation:
      'stop_preferred'
  },

  'ۖ': {
    symbol: 'ۖ',
    arabicName: 'صلى',
    label: 'الوصل أولى',
    description:
      'يجوز الوقف والوصل، لكن مواصلة القراءة أولى.',
    recommendation:
      'continue_preferred'
  },

  'ۛ': {
    symbol: 'ۛ',
    arabicName: 'تعانق الوقف',
    label: 'وقف التعانق',
    description:
      'تأتي علامتان متقاربتان؛ يجوز الوقف على إحداهما، ولا يُوقف على الاثنتين معًا.',
    recommendation:
      'paired'
  }

};


/* =========================================================
   FIND PAUSE MARKS INSIDE VERSE TEXT
   ========================================================= */


export function getWaqfMarksFromText(
  verseText: string
): WaqfOccurrence[] {

  const results:
    WaqfOccurrence[] = [];


  if (!verseText) {
    return results;
  }


  const symbols =
    Object.keys(
      WAQF_MARKS
    );


  for (
    let i = 0;
    i < verseText.length;
    i++
  ) {

    const char =
      verseText[i];


    if (
      !symbols.includes(
        char
      )
    ) {
      continue;
    }


    const info =
      WAQF_MARKS[
        char
      ];


    const before =
      verseText
        .slice(
          Math.max(
            0,
            i - 25
          ),
          i
        )
        .trim();


    const after =
      verseText
        .slice(
          i + 1,
          i + 26
        )
        .trim();


    results.push({

      symbol:
        char,

      index:
        i,

      before,

      after,

      info

    });

  }


  return results;
}


/* =========================================================
   HAFS SAKT POSITIONS

   Important:
   The four famous positions below are associated with
   Hafs from 'Asim through the Shatibiyyah route.

   Other transmission routes can have different allowed
   faces, so MIHAK must always show the riwayah/tariq.
   ========================================================= */


export const HAFS_SAKT_POSITIONS:
  SaktPosition[] = [

  {
    id:
      'hafs-sakt-kahf',

    surahNumber:
      18,

    ayahNumber:
      1,

    nextSurahNumber:
      18,

    nextAyahNumber:
      2,

    beforeText:
      'عِوَجَا',

    afterText:
      'قَيِّمًا',

    riwayah:
      'حفص عن عاصم',

    tariq:
      'طريق الشاطبية',

    category:
      'four_famous_sakts',

    rulingLabel:
      'سكتة لطيفة من غير تنفس',

    description:
      'السكت على ألف عوجا قبل البدء بقوله قيما.',

    note:
      'هذه السكتة مرتبطة بطريق الرواية، وليست حكمًا عامًا لكل القراءات.'
  },


  {
    id:
      'hafs-sakt-yasin',

    surahNumber:
      36,

    ayahNumber:
      52,

    beforeText:
      'مَرْقَدِنَا',

    afterText:
      'هَٰذَا',

    riwayah:
      'حفص عن عاصم',

    tariq:
      'طريق الشاطبية',

    category:
      'four_famous_sakts',

    rulingLabel:
      'سكتة لطيفة من غير تنفس',

    description:
      'السكت على مرقدنا قبل هذا.',

    note:
      'يجب إظهار اسم الرواية والطريق للمستخدم.'
  },


  {
    id:
      'hafs-sakt-qiyamah',

    surahNumber:
      75,

    ayahNumber:
      27,

    beforeText:
      'مَنْ',

    afterText:
      'رَاقٍ',

    riwayah:
      'حفص عن عاصم',

    tariq:
      'طريق الشاطبية',

    category:
      'four_famous_sakts',

    rulingLabel:
      'سكتة لطيفة من غير تنفس',

    description:
      'السكت على النون في من قبل راق.',

    note:
      'لا تُعرض باعتبارها حكمًا عامًا لكل الروايات.'
  },


  {
    id:
      'hafs-sakt-mutaffifin',

    surahNumber:
      83,

    ayahNumber:
      14,

    beforeText:
      'بَلْ',

    afterText:
      'رَانَ',

    riwayah:
      'حفص عن عاصم',

    tariq:
      'طريق الشاطبية',

    category:
      'four_famous_sakts',

    rulingLabel:
      'سكتة لطيفة من غير تنفس',

    description:
      'السكت على لام بل قبل ران.',

    note:
      'موضع خاص بالرواية والطريق المذكورين.'
  },


  /*
   * Additional allowed face in Hafs.
   * Kept separate from the famous four.
   */
  {
    id:
      'hafs-sakt-haqqah',

    surahNumber:
      69,

    ayahNumber:
      28,

    nextSurahNumber:
      69,

    nextAyahNumber:
      29,

    beforeText:
      'مَالِيَهْ',

    afterText:
      'هَلَكَ',

    riwayah:
      'حفص عن عاصم',

    category:
      'optional_face',

    rulingLabel:
      'وجه من أوجه الأداء',

    description:
      'عند وصل ماليه بهلك ورد وجه السكت، وورد وجه آخر في الأداء.',

    note:
      'لا يقدَّم للمستخدم على أنه إلزام عام.'
  },


  {
    id:
      'hafs-sakt-anfal-tawbah',

    surahNumber:
      8,

    ayahNumber:
      75,

    nextSurahNumber:
      9,

    nextAyahNumber:
      1,

    beforeText:
      'عَلِيمٌ',

    afterText:
      'بَرَاءَةٌ',

    riwayah:
      'حفص عن عاصم',

    category:
      'optional_face',

    rulingLabel:
      'وجه جائز بين السورتين',

    description:
      'السكت من غير تنفس أحد الأوجه المروية عند الانتقال من آخر الأنفال إلى أول التوبة من غير بسملة.',

    note:
      'هذا ليس من السكتات الأربع المشهورة، بل وجه من أوجه الأداء بين السورتين.'
  }

];


/* =========================================================
   GET SAKT FOR A SPECIFIC VERSE
   ========================================================= */


export function getSaktPositionsForAyah(
  surahNumber: number,
  ayahNumber: number
): SaktPosition[] {

  return HAFS_SAKT_POSITIONS.filter(
    (item) =>
      item.surahNumber ===
        surahNumber &&
      item.ayahNumber ===
        ayahNumber
  );
}


/* =========================================================
   GET THE FOUR FAMOUS HAFS SAKTS
   ========================================================= */


export function getFourFamousHafsSakts():
  SaktPosition[] {

  return HAFS_SAKT_POSITIONS.filter(
    (item) =>
      item.category ===
      'four_famous_sakts'
  );
}


/* =========================================================
   GET ALL STORED SAKT POSITIONS
   ========================================================= */


export function getAllHafsSakts():
  SaktPosition[] {

  return [
    ...HAFS_SAKT_POSITIONS
  ];
}


/* =========================================================
   EXPLAIN ONE PAUSE SYMBOL
   ========================================================= */


export function explainWaqfSymbol(
  symbol: string
):
  WaqfMarkInfo | null {

  return (
    WAQF_MARKS[
      symbol
    ] || null
  );
}


/* =========================================================
   STATUS
   ========================================================= */


export function getWaqfStatus() {

  return {

    pauseMarkTypes:
      Object.keys(
        WAQF_MARKS
      ).length,

    famousHafsSakts:
      getFourFamousHafsSakts()
        .length,

    storedHafsSaktPositions:
      HAFS_SAKT_POSITIONS
        .length,

    pauseMarkSource:
      'Tanzil / Medina Mushaf pause marks',

    saktScope:
      'Hafs from Asim; route must be shown when relevant',

    safetyNote:
      'MIHAK does not convert variant recitation faces into a universal mandatory ruling.'

  };
}