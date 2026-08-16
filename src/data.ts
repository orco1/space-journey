// All scale values come from the PRD (§4.2) and travel durations from §5.3.
// Do not "improve" them — they are tuned for legibility, not realism.

export type Temp = 'hot' | 'cold' | 'home';

export interface BodyDef {
  id: string;
  nameHe: string;
  orbitRadius: number;
  radius: number;
  /** Transit duration in seconds, from a standing start (PRD §5.3). */
  transitSec: number;
  /** Spoken line on arrival (PRD §8.2, logical character order). */
  narration: string;
  /** Longer, playful "tell me more" narration — the fun-facts button. */
  funFact: string;
  /** Base colour, used for strip icons and texture fallback. */
  color: string;
  /** Secondary colour for gradients / bands in fallback art. */
  color2: string;
  temp: Temp;
  /** Diameter relative to Earth, for the size-comparison icon. */
  sizeVsEarth: number;
  texture: string;
  axialTiltDeg: number;
  /** Visual spin period (seconds per revolution) — not realistic. */
  spinPeriodSec: number;
  /** Visual orbit period (seconds) — inner faster, gently drifting. */
  orbitPeriodSec: number;
  hasSaturnRings?: boolean;
  hasFaintRing?: boolean;
}

export const SUN = {
  id: 'sun',
  nameHe: 'השמש',
  radius: 3.5,
  narration: 'השמש! כוכב ענק של אש, וכולם מסתובבים סביבו!',
  funFact:
    'השמש כל כך גדולה, שאפשר להכניס לתוכה יותר ממיליון כדורי ארץ! היא נותנת לנו אור וחום כדי שנוכל לחיות. אבל אף פעם אסור להסתכל עליה ישר.',
  color: '#ffd94a',
  color2: '#ff9d00',
  texture: '2k_sun.jpg',
};

