declare module "owasp-password-strength-test" {
	interface TestResult {
		errors: string[]
		strong: boolean
		failedTests: number[]
		passedTests: number[]
		requiredTestErrors: string[]
		optionalTestErrors: string[]
		isPassphrase: boolean
		optionalTestsPassed: number
	}

	interface Config {
		allowPassphrases?: boolean
		maxLength?: number
		minLength?: number
		minPhraseLength?: number
		minOptionalTestsToPass?: number
	}

	interface Owasp {
		test(password: string): TestResult
		config(options: Config): void
	}

	const owasp: Owasp
	export default owasp
}
