import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { allowedDaysForDistribution, isAvailableAtSlot } from "@/lib/timetable-solver"
import type { AvailabilitySlot } from "@/lib/availability"
import { getLessonUserIds, loadMemberContext, sharesUser, type LessonMemberContext } from "@/lib/lesson-members"
import { fetchMatchingSiblings } from "@/lib/lesson-pattern"

/**
 * Granularity when scanning for an alternative free slot. 15 minutes matches
 * the Reschedule dialog so the auto-fix and the manual flow agree on what
 * "a free slot" means.
 */
const SLOT_STEP_MINUTES = 15

type Lesson = {
	id: string
	timetable_id: string
	lesson_type: "individual" | "couple" | "group"
	start_at: string
	end_at: string
	room_id: string | null
	trainer_id: string | null
	student_id: string | null
	couple_id: string | null
	group_id: string | null
}

type BusyLesson = Lesson & { user_ids: string[] }

/**
 * A deduped weekly occupancy bucket — every concrete lesson that lands on
 * the same (weekday, start_time, end_time, trainer, room, participants)
 * collapses into one pattern. We scan slots against patterns instead of
 * individual lessons so that a candidate is only accepted if it's free
 * across every week the timetable(s) touch — preventing the auto-fix from
 * creating new conflicts in other weeks or other timetables.
 */
type BusyPattern = {
	weekday: number // 0 = Sun .. 6 = Sat
	start_min: number
	end_min: number
	trainer_id: string | null
	room_id: string | null
	user_ids: string[]
	/** Every concrete lesson id that shares this pattern. */
	lesson_ids: string[]
}

type MoveResult = {
	lesson_id: string
	from_start_at: string
	to_start_at: string
	future_moved: number
}

type Blocker =
	| { kind: "trainer_unavailable"; trainer_id: string; trainer_name: string }
	| { kind: "participant_unavailable"; participant_type: "student" | "couple" | "group"; participant_id: string; participant_name: string }
	| { kind: "trainer_busy"; trainer_id: string; trainer_name: string }
	| { kind: "room_busy"; room_id: string; room_name: string }
	| { kind: "member_busy"; user_id: string; user_name: string }
	| { kind: "buffer_rule" }
	| { kind: "consecutive_rule" }
	| { kind: "distribution_rule" }
	| { kind: "no_allowed_days" }

type SkipResult = {
	lesson_id: string
	lesson: {
		timetable_id: string
		lesson_type: "individual" | "couple" | "group"
		start_at: string
		end_at: string
		trainer_name: string | null
		participant_name: string | null
	}
	reason: string
	blocker: Blocker
	other_reasons: string[]
}

type RejectionTally = {
	distributionDay: number
	trainerAvail: number
	participantAvail: number
	trainerBusy: number
	roomBusy: Map<string, number>
	memberBusy: Map<string, number>
	buffer: number
	consecutive: number
}

function makeTally(): RejectionTally {
	return {
		distributionDay: 0,
		trainerAvail: 0,
		participantAvail: 0,
		trainerBusy: 0,
		roomBusy: new Map(),
		memberBusy: new Map(),
		buffer: 0,
		consecutive: 0,
	}
}

async function getClubAndAuth(
	supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
) {
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()
	if (userError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

	const { data: myProfile } = await supabase
		.from("profiles")
		.select("club_id")
		.eq("id", user.id)
		.maybeSingle()
	if (!myProfile?.club_id) return { error: NextResponse.json({ error: "No club" }, { status: 404 }) }

	const { data: members } = await supabase
		.from("club_members")
		.select("user_id, role")
		.eq("club_id", myProfile.club_id)
	const isTrainer = (members ?? []).some((m) => m.user_id === user.id && m.role === "trainer")

	return { user, clubId: myProfile.club_id as string, isTrainer }
}

function toMinutes(t: string): number {
	const [h, m] = t.split(":").map(Number)
	return (h ?? 0) * 60 + (m ?? 0)
}
function toTime(total: number): string {
	const h = Math.floor(total / 60)
	const m = total % 60
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}
function overlapsMin(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && bStart < aEnd
}
function parseAvailability(raw: unknown): AvailabilitySlot[] {
	return Array.isArray(raw) ? (raw as AvailabilitySlot[]) : []
}
function weekdayOf(isoDate: string): number {
	const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number)
	return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
}
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
/**
 * Pick any date (ISO YYYY-MM-DD) that falls on the given weekday. Used so
 * we can call `isAvailableAtSlot` once per weekday, since availability is
 * weekday-based in this app (`AvailabilitySlot.day` is a day name).
 */
