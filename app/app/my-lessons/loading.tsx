"use client"

import { PageSkeleton } from "@/app/app/_components/page-skeleton"

export default function MyLessonsLoading() {
	return (
		<div className="flex flex-col gap-6 p-4 md:p-6">
			<PageSkeleton backHref="/app" contentOnly cardGridCount={6} />
		</div>
	)
}