export const PLANETS: BodyDef[] = [
  {
    id: 'mercury',
    nameHe: 'חמה',
    orbitRadius: 6.0,
    radius: 0.6,
    transitSec: 2.5,
    narration: 'חמה! הכוכב הכי קרוב לשמש, ושם ממש ממש חם!',
    funFact:
      'חמה הוא הכוכב הכי קטן, וגם הכי מהיר — הוא רץ סביב השמש מהר מכולם! ביום שם רותח מאוד, ובלילה קפוא. ואין שם בכלל אוויר לנשום.',
    color: '#9c968e',
    color2: '#6f6a63',
    temp: 'hot',
    sizeVsEarth: 0.38,
    texture: '2k_mercury.jpg',
    axialTiltDeg: 0,
    spinPeriodSec: 40,
    orbitPeriodSec: 150,
  },
  {
    id: 'venus',
    nameHe: 'נוגה',
    orbitRadius: 8.0,
    radius: 0.88,
    transitSec: 3.0,
    narration: 'נוגה! הכוכב הכי חם, ומכוסה כולו בעננים!',
    funFact:
      'נוגה הוא הכוכב הכי חם מכולם, אפילו יותר מחמה, כי העננים העבים שומרים אצלו על כל החום. ושם קורה משהו מצחיק — השמש זורחת מהצד ההפוך מאיתנו!',
    color: '#e8d8a8',
    color2: '#cdae70',
    temp: 'hot',
    sizeVsEarth: 0.95,
    texture: '2k_venus_atmosphere.jpg',
    axialTiltDeg: 2,
    spinPeriodSec: 55,
    orbitPeriodSec: 195,
  },
  {
    id: 'earth',
    nameHe: 'כדור הארץ',
    orbitRadius: 10.5,
    radius: 0.9,
    transitSec: 3.5,
    narration: 'כדור הארץ! פה אנחנו גרים!',
    funFact:
      'כדור הארץ הוא הבית שלנו, והכוכב היחיד שאנחנו מכירים עם מים, עצים, חיות ואנשים. רוב רובו מכוסה באוקיינוסים כחולים וגדולים. בוא נשמור עליו יפה!',
    color: '#4d8fd1',
    color2: '#3faf5e',
    temp: 'home',
    sizeVsEarth: 1,
    texture: '2k_earth_daymap.jpg',
    axialTiltDeg: 23,
    spinPeriodSec: 30,
    orbitPeriodSec: 250,
  },
  {
    id: 'mars',
    nameHe: 'מאדים',
    orbitRadius: 13.0,
    radius: 0.7,
    transitSec: 4.0,
    narration: 'מאדים! הכוכב האדום. יש עליו הר ענק!',
    funFact:
      'מאדים נקרא הכוכב האדום כי הוא מכוסה באבק אדום כמו חלודה. יש עליו את ההר הכי גבוה בכל החלל — פי שלושה מההר הכי גבוה אצלנו! ורובוטים קטנים מכדור הארץ מטיילים עליו ממש עכשיו.',
    color: '#c1440e',
    color2: '#8f3009',
    temp: 'cold',
    sizeVsEarth: 0.53,
    texture: '2k_mars.jpg',
    axialTiltDeg: 25,
    spinPeriodSec: 32,
    orbitPeriodSec: 330,
  },
  {
    id: 'jupiter',
    nameHe: 'צדק',
    orbitRadius: 19.0,
    radius: 2.4,
    transitSec: 5.5,
    narration: 'צדק! הכוכב הכי גדול. יש עליו סופה ענקית!',
    funFact:
      'צדק הוא הכוכב הכי ענק — כל שאר הכוכבים יכולים להיכנס בתוכו יחד! יש עליו סופה אדומה ענקית שנמשכת כבר מאות שנים, והיא גדולה יותר מכל כדור הארץ. ויש לו המון ירחים.',
    color: '#d8a566',
    color2: '#a8703f',
    temp: 'cold',
    sizeVsEarth: 11.2,
    texture: '2k_jupiter.jpg',
    axialTiltDeg: 3,
    spinPeriodSec: 22,
    orbitPeriodSec: 480,
  },
  {
    id: 'saturn',
    nameHe: 'שבתאי',
    orbitRadius: 25.0,
    radius: 2.2,
    transitSec: 6.5,
    narration: 'שבתאי! יש לו טבעות יפהפיות מקרח!',
    funFact:
      'הטבעות של שבתאי עשויות ממיליוני חתיכות קרח ואבן שמסתובבות סביבו. והוא כל כך קל, שאם היתה אמבטיה ענקית ענקית — שבתאי היה צף על המים!',
    color: '#e3cf9e',
    color2: '#c2a878',
    temp: 'cold',
    sizeVsEarth: 9.4,
    texture: '2k_saturn.jpg',
    axialTiltDeg: 22,
    spinPeriodSec: 24,
    orbitPeriodSec: 640,
    hasSaturnRings: true,
  },
  {
    id: 'uranus',
    nameHe: 'אורנוס',
    orbitRadius: 31.0,
    radius: 1.55,
    transitSec: 7.5,
    narration: 'אורנוס! הוא מסתובב שוכב על הצד!',
    funFact:
      'אורנוס מסתובב שוכב לגמרי על הצד, כאילו נפל לישון! הוא בצבע תכלת יפה וקר לו נורא. ושם עונה אחת נמשכת עשרים ואחת שנים — דמיין חורף כזה ארוך!',
    color: '#9be3e3',
    color2: '#6fc3cf',
    temp: 'cold',
    sizeVsEarth: 4.0,
    texture: '2k_uranus.jpg',
    axialTiltDeg: 82,
    spinPeriodSec: 26,
    orbitPeriodSec: 820,
    hasFaintRing: true,
  },
  {
    id: 'neptune',
    nameHe: 'נפטון',
    orbitRadius: 37.0,
    radius: 1.55,
    transitSec: 9.0,
    narration: 'נפטון! הכי רחוק מהשמש, וכחול וקפוא!',
    funFact:
      'נפטון הוא הכוכב הכי רחוק מהשמש, כחול וקפוא. ונושבות בו הרוחות הכי חזקות בכל החלל — מהר יותר ממטוס סילון! הוא כל כך רחוק, שכמעט אי אפשר לראות אותו בלי טלסקופ.',
    color: '#3b5bd6',
    color2: '#2a3fa0',
    temp: 'cold',
    sizeVsEarth: 3.9,
    texture: '2k_neptune.jpg',
    axialTiltDeg: 28,
    spinPeriodSec: 28,
    orbitPeriodSec: 1000,
  },
];

export const planetById = new Map(PLANETS.map((p) => [p.id, p]));

// Interface lines (PRD §8.3).
export const LINES = {
  countdown: 'שלוש... שתיים... אחת... שיגור!',
  depart: 'יוצאים לדרך!',
  arrive: 'הגענו!',
  almost: 'עוד רגע מגיעים...',
  lineup: 'כולם בשורה!',
};

/**
 * Audio clip keys → { file base path under /audio (no extension), spoken-text fallback }.
 * The loader tries .mp3 then .m4a, so recordings straight off a phone work.
 */
export const CLIPS: Record<string, { url: string; text: string }> = {
  countdown: { url: 'audio/ui/countdown', text: LINES.countdown },
  depart: { url: 'audio/ui/depart', text: LINES.depart },
  arrive: { url: 'audio/ui/arrive', text: LINES.arrive },
  almost: { url: 'audio/ui/almost', text: LINES.almost },
  sun: { url: 'audio/narration/sun', text: SUN.narration },
  ...Object.fromEntries(
    PLANETS.map((p) => [p.id, { url: `audio/narration/${p.id}`, text: p.narration }]),
  ),
  // Fun-facts ("tell me more") clips — keyed fact_<id>, files under audio/facts.
  fact_sun: { url: 'audio/facts/sun', text: SUN.funFact },
  ...Object.fromEntries(
    PLANETS.map((p) => [`fact_${p.id}`, { url: `audio/facts/${p.id}`, text: p.funFact }]),
  ),
};
