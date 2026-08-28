import { AGE_CATEGORIES, GRADE_SCORES } from "@/data/referenceCatalog";
import type { AgeCategory, EvaluationResult, FinalEvaluation, Gender, Grade, Player, Standard, TestDefinition, TestResult } from "@/domain/types";

export function getAge(birthYear: number, currentYear = new Date().getFullYear()): number {
  return currentYear - Number(birthYear);
}

export function getAgeCategory(age: number, gender: Gender): AgeCategory {
  if (age < 9) return "تحت 9";
  if (age < 11) return "تحت 11";
  if (age < 13) return "تحت 13";
  if (age < 15) return "تحت 15";
  if (age < 17) return "تحت 17";
  return gender === "ذكر" ? "رجال" : "آنسات";
}

export function evaluateValue(player: Player, testId: number, value: number, standards: Standard[]): EvaluationResult {
  const age = getAge(player.birthYear);
  const ageCategory = getAgeCategory(age, player.gender);
  const standard = standards.find((item) => item.isActive && item.testId === testId && item.gender === player.gender && item.ageCategory === ageCategory && value >= item.min && value <= item.max) ?? null;
  if (!standard) {
    return { score: null, rating: null, age, ageCategory, standard: null, reason: "لا يوجد معيار فعّال ومطابق لهذه النتيجة. يتطلب ضبطًا من الإدارة." };
  }
  return { score: standard.score, rating: standard.grade, age, ageCategory, standard };
}

export function computeAchievement(results: TestResult[], tests: TestDefinition[]): number {
  const activeTests = tests.filter((test) => test.active);
  const totalWeight = activeTests.reduce((sum, test) => sum + test.weight, 0) || 1;
  const latestByTest = new Map<number, TestResult>();
  [...results].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0)).forEach((result) => latestByTest.set(result.testId, result));
  const weighted = activeTests.reduce((sum, test) => sum + ((latestByTest.get(test.id)?.score ?? 0) / 5) * test.weight, 0);
  return Math.round((weighted / totalWeight) * 1000) / 10;
}

export function getFinalGrade(achievement: number): Grade {
  if (achievement >= 90) return "ممتاز";
  if (achievement >= 80) return "جيد جدًا";
  if (achievement >= 70) return "جيد";
  if (achievement >= 60) return "مقبول";
  return "ضعيف";
}

export function finalEvaluation(results: TestResult[], tests: TestDefinition[]): FinalEvaluation {
  const achievement = computeAchievement(results, tests);
  return { achievement, finalGrade: getFinalGrade(achievement) };
}

export function expectedExecutionTime(test: TestDefinition, player: Player, standards: Standard[] = []): number | null {
  const category = getAgeCategory(getAge(player.birthYear), player.gender);
  const configured = standards.find((standard) => standard.isActive && standard.testId === test.id && standard.gender === player.gender && standard.ageCategory === category);
  return configured?.executionTime ?? test.protocol.timeByAgeCategory?.[category] ?? test.protocol.executionTime;
}

export function gradeLabel(score: number): Grade | null {
  return (Object.entries(GRADE_SCORES).find(([, value]) => value === score)?.[0] as Grade | undefined) ?? null;
}

export { AGE_CATEGORIES };
