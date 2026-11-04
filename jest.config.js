/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['<rootDir>/test/**/*.test.ts'],
	// test/ is intentionally outside tsconfig.json's "include", so it never
	// ends up in dist/ via `n8n-node build` — ts-jest still compiles it fine
	// here since it only reads compilerOptions, not include/exclude.
	collectCoverageFrom: ['nodes/**/*.ts', 'credentials/**/*.ts', '!**/*.d.ts'],
};