function representativeDateForWeekday(weekday: number): string {
	// 2024-01-01 is a Monday (weekday 1). Pick a known anchor and walk.
	// 2024-01-07 is a Sunday (weekday 0).
	const anchorSundayMs = Date.UTC(2024, 0, 7) // Sun
	const ms = anchorSundayMs + weekday * 86400000
	return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Build a BusyPattern index from the currently-known lesson set. Lessons
 * sharing the same (weekday, start, end, trainer, room, user_ids) collapse
 * into one pattern, with `lesson_ids` tracking every concrete occurrence.
 */
function buildBusyPatterns(lessons: BusyLesson[]): Map<number, BusyPattern[]> {
	const sigMap = new Map<string, BusyPattern>()
	for (const l of lessons) {
		const weekday = weekdayOf(l.start_at)
		const startMin = toMinutes(l.start_at.slice(11, 16))
		const endMin = toMinutes(l.end_at.slice(11, 16))
		const userKey = [...l.user_ids].sort().join(",")
		const sig = `${weekday}|${startMin}|${endMin}|${l.trainer_id ?? ""}|${l.room_id ?? ""}|${userKey}`
		let p = sigMap.get(sig)
		if (!p) {
			p = {
				weekday,
				start_min: startMin,
				end_min: endMin,
				trainer_id: l.trainer_id,
				room_id: l.room_id,
				user_ids: [...l.user_ids],
				lesson_ids: [],
			}
			sigMap.set(sig, p)
		}
		p.lesson_ids.push(l.id)
	}
	const byWeekday = new Map<number, BusyPattern[]>()
	for (const p of sigMap.values()) {
		if (!byWeekday.has(p.weekday)) byWeekday.set(p.weekday, [])
		byWeekday.get(p.weekday)!.push(p)
	}
	return byWeekday
}

/**
 * Does `lesson`'s current slot conflict with any pattern it doesn't own?
 * Used to re-check that a lesson still needs moving before doing the work.
 */
function hasActiveConflict(
	lesson: BusyLesson,
	patternsByWeekday: Map<number, BusyPattern[]>,
): boolean {
	const weekday = weekdayOf(lesson.start_at)
	const ls = toMinutes(lesson.start_at.slice(11, 16))
	const le = toMinutes(lesson.end_at.slice(11, 16))
	const patterns = patternsByWeekday.get(weekday) ?? []
	const myIdSet = new Set([lesson.id])
	for (const p of patterns) {
		// Skip patterns that only contain this lesson itself.
		if (p.lesson_ids.every((id) => myIdSet.has(id))) continue
		if (!overlapsMin(ls, le, p.start_min, p.end_min)) continue
		if (lesson.trainer_id && p.trainer_id === lesson.trainer_id) return true
		if (lesson.room_id && p.room_id === lesson.room_id) return true
		if (sharesUser(lesson.user_ids, p.user_ids)) return true
	}
	return false
}

/**
 * Enumerate every weekday + start-time combination where `lesson` would
 * sit without conflicting with ANY busy pattern on that weekday — i.e. a
 * slot that works across every week in every active timetable.
 * Returns both the candidates (with a representative date per weekday)
 * and a tally of why other slots were rejected.
 */
function enumerateFreeSlots(
	lesson: BusyLesson,
	opts: {
		dayStartMin: number
		dayEndMin: number
		durationMin: number
		distribution: "same" | "first_half" | "second_half"
		bufferMin: number
		maxConsecMin: number
		minBreakMin: number
		trainerAvail: AvailabilitySlot[]
		participantAvail: AvailabilitySlot[]
		patternsByWeekday: Map<number, BusyPattern[]>
	},
): {
	candidates: { weekday: number; start_time: string; end_time: string }[]
	tally: RejectionTally
} {
	const {
		dayStartMin, dayEndMin, durationMin, distribution,
		bufferMin, maxConsecMin, minBreakMin,
		trainerAvail, participantAvail, patternsByWeekday,
	} = opts

	const tally = makeTally()
	const allowed = allowedDaysForDistribution(distribution)
	const candidates: { weekday: number; start_time: string; end_time: string }[] = []
	const slotsInDay = Math.max(0, Math.floor((dayEndMin - dayStartMin) / SLOT_STEP_MINUTES))
	const myId = lesson.id

	for (let weekday = 0; weekday < 7; weekday++) {
		if (!allowed.has(DAY_NAMES[weekday])) {
			tally.distributionDay += slotsInDay
			continue
		}

		const representativeDate = representativeDateForWeekday(weekday)
		const patternsRaw = patternsByWeekday.get(weekday) ?? []
		// Drop patterns whose ONLY concrete occurrences are this very lesson,
		// so we don't treat ourselves as our own blocker.
		const patterns = patternsRaw.filter((p) => !p.lesson_ids.every((id) => id === myId))

		for (let startMin = dayStartMin; startMin + durationMin <= dayEndMin; startMin += SLOT_STEP_MINUTES) {
			const endMin = startMin + durationMin
			const startTime = toTime(startMin)
			const endTime = toTime(endMin)

			if (lesson.trainer_id && !isAvailableAtSlot(trainerAvail, representativeDate, startTime, endTime)) {
				tally.trainerAvail++
				continue
			}
			if (
				(lesson.student_id || lesson.couple_id || lesson.group_id) &&
				!isAvailableAtSlot(participantAvail, representativeDate, startTime, endTime)
			) {
				tally.participantAvail++
				continue
			}

			// Direct overlap: trainer, room, or any shared member.
			let overlapReason: Blocker["kind"] | null = null
			let overlapRoomId: string | null = null
			let overlapMemberId: string | null = null
			for (const p of patterns) {
				if (!overlapsMin(startMin, endMin, p.start_min, p.end_min)) continue
				// If every concrete lesson in `p` is the current lesson, skip (it's us).
				if (p.lesson_ids.length === 1 && p.lesson_ids[0] === myId) continue
				if (lesson.trainer_id && p.trainer_id === lesson.trainer_id) {
					overlapReason = "trainer_busy"
					break
				}
				if (lesson.room_id && p.room_id === lesson.room_id) {
					overlapReason = "room_busy"
					overlapRoomId = lesson.room_id
					break
				}
				// Find the specific shared member so we can name them.
				for (const uid of lesson.user_ids) {
					if (p.user_ids.includes(uid)) {
						overlapReason = "member_busy"
						overlapMemberId = uid
						break
					}
				}
				if (overlapReason) break
			}
			if (overlapReason === "trainer_busy") { tally.trainerBusy++; continue }
			if (overlapReason === "room_busy" && overlapRoomId) {
				tally.roomBusy.set(overlapRoomId, (tally.roomBusy.get(overlapRoomId) ?? 0) + 1)
				continue
			}
			if (overlapReason === "member_busy" && overlapMemberId) {
				tally.memberBusy.set(overlapMemberId, (tally.memberBusy.get(overlapMemberId) ?? 0) + 1)
				continue
			}

			// Buffer rule (trainer or shared member within bufferMin of another lesson).
			if (bufferMin > 0) {
				let tooClose = false
				for (const p of patterns) {
					const sharesTrainer = lesson.trainer_id && p.trainer_id === lesson.trainer_id
					const sharesParticipant = sharesUser(lesson.user_ids, p.user_ids)
					if (!sharesTrainer && !sharesParticipant) continue
					const gap = startMin >= p.end_min ? startMin - p.end_min : p.start_min - endMin
					if (gap >= 0 && gap < bufferMin) { tooClose = true; break }
				}
				if (tooClose) { tally.buffer++; continue }
			}

			// Max-consecutive + min-break check for this lesson's trainer.
			if (lesson.trainer_id && maxConsecMin > 0 && minBreakMin > 0) {
				const trainerChunks = patterns
					.filter((p) => p.trainer_id === lesson.trainer_id)
					.map((p) => ({ start: p.start_min, end: p.end_min }))
				trainerChunks.push({ start: startMin, end: endMin })
				trainerChunks.sort((a, b) => a.start - b.start)
				let streakStart: number | null = null
				let streakEnd: number | null = null
				let violated = false
				for (const chunk of trainerChunks) {
					if (streakEnd !== null && chunk.start === streakEnd) {
						streakEnd = chunk.end
					} else {
						if (streakStart !== null && streakEnd !== null && streakEnd - streakStart > maxConsecMin) {
							const gapAfter = chunk.start - streakEnd
							if (gapAfter < minBreakMin) { violated = true; break }
						}
						streakStart = chunk.start
						streakEnd = chunk.end
					}
				}
				if (violated) { tally.consecutive++; continue }
			}

			candidates.push({ weekday, start_time: startTime, end_time: endTime })
		}
	}
	return { candidates, tally }
}

/**
 * Pick the candidate whose (weekday, minute-of-day) is closest to the
 * lesson's current (weekday, minute-of-day). "Closest" in cyclic-weekday
 * minutes so a Friday -> Monday 2-day move is considered shorter than
 * Friday -> next Wednesday.
 */
function pickClosestSlot(
	lesson: BusyLesson,
	candidates: { weekday: number; start_time: string; end_time: string }[],
): { weekday: number; start_time: string; end_time: string } | null {
	if (candidates.length === 0) return null
	const oldWeekday = weekdayOf(lesson.start_at)
	const oldStartMin = toMinutes(lesson.start_at.slice(11, 16))
	const WEEK_MIN = 7 * 24 * 60

	let best = candidates[0]
	let bestDelta = Number.POSITIVE_INFINITY
	for (const c of candidates) {
		const cMin = c.weekday * 24 * 60 + toMinutes(c.start_time)
		const oMin = oldWeekday * 24 * 60 + oldStartMin
		const raw = Math.abs(cMin - oMin)
		const cyclic = Math.min(raw, WEEK_MIN - raw)
		if (cyclic < bestDelta) {
			bestDelta = cyclic
			best = c
		}
	}
	return best
}

/**
 * Translate a (weekday, HH:mm) candidate back to a concrete date that
 * preserves the original week of the lesson being moved, but with the new
 * weekday and time.
 */
function concreteDateForMove(originalStartAt: string, targetWeekday: number): string {
	const [y, m, d] = originalStartAt.slice(0, 10).split("-").map(Number)
	const base = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
	const originalWeekday = base.getUTCDay()
	const delta = targetWeekday - originalWeekday
	base.setUTCDate(base.getUTCDate() + delta)
	return base.toISOString().slice(0, 10)
}

/**
 * Apply a recurring shift: find every other occurrence in the same timetable
 * that shares this lesson's original pattern (trainer, participant, weekday,
 * HH:MM) and push each by the same delta.
 *
 * Unlike the manual PATCH endpoint (which only touches future occurrences so
 * already-happened lessons stay in the history), auto-reschedule moves the
 * ENTIRE pattern — past and future. Otherwise moving a canonical chosen
 * from a mid-range week would split the weekly pattern across two slots,
 * which is how earlier runs ended up with new collateral conflicts in weeks
 * that were previously conflict-free.
 */
async function shiftPatternOccurrences(
	supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
	lesson: Lesson,
	newStartAt: string,
): Promise<{ moved: number; shifted: Array<{ id: string; new_start_at: string; new_end_at: string }> }> {
	const oldStartMs = new Date(lesson.start_at).getTime()
	const newStartMs = new Date(newStartAt).getTime()
	const deltaMs = newStartMs - oldStartMs
	if (deltaMs === 0) return { moved: 0, shifted: [] }

	// Use the sibling-rank aware matcher so when two distinct lessons share
	// the same fingerprint in one week (duplicate placements), moving the
	// anchor only shifts the *corresponding* sibling in every other week,
	// not both of them. See lib/lesson-pattern.ts.
	const siblings = await fetchMatchingSiblings(supabase, {
		id: lesson.id,
		timetable_id: lesson.timetable_id,
		start_at: lesson.start_at,
		end_at: lesson.end_at,
		lesson_type: lesson.lesson_type,
		trainer_id: lesson.trainer_id ?? null,
		student_id: lesson.student_id ?? null,
		couple_id: lesson.couple_id ?? null,
		group_id: lesson.group_id ?? null,
	})

	const shifted: Array<{ id: string; new_start_at: string; new_end_at: string }> = []
	for (const c of siblings) {
		const ns = new Date(new Date(c.start_at).getTime() + deltaMs).toISOString()
		const ne = new Date(new Date(c.end_at).getTime() + deltaMs).toISOString()
		const { error } = await supabase.from("lessons").update({ start_at: ns, end_at: ne }).eq("id", c.id)
		if (!error) shifted.push({ id: c.id, new_start_at: ns, new_end_at: ne })
	}
	return { moved: shifted.length, shifted }
}

/**
 * Resolve the dominant rejection category into a user-friendly reason plus
 * a structured blocker. Names come in via the caller's caches.
 */
function resolveDominantBlocker(
	tally: RejectionTally,
	lesson: BusyLesson,
	names: {
		trainer?: string
		participant?: string
		participantType?: "student" | "couple" | "group"
		roomNameById: Map<string, string>
		profileNameById: Map<string, string>
	},
): { reason: string; blocker: Blocker; others: string[] } {
	type Row = { label: string; count: number; blocker: Blocker }
	const rows: Row[] = []

	if (tally.trainerAvail > 0 && lesson.trainer_id) {
		const name = names.trainer ?? "Trainer"
		rows.push({
			label: `Trainer ${name} is not available in ${tally.trainerAvail} candidate slot(s)`,
			count: tally.trainerAvail,
			blocker: { kind: "trainer_unavailable", trainer_id: lesson.trainer_id, trainer_name: name },
		})
	}
	if (tally.participantAvail > 0) {
		const pid = lesson.student_id ?? lesson.couple_id ?? lesson.group_id ?? null
		const ptype = names.participantType ?? (lesson.student_id ? "student" : lesson.couple_id ? "couple" : "group")
		if (pid) {
			const name = names.participant ?? "Participant"
			rows.push({
				label: `${name} is not available in ${tally.participantAvail} candidate slot(s)`,
				count: tally.participantAvail,
				blocker: { kind: "participant_unavailable", participant_type: ptype, participant_id: pid, participant_name: name },
			})
		}
	}
	if (tally.trainerBusy > 0 && lesson.trainer_id) {
		const name = names.trainer ?? "Trainer"
		rows.push({
			label: `Trainer ${name} has overlapping lessons at ${tally.trainerBusy} candidate slot(s)`,
			count: tally.trainerBusy,
			blocker: { kind: "trainer_busy", trainer_id: lesson.trainer_id, trainer_name: name },
		})
	}
	for (const [rid, n] of tally.roomBusy) {
		const name = names.roomNameById.get(rid) ?? "Room"
		rows.push({
			label: `Room ${name} is occupied at ${n} candidate slot(s)`,
			count: n,
			blocker: { kind: "room_busy", room_id: rid, room_name: name },
		})
	}
	for (const [uid, n] of tally.memberBusy) {
		const name = names.profileNameById.get(uid) ?? "Member"
		rows.push({
			label: `${name} is already booked at ${n} candidate slot(s)`,
			count: n,
			blocker: { kind: "member_busy", user_id: uid, user_name: name },
		})
	}
	if (tally.buffer > 0) {
		rows.push({
			label: `Buffer rule leaves ${tally.buffer} candidate slot(s) too close to another lesson`,
			count: tally.buffer,
			blocker: { kind: "buffer_rule" },
		})
	}
	if (tally.consecutive > 0) {
		rows.push({
			label: `Max-consecutive-lessons rule blocks ${tally.consecutive} candidate slot(s)`,
			count: tally.consecutive,
			blocker: { kind: "consecutive_rule" },
		})
	}

	if (rows.length === 0) {
		if (tally.distributionDay > 0) {
			return {
				reason: "No days in the distribution preference have room in this timetable's day window",
				blocker: { kind: "distribution_rule" },
				others: [],
			}
		}
		return {
			reason: "No candidate slot fits all the rules",
			blocker: { kind: "no_allowed_days" },
			others: [],
		}
	}
	rows.sort((a, b) => b.count - a.count)
	const top = rows[0]
	return {
		reason: top.label,
		blocker: top.blocker,
		others: rows.slice(1).map((r) => r.label),
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id: timetableId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth
	if (!isTrainer) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

	let body: {
		week_start?: string
		apply_to_all_future?: boolean
		lesson_ids?: string[]
	} = {}
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 })
	}
	const applyToAllFuture = body.apply_to_all_future !== false // default true
	const explicitLessonIds = Array.isArray(body.lesson_ids)
		? body.lesson_ids.filter((x) => typeof x === "string")
		: null

	// ---- Timetable + prefs ----
	const { data: timetable } = await supabase
		.from("timetables")
		.select("id, day_start, day_end, club_id")
		.eq("id", timetableId)
		.eq("club_id", clubId)
		.single()
	if (!timetable) return NextResponse.json({ error: "Timetable not found" }, { status: 404 })

	const { data: prefs } = await supabase
		.from("timetable_preferences")
		.select("distribution, buffer_between_lessons_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive")
		.eq("timetable_id", timetableId)
		.maybeSingle()
	const distribution = (prefs?.distribution ?? "same") as "same" | "first_half" | "second_half"
	const bufferMin = Math.max(0, Number(prefs?.buffer_between_lessons_minutes ?? 0) || 0)
	const maxConsecMin = Math.max(0, Number(prefs?.max_consecutive_minutes_per_trainer ?? 0) || 0)
	const minBreakMin = Math.max(0, Number(prefs?.min_break_minutes_after_consecutive ?? 0) || 0)
	const dayStartMin = toMinutes(timetable.day_start ?? "08:00")
	const dayEndMin = toMinutes(timetable.day_end ?? "22:00")

	const memberCtx: LessonMemberContext = await loadMemberContext(supabase, clubId)

	// ---- Active timetables and all their lessons ----
	const { data: activeTt } = await supabase
		.from("timetables")
		.select("id")
		.eq("club_id", clubId)
		.eq("is_active", true)
	const activeIds = (activeTt ?? []).map((t) => t.id)
	const activeIdList = activeIds.length > 0 ? activeIds : [timetableId]

	const { data: allLessonsRaw } = await supabase
		.from("lessons")
		.select("id, timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, group_id")
		.in("timetable_id", activeIdList)
		.is("cancelled_at", null)

	/**
	 * `allLessons` is the single source of truth for busy patterns during
	 * the run. After any successful DB move we mutate the corresponding
	 * entries here and rebuild `patternsByWeekday`, so every subsequent
	 * lesson we try to move sees the up-to-date layout across every active
	 * timetable across every week.
	 */
	const allLessons: BusyLesson[] = (allLessonsRaw ?? []).map((l) => ({
		...(l as Lesson),
		user_ids: getLessonUserIds(l, memberCtx),
	}))
	const byId = new Map<string, BusyLesson>(allLessons.map((l) => [l.id, l]))
	let patternsByWeekday = buildBusyPatterns(allLessons)

	// ---- Availability caches (per entity) ----
	const trainerAvailCache = new Map<string, AvailabilitySlot[]>()
	const studentAvailCache = new Map<string, AvailabilitySlot[]>()
	const coupleAvailCache = new Map<string, AvailabilitySlot[]>()
	const groupAvailCache = new Map<string, AvailabilitySlot[]>()

	async function getTrainerAvail(id: string): Promise<AvailabilitySlot[]> {
		if (trainerAvailCache.has(id)) return trainerAvailCache.get(id)!
		const { data } = await supabase.from("profiles").select("availability").eq("id", id).maybeSingle()
		const av = parseAvailability(data?.availability)
		trainerAvailCache.set(id, av)
		return av
	}
	async function getParticipantAvail(l: Lesson): Promise<AvailabilitySlot[]> {
		if (l.student_id) {
			if (studentAvailCache.has(l.student_id)) return studentAvailCache.get(l.student_id)!
			const { data } = await supabase.from("profiles").select("availability").eq("id", l.student_id).maybeSingle()
			const av = parseAvailability(data?.availability)
			studentAvailCache.set(l.student_id, av)
			return av
		}
		if (l.couple_id) {
			if (coupleAvailCache.has(l.couple_id)) return coupleAvailCache.get(l.couple_id)!
			const { data } = await supabase.from("couples").select("availability").eq("id", l.couple_id).maybeSingle()
			const av = parseAvailability(data?.availability)
			coupleAvailCache.set(l.couple_id, av)
			return av
		}
		if (l.group_id) {
			if (groupAvailCache.has(l.group_id)) return groupAvailCache.get(l.group_id)!
			const { data } = await supabase.from("groups").select("availability").eq("id", l.group_id).maybeSingle()
			const av = parseAvailability(data?.availability)
			groupAvailCache.set(l.group_id, av)
			return av
		}
		return []
	}

	// ---- Name caches for human-readable skip reasons ----
	const profileNameById = new Map<string, string>()
	const coupleLabelById = new Map<string, string>()
	const groupNameById = new Map<string, string>()
	const roomNameById = new Map<string, string>()

	async function getProfileName(id: string): Promise<string> {
		if (profileNameById.has(id)) return profileNameById.get(id)!
		const { data } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle()
		const name = ((data?.full_name as string | null) ?? "").trim() || "Member"
		profileNameById.set(id, name)
		return name
	}
	async function getCoupleLabel(id: string): Promise<string> {
		if (coupleLabelById.has(id)) return coupleLabelById.get(id)!
		const { data } = await supabase
			.from("couples")
			.select("name, partner1_user_id, partner2_user_id")
			.eq("id", id)
			.maybeSingle()
		if (data?.name) {
			coupleLabelById.set(id, data.name)
			return data.name
		}
		const a = data?.partner1_user_id ? await getProfileName(data.partner1_user_id) : "Partner 1"
		const b = data?.partner2_user_id ? await getProfileName(data.partner2_user_id) : "Partner 2"
		const label = `${a} & ${b}`
		coupleLabelById.set(id, label)
		return label
	}
	async function getGroupName(id: string): Promise<string> {
		if (groupNameById.has(id)) return groupNameById.get(id)!
		const { data } = await supabase.from("groups").select("name").eq("id", id).maybeSingle()
		const name = ((data?.name as string | null) ?? "").trim() || "Group"
		groupNameById.set(id, name)
		return name
	}
	async function getRoomName(id: string): Promise<string> {
		if (roomNameById.has(id)) return roomNameById.get(id)!
		const { data } = await supabase.from("rooms").select("name").eq("id", id).maybeSingle()
		const name = ((data?.name as string | null) ?? "").trim() || "Room"
		roomNameById.set(id, name)
		return name
	}

	// ---- Pick the initial list of lessons to work on ----
	// This is a *seed* list. Each iteration below rediscovers every lesson in
	// this timetable that still has an active conflict, so moves that create
	// collateral conflicts get fixed in later iterations.
	let seedCanonicalIds = new Set<string>()
	if (explicitLessonIds && explicitLessonIds.length > 0) {
		for (const lid of explicitLessonIds) {
			const l = byId.get(lid)
			if (l && l.timetable_id === timetableId) seedCanonicalIds.add(lid)
		}
	} else if (body.week_start) {
		const weekStartDate = body.week_start
		if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
			return NextResponse.json({ error: "Invalid week_start" }, { status: 400 })
		}
		const [ys, ms, ds] = weekStartDate.split("-").map(Number)
		const weekStartMs = Date.UTC(ys ?? 1970, (ms ?? 1) - 1, (ds ?? 1))
		const weekEndMs = weekStartMs + 7 * 86400 * 1000
		for (const l of allLessons) {
			if (l.timetable_id !== timetableId) continue
			const t = new Date(l.start_at).getTime()
			if (t >= weekStartMs && t < weekEndMs) seedCanonicalIds.add(l.id)
		}
	}

	/**
	 * Build the current working queue: every lesson in this timetable that is
	 * currently conflicted, collapsed to one canonical per recurring pattern
	 * so we don't fight `shiftFutureOccurrences` later. Canonical = the
	 * earliest occurrence of each (weekday, start_time, lesson_type, trainer,
	 * student/couple/group) shape.
	 */
	function currentConflictedCanonicals(): BusyLesson[] {
		const byShape = new Map<string, BusyLesson>()
		for (const l of allLessons) {
			if (l.timetable_id !== timetableId) continue
			if (!hasActiveConflict(l, patternsByWeekday)) continue
			const shapeKey = [
				l.lesson_type,
				l.trainer_id ?? "",
				l.student_id ?? "",
				l.couple_id ?? "",
				l.group_id ?? "",
				weekdayOf(l.start_at),
				l.start_at.slice(11, 16),
				l.end_at.slice(11, 16),
			].join("|")
			const existing = byShape.get(shapeKey)
			if (!existing || l.start_at < existing.start_at) byShape.set(shapeKey, l)
		}
		const canonicals = [...byShape.values()]
		canonicals.sort((a, b) => {
			// Honour the caller's initial seed order first, then fall back to
			// chronological so new collateral conflicts still get processed.
			const aSeed = seedCanonicalIds.has(a.id) ? 0 : 1
			const bSeed = seedCanonicalIds.has(b.id) ? 0 : 1
			if (aSeed !== bSeed) return aSeed - bSeed
			return a.start_at.localeCompare(b.start_at)
		})
		return canonicals
	}

	// ---- Iterative convergence loop ----
	// A single pass can create collateral conflicts when two different
	// patterns independently choose the same "closest free slot". We iterate
	// until either there's nothing left to fix or we stop making progress.
	// The skipped map is rebuilt every iteration so a lesson blocked by
	// trainer X in iteration 1 gets reconsidered once other lessons using
	// trainer X have moved away.
	const MAX_ITERATIONS = 6
	const moved: MoveResult[] = []
	let currentSkipped = new Map<string, SkipResult>()

	for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
		currentSkipped = new Map<string, SkipResult>()
		const queue = currentConflictedCanonicals()
		if (queue.length === 0) break

		let progressThisIteration = 0
		for (const queued of queue) {
			const lesson = byId.get(queued.id) ?? queued
			if (!hasActiveConflict(lesson, patternsByWeekday)) continue

			const trainerAvail = lesson.trainer_id ? await getTrainerAvail(lesson.trainer_id) : []
			const participantAvail = await getParticipantAvail(lesson)
			const durationMin = toMinutes(lesson.end_at.slice(11, 16)) - toMinutes(lesson.start_at.slice(11, 16))

			const { candidates, tally } = enumerateFreeSlots(lesson, {
				dayStartMin,
				dayEndMin,
				durationMin,
				distribution,
				bufferMin,
				maxConsecMin,
				minBreakMin,
				trainerAvail,
				participantAvail,
				patternsByWeekday,
			})

			const best = pickClosestSlot(lesson, candidates)
			if (!best) {
				const trainerName = lesson.trainer_id ? await getProfileName(lesson.trainer_id) : undefined
				let participantName: string | undefined
				let participantType: "student" | "couple" | "group" | undefined
				if (lesson.student_id) { participantName = await getProfileName(lesson.student_id); participantType = "student" }
				else if (lesson.couple_id) { participantName = await getCoupleLabel(lesson.couple_id); participantType = "couple" }
				else if (lesson.group_id) { participantName = await getGroupName(lesson.group_id); participantType = "group" }
				for (const uid of tally.memberBusy.keys()) await getProfileName(uid)
				for (const rid of tally.roomBusy.keys()) await getRoomName(rid)

				const { reason, blocker, others } = resolveDominantBlocker(tally, lesson, {
					trainer: trainerName,
					participant: participantName,
					participantType,
					roomNameById,
					profileNameById,
				})
				currentSkipped.set(lesson.id, {
					lesson_id: lesson.id,
					lesson: {
						timetable_id: lesson.timetable_id,
						lesson_type: lesson.lesson_type,
						start_at: lesson.start_at,
						end_at: lesson.end_at,
						trainer_name: trainerName ?? null,
						participant_name: participantName ?? null,
					},
					reason,
					blocker,
					other_reasons: others,
				})
				continue
			}

			// Move: keep the lesson on its original week, just flip weekday+time.
			const newDate = concreteDateForMove(lesson.start_at, best.weekday)
			const newStartAt = `${newDate}T${best.start_time}:00`
			const newEndAt = `${newDate}T${best.end_time}:00`
			const oldStartAt = lesson.start_at
			const oldEndAt = lesson.end_at

			if (newStartAt === oldStartAt && newEndAt === oldEndAt) {
				// "Closest" picked the lesson's current slot — nothing to change.
				// This can happen when a conflict is already unresolvable from this
				// shape's point of view. Record as skipped so we don't spin.
				const trainerName = lesson.trainer_id ? await getProfileName(lesson.trainer_id) : undefined
				let participantName: string | undefined
				if (lesson.student_id) participantName = await getProfileName(lesson.student_id)
				else if (lesson.couple_id) participantName = await getCoupleLabel(lesson.couple_id)
				else if (lesson.group_id) participantName = await getGroupName(lesson.group_id)
				currentSkipped.set(lesson.id, {
					lesson_id: lesson.id,
					lesson: {
						timetable_id: lesson.timetable_id,
						lesson_type: lesson.lesson_type,
						start_at: lesson.start_at,
						end_at: lesson.end_at,
						trainer_name: trainerName ?? null,
						participant_name: participantName ?? null,
					},
					reason: "The only free slot that fits every rule is the lesson's current position",
					blocker: { kind: "no_allowed_days" },
					other_reasons: [],
				})
				continue
			}

			const { error: updateError } = await supabase
				.from("lessons")
				.update({ start_at: newStartAt, end_at: newEndAt })
				.eq("id", lesson.id)
			if (updateError) {
				const trainerName = lesson.trainer_id ? await getProfileName(lesson.trainer_id) : null
				let participantName: string | null = null
				if (lesson.student_id) participantName = await getProfileName(lesson.student_id)
				else if (lesson.couple_id) participantName = await getCoupleLabel(lesson.couple_id)
				else if (lesson.group_id) participantName = await getGroupName(lesson.group_id)
				currentSkipped.set(lesson.id, {
					lesson_id: lesson.id,
					lesson: {
						timetable_id: lesson.timetable_id,
						lesson_type: lesson.lesson_type,
						start_at: lesson.start_at,
						end_at: lesson.end_at,
						trainer_name: trainerName,
						participant_name: participantName,
					},
					reason: `Database update failed: ${updateError.message}`,
					blocker: { kind: "no_allowed_days" },
					other_reasons: [],
				})
				continue
			}

			// Mirror the DB change in our in-memory source of truth.
			const mutable = byId.get(lesson.id)
			if (mutable) {
				mutable.start_at = newStartAt
				mutable.end_at = newEndAt
			}

			let futureMoved = 0
			if (applyToAllFuture) {
				const res = await shiftPatternOccurrences(
					supabase,
					{ ...lesson, start_at: oldStartAt, end_at: oldEndAt } as Lesson,
					newStartAt,
				)
				futureMoved = res.moved
				for (const s of res.shifted) {
					const m = byId.get(s.id)
					if (m) {
						m.start_at = s.new_start_at
						m.end_at = s.new_end_at
					}
				}
			}

			// Rebuild the pattern index so later moves in this (and subsequent)
			// iteration(s) see the updated layout.
			patternsByWeekday = buildBusyPatterns(allLessons)
			progressThisIteration++

			moved.push({
				lesson_id: lesson.id,
				from_start_at: oldStartAt,
				to_start_at: newStartAt,
				future_moved: futureMoved,
			})

			// A lesson that successfully moves is not skipped this iteration.
			currentSkipped.delete(lesson.id)
		}

		if (progressThisIteration === 0) break
	}

	const skipped: SkipResult[] = [...currentSkipped.values()]

	return NextResponse.json({
		moved,
		skipped,
		summary: {
			moved_count: moved.length,
			skipped_count: skipped.length,
			total_recurring_moved: moved.reduce((acc, m) => acc + m.future_moved, 0),
		},
	})
}
