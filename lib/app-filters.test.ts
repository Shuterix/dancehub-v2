import { describe, it, expect } from "vitest"

/**
 * Mocked tests for app filter logic used across:
 * - Timetable detail (lessons by label, trainer, type)
 * - Couples (name search)
 * - Students (name, age, category/rank)
 * - Trainers (name, age, category, external only)
 * - Groups (name search)
 * Logic mirrors the useMemo filters in the app pages.
 */

// ---- Timetable lessons ----
type LessonItem = {
	id: string
	label: string
	trainer_id: string | null
	trainer_name: string | null
	lesson_type: string
}

function filterTimetableLessons(
	lessons: LessonItem[],
	filterLabels: Set<string>,
	filterTrainerIds: Set<string>,
	filterTypes: Set<string>
): LessonItem[] {
	return lessons.filter((l) => {
		if (filterLabels.size > 0 && !filterLabels.has(l.label)) return false
		if (filterTrainerIds.size > 0) {
			if (!l.trainer_id || !filterTrainerIds.has(l.trainer_id)) return false
		}
		if (filterTypes.size > 0 && !filterTypes.has(l.lesson_type)) return false
		return true
	})
}

describe("Timetable detail: filter lessons", () => {
	const lessons: LessonItem[] = [
		{ id: "1", label: "Beginners", trainer_id: "t1", trainer_name: "Alice", lesson_type: "standard" },
		{ id: "2", label: "Advanced", trainer_id: "t1", trainer_name: "Alice", lesson_type: "latin" },
		{ id: "3", label: "Beginners", trainer_id: "t2", trainer_name: "Bob", lesson_type: "standard" },
		{ id: "4", label: "Kids", trainer_id: "t2", trainer_name: "Bob", lesson_type: "standard" },
	]

	it("returns all lessons when no filters", () => {
		expect(filterTimetableLessons(lessons, new Set(), new Set(), new Set())).toHaveLength(4)
	})

	it("filters by label", () => {
		const out = filterTimetableLessons(lessons, new Set(["Beginners"]), new Set(), new Set())
		expect(out).toHaveLength(2)
		expect(out.every((l) => l.label === "Beginners")).toBe(true)
	})

	it("filters by trainer id", () => {
		const out = filterTimetableLessons(lessons, new Set(), new Set(["t1"]), new Set())
		expect(out).toHaveLength(2)
		expect(out.every((l) => l.trainer_id === "t1")).toBe(true)
	})

	it("filters by lesson type", () => {
		const out = filterTimetableLessons(lessons, new Set(), new Set(), new Set(["standard"]))
		expect(out).toHaveLength(3)
		expect(out.every((l) => l.lesson_type === "standard")).toBe(true)
	})

	it("excludes lesson with no trainer when filtering by trainer", () => {
		const withNull = [...lessons, { id: "5", label: "X", trainer_id: null, trainer_name: null, lesson_type: "standard" }]
		const out = filterTimetableLessons(withNull, new Set(), new Set(["t1"]), new Set())
		expect(out).toHaveLength(2)
	})

	it("combines label + trainer + type", () => {
		const out = filterTimetableLessons(
			lessons,
			new Set(["Beginners"]),
			new Set(["t1"]),
			new Set(["standard"])
		)
		expect(out).toHaveLength(1)
		expect(out[0].id).toBe("1")
	})
})

// ---- Couples ----
type Couple = {
	id: string
	name: string | null
	partner1_name: string | null
	partner2_name: string | null
}

function filterCouples(couples: Couple[], searchQuery: string): Couple[] {
	const q = searchQuery.trim().toLowerCase()
	if (!q) return couples
	return couples.filter((c) => {
		const name = (c.name ?? [c.partner1_name, c.partner2_name].filter(Boolean).join(" & ")) || ""
		return (
			name.toLowerCase().includes(q) ||
			(c.partner1_name?.toLowerCase().includes(q)) ||
			(c.partner2_name?.toLowerCase().includes(q))
		)
	})
}

describe("Couples: name search", () => {
	const couples: Couple[] = [
		{ id: "1", name: null, partner1_name: "Alice", partner2_name: "Bob" },
		{ id: "2", name: "Team Alpha", partner1_name: "Carol", partner2_name: "Dave" },
	]

	it("returns all when search empty", () => {
		expect(filterCouples(couples, "")).toHaveLength(2)
		expect(filterCouples(couples, "   ")).toHaveLength(2)
	})

	it("filters by partner name", () => {
		expect(filterCouples(couples, "alice")).toHaveLength(1)
		expect(filterCouples(couples, "Bob")).toHaveLength(1)
		expect(filterCouples(couples, "carol")).toHaveLength(1)
	})

	it("filters by couple name", () => {
		expect(filterCouples(couples, "Alpha")).toHaveLength(1)
		expect(filterCouples(couples, "team")).toHaveLength(1)
	})

	it("returns empty when no match", () => {
		expect(filterCouples(couples, "xyz")).toHaveLength(0)
	})
})

