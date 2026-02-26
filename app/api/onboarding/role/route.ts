import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()

	if (userError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const body = await request.json().catch(() => ({}))
	const role = body?.role as string | undefined
	if (role !== "student" && role !== "trainer") {
		return NextResponse.json({ error: "Invalid role. Use 'student' or 'trainer'." }, { status: 400 })
	}

	const { error } = await supabase
		.from("profiles")
		.upsert({ id: user.id, role }, { onConflict: "id" })

	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ ok: true, role })
}
