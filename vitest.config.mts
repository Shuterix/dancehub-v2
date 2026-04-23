import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "node",
		globals: false,
		include: ["lib/**/*.test.ts", "lib/**/*.test.tsx"],
		pool: "forks",
	},
})