// ---- Students ----
type Student = {
	user_id: string
	full_name: string
	rank_standard: string | null
	rank_latin: string | null
	age: number | null
}

function filterStudents(
	list: Student[],
	searchQuery: string,
	ageMin: string,
	ageMax: string,
	filterRankStandard: string,
	filterRankLatin: string
): Student[] {
	const q = searchQuery.trim().toLowerCase()
	const min = ageMin.trim() === "" ? null : parseInt(ageMin, 10)
	const max = ageMax.trim() === "" ? null : parseInt(ageMax, 10)
	const rankStt = filterRankStandard.trim() || null
	const rankLat = filterRankLatin.trim() || null
	return list.filter((s) => {
		if (q && !s.full_name.toLowerCase().includes(q)) return false
		if (min != null && !Number.isNaN(min) && (s.age == null || s.age < min)) return false
		if (max != null && !Number.isNaN(max) && (s.age == null || s.age > max)) return false
		if (rankStt != null && s.rank_standard !== rankStt) return false
		if (rankLat != null && s.rank_latin !== rankLat) return false
		return true
	})
}

describe("Students: name, age, category filters", () => {
	const students: Student[] = [
		{ user_id: "1", full_name: "Anna", rank_standard: "B", rank_latin: "C", age: 25 },
		{ user_id: "2", full_name: "Bruno", rank_standard: "A", rank_latin: "A", age: 30 },
		{ user_id: "3", full_name: "Clara", rank_standard: "B", rank_latin: null, age: 18 },
		{ user_id: "4", full_name: "Derek", rank_standard: null, rank_latin: "S", age: null },
	]

	it("returns all when no filters", () => {
		expect(filterStudents(students, "", "", "", "", "")).toHaveLength(4)
	})

	it("filters by name", () => {
		expect(filterStudents(students, "ann", "", "", "", "")).toHaveLength(1)
		expect(filterStudents(students, "a", "", "", "", "")).toHaveLength(2) // Anna, Clara
	})

	it("filters by age min/max", () => {
		expect(filterStudents(students, "", "20", "", "", "")).toHaveLength(2) // Anna 25, Bruno 30
		expect(filterStudents(students, "", "", "22", "", "")).toHaveLength(1) // Clara 18 only (25, 30 excluded)
		expect(filterStudents(students, "", "18", "25", "", "")).toHaveLength(2) // Anna 25, Clara 18
	})

	it("excludes null age when min/max set", () => {
		expect(filterStudents(students, "", "10", "40", "", "")).toHaveLength(3)
		expect(filterStudents(students, "", "30", "40", "", "")).toHaveLength(1)
	})

	it("filters by Standard rank", () => {
		expect(filterStudents(students, "", "", "", "B", "")).toHaveLength(2)
		expect(filterStudents(students, "", "", "", "A", "")).toHaveLength(1)
	})

	it("filters by Latin rank", () => {
		expect(filterStudents(students, "", "", "", "", "A")).toHaveLength(1)
		expect(filterStudents(students, "", "", "", "", "S")).toHaveLength(1)
	})

	it("combines name + age + rank", () => {
		const out = filterStudents(students, "a", "18", "30", "B", "")
		expect(out).toHaveLength(2) // Anna, Clara (both have B and name contains 'a', age in range)
	})
})

// ---- Trainers ----
type Trainer = {
	user_id: string
	full_name: string
	rank_standard: string | null
	rank_latin: string | null
	age: number | null
	is_external?: boolean
}

function filterTrainers(
	list: Trainer[],
	searchQuery: string,
	ageMin: string,
	ageMax: string,
	externalOnly: boolean,
	filterRankStandard: string,
	filterRankLatin: string
): Trainer[] {
	const q = searchQuery.trim().toLowerCase()
	const min = ageMin.trim() === "" ? null : parseInt(ageMin, 10)
	const max = ageMax.trim() === "" ? null : parseInt(ageMax, 10)
	const rankStt = filterRankStandard.trim() || null
	const rankLat = filterRankLatin.trim() || null
	return list.filter((t) => {
		if (externalOnly && !t.is_external) return false
		if (q && !t.full_name.toLowerCase().includes(q)) return false
		if (min != null && !Number.isNaN(min) && (t.age == null || t.age < min)) return false
		if (max != null && !Number.isNaN(max) && (t.age == null || t.age > max)) return false
		if (rankStt != null && t.rank_standard !== rankStt) return false
		if (rankLat != null && t.rank_latin !== rankLat) return false
		return true
	})
}

