import { NextResponse } from "next/server"

/** Standard JSON error response helper */
export function apiError(message: string, status: number = 400) {
	return NextResponse.json({ error: message }, { status })
}

/** Standard JSON success response helper */
export function apiSuccess<T>(data: T, status: number = 200) {
	return NextResponse.json(data, { status })
}
