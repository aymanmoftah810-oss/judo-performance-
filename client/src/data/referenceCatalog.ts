import type { AgeCategory, ExecutionProtocol, TestDefinition } from "@/domain/types";

export const AGE_CATEGORIES: AgeCategory[] = ["تحت 9", "تحت 11", "تحت 13", "تحت 15", "تحت 17", "رجال", "آنسات"];

const pushUpTimes: Record<AgeCategory, number> = {
  "تحت 9": 30, "تحت 11": 30, "تحت 13": 45, "تحت 15": 45,
  "تحت 17": 60, "رجال": 60, "آنسات": 60,
};

const documented = (executionType: ExecutionProtocol["executionType"], executionUnit: string, executionTime: number | null, attempts: number, note: string, timeByAgeCategory?: Partial<Record<AgeCategory, number>>): ExecutionProtocol => ({
  executionType, executionUnit, executionTime, attempts, note, timeByAgeCategory, sourceStatus: "documented",
});

export const REFERENCE_TESTS: TestDefinition[] = [
  { id: 1, key: "PUSH_UP", name: "Push-ups", nameAr: "الضغط", unit: "عدد تكرارات", measurementType: "repetitions", higherIsBetter: true, active: true, description: "تحمل قوة الجزء العلوي", weight: 0.10, protocol: documented("repetitions", "ثانية", null, 1, "التزم بزمن الفئة العمرية عند عد التكرارات الصحيحة.", pushUpTimes) },
  { id: 2, key: "SIT_UP", name: "Sit-ups", nameAr: "البطن", unit: "عدد تكرارات", measurementType: "repetitions", higherIsBetter: true, active: true, description: "تحمل عضلات البطن", weight: 0.08, protocol: documented("repetitions", "ثانية", 30, 1, "يسجل عدد التكرارات الصحيحة خلال 30 ثانية.") },
  { id: 3, key: "PLANK", name: "Plank", nameAr: "البلانك", unit: "ثانية", measurementType: "timed", higherIsBetter: true, active: true, description: "ثبات وتحمل عضلات الجذع", weight: 0.10, protocol: documented("timed", "ثانية", null, 1, "لا توجد مدة حدّية؛ يسجل زمن الثبات الصحيح بالثواني.") },
  { id: 4, key: "SQUAT", name: "Squats", nameAr: "الاسكوات", unit: "عدد تكرارات", measurementType: "repetitions", higherIsBetter: true, active: true, description: "تحمل قوة الطرفين السفليين", weight: 0.10, protocol: documented("repetitions", "ثانية", 60, 1, "يسجل عدد التكرارات الصحيحة خلال 60 ثانية.") },
  { id: 5, key: "STANDING_JUMP", name: "Standing Jump", nameAr: "الوثب من الثبات", unit: "سم", measurementType: "distance", higherIsBetter: true, active: true, description: "القدرة العضلية الانفجارية للرجلين", weight: 0.12, protocol: documented("distance", "سم", null, 3, "ثلاث محاولات؛ يسجل أفضل إنجاز.") },
  { id: 6, key: "BURPEES", name: "Burpees", nameAr: "الرشاقة", unit: "عدد تكرارات", measurementType: "repetitions", higherIsBetter: true, active: true, description: "الرشاقة الوظيفية وتحمل القوة", weight: 0.12, protocol: documented("repetitions", "ثانية", 30, 1, "يسجل عدد تكرارات البيربي الصحيحة خلال 30 ثانية.") },
  { id: 7, key: "SHUTTLE_RUN", name: "Shuttle Run 10m", nameAr: "الجري الارتدادي", unit: "ثانية", measurementType: "timed", higherIsBetter: false, active: true, description: "سرعة وتغيير الاتجاه", weight: 0.13, protocol: documented("timed", "ثانية", null, 2, "مسافة 10×4 متر؛ محاولتان ويسجل أفضل زمن لأقرب 0.01 ثانية.") },
  { id: 8, key: "SPRINT", name: "Sprint", nameAr: "جري السرعة 100 متر", unit: "ثانية", measurementType: "timed", higherIsBetter: false, active: true, description: "السرعة الانتقالية", weight: 0.08, protocol: documented("timed", "ثانية", null, 2, "محاولتان ويسجل أفضل زمن لأقرب 0.01 ثانية.") },
  { id: 9, key: "ENDURANCE_600", name: "Endurance Run", nameAr: "جري التحمل 600 متر", unit: "ثانية", measurementType: "timed", higherIsBetter: false, active: true, description: "التحمل الدوري التنفسي", weight: 0.10, protocol: documented("timed", "ثانية", null, 1, "محاولة واحدة؛ يحفظ الزمن بالثواني.") },
  { id: 10, key: "FLEXIBILITY", name: "Flexibility", nameAr: "المرونة", unit: "سم", measurementType: "measurement", higherIsBetter: true, active: true, description: "مرونة الجذع وأوتار المأبض وأسفل الظهر", weight: 0.07, protocol: documented("measurement", "سم", null, 3, "ثلاث محاولات؛ يسجل أفضل إنجاز بالسنتيمتر.") },
];

export const GRADE_SCORES = { "ضعيف": 1, "مقبول": 2, "جيد": 3, "جيد جدًا": 4, "ممتاز": 5 } as const;