describe("Trainers: name, age, category, external filters", () => {
	const trainers: Trainer[] = [
		{ user_id: "1", full_name: "Trainer One", rank_standard: "S", rank_latin: "S", age: 40, is_external: false },
		{ user_id: "2", full_name: "External Jane", rank_standard: "A", rank_latin: "A", age: 35, is_external: true },
		{ user_id: "3", full_name: "Trainer Three", rank_standard: "B", rank_latin: null, age: 28, is_external: false },
	]

	it("returns all when no filters", () => {
		expect(filterTrainers(trainers, "", "", "", false, "", "")).toHaveLength(3)
	})

	it("external only keeps only external", () => {
		expect(filterTrainers(trainers, "", "", "", true, "", "")).toHaveLength(1)
		expect(filterTrainers(trainers, "", "", "", true, "", "")[0].full_name).toBe("External Jane")
	})

	it("filters by name and rank", () => {
		expect(filterTrainers(trainers, "Jane", "", "", false, "", "")).toHaveLength(1)
		expect(filterTrainers(trainers, "", "", "", false, "S", "")).toHaveLength(1)
		expect(filterTrainers(trainers, "", "", "", false, "B", "")).toHaveLength(1)
	})

	it("combines external + rank", () => {
		const out = filterTrainers(trainers, "", "", "", true, "A", "")
		expect(out).toHaveLength(1)
		expect(out[0].user_id).toBe("2")
	})
})

// ---- Groups ----
type Group = { id: string; name: string }

function filterGroups(groups: Group[], searchQuery: string): Group[] {
	const q = searchQuery.trim().toLowerCase()
	if (!q) return groups
	return groups.filter((g) => g.name.toLowerCase().includes(q))
}

describe("Groups: name search", () => {
	const groups: Group[] = [
		{ id: "1", name: "Beginners" },
		{ id: "2", name: "Advanced Latin" },
		{ id: "3", name: "Kids Group" },
	]

	it("returns all when search empty", () => {
		expect(filterGroups(groups, "")).toHaveLength(3)
	})

	it("filters by name", () => {
		expect(filterGroups(groups, "begin")).toHaveLength(1)
		expect(filterGroups(groups, "latin")).toHaveLength(1)
		expect(filterGroups(groups, "kids")).toHaveLength(1)
	})

	it("returns empty when no match", () => {
		expect(filterGroups(groups, "xyz")).toHaveLength(0)
	})
})

// ---- Edge cases (empty lists, boundaries, invalid inputs) ----
describe("Edge cases: timetable lessons", () => {
	it("returns empty when lessons array is empty", () => {
		expect(filterTimetableLessons([], new Set(), new Set(), new Set())).toHaveLength(0)
	})
	it("returns empty when filter labels match nothing", () => {
		const lessons: LessonItem[] = [
			{ id: "1", label: "A", trainer_id: "t1", trainer_name: "X", lesson_type: "standard" },
		]
		expect(filterTimetableLessons(lessons, new Set(["B"]), new Set(), new Set())).toHaveLength(0)
	})
})

describe("Edge cases: couples", () => {
	it("returns empty list when couples array is empty", () => {
		expect(filterCouples([], "alice")).toHaveLength(0)
	})
	it("handles couple with no name and both partners null", () => {
		const couples: Couple[] = [
			{ id: "1", name: null, partner1_name: null, partner2_name: null },
		]
		expect(filterCouples(couples, "")).toHaveLength(1)
		expect(filterCouples(couples, "x")).toHaveLength(0)
	})
})

describe("Edge cases: students", () => {
	const students: Student[] = [
		{ user_id: "1", full_name: "Anna", rank_standard: "B", rank_latin: "C", age: 25 },
		{ user_id: "2", full_name: "Bruno", rank_standard: "A", rank_latin: "A", age: null },
	]
	it("returns empty when list is empty", () => {
		expect(filterStudents([], "", "", "", "", "")).toHaveLength(0)
	})
	it("treats invalid age min (NaN) as no filter", () => {
		expect(filterStudents(students, "", "x", "", "", "")).toHaveLength(2)
	})
	it("treats invalid age max (NaN) as no filter", () => {
		expect(filterStudents(students, "", "", "y", "", "")).toHaveLength(2)
	})
	it("when min > max, no student with age in range (boundary)", () => {
		expect(filterStudents(students, "", "30", "20", "", "")).toHaveLength(0)
	})
	it("age exactly at min/max is included", () => {
		expect(filterStudents(students, "", "25", "25", "", "")).toHaveLength(1)
		expect(filterStudents(students, "Anna", "25", "25", "", "")[0].user_id).toBe("1")
	})
})

describe("Edge cases: trainers", () => {
	it("returns all when list empty (no filters)", () => {
		expect(filterTrainers([], "", "", "", false, "", "")).toHaveLength(0)
	})
	it("treats is_external undefined as falsy (internal)", () => {
		const trainers: Trainer[] = [
			{ user_id: "1", full_name: "T1", rank_standard: null, rank_latin: null, age: null },
		]
		expect(filterTrainers(trainers, "", "", "", true, "", "")).toHaveLength(0)
	})
})

describe("Edge cases: groups", () => {
	it("returns empty when groups array is empty", () => {
		expect(filterGroups([], "")).toHaveLength(0)
		expect(filterGroups([], "foo")).toHaveLength(0)
	})
})
