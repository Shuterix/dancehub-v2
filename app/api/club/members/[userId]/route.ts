import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ userId: string }> }
) {
	try {
		const { userId: targetUserId } = await params
		if (!targetUserId) {
			return NextResponse.json({ error: "User ID required" }, { status: 400 })
		}

		const cookieStore = await cookies()
		const supabase = createClient(cookieStore)
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser()
		if (userError || !user) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
		}

		const { data: myProfile } = await supabase
			.from("profiles")
			.select("club_id")
			.eq("id", user.id)
			.maybeSingle()
		if (!myProfile?.club_id) {
			return NextResponse.json({ error: "Not in a club" }, { status: 404 })
		}

		const { data: myMember } = await supabase
			.from("club_members")
			.select("role")
			.eq("club_id", myProfile.club_id)
			.eq("user_id", user.id)
			.maybeSingle()
		if (myMember?.role !== "trainer") {
			return NextResponse.json({ error: "Only trainers can remove members" }, { status: 403 })
		}

		const admin = createAdminClient()
		const { error: deleteMemberError } = await admin
			.from("club_members")
			.delete()
			.eq("club_id", myProfile.club_id)
			.eq("user_id", targetUserId)
		if (deleteMemberError) {
			return NextResponse.json({ error: "Failed to remove member" }, { status: 500 })
		}

		await admin
			.from("profiles")
			.update({ club_id: null })
			.eq("id", targetUserId)

		return NextResponse.json({ ok: true })
	} catch (e) {
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : "Failed to remove member" },
			{ status: 500 }
		)
	}
}
