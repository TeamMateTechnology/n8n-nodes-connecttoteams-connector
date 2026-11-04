#!/usr/bin/env node
'use strict';

// Guard for `npm run release`: it publishes to npm, which only the public
// repo's publish workflow may do (npm provenance needs GitHub Actions).
// Locally, use `npm run release:prepare` and `npm run release:sync`.

if (!process.env.GITHUB_ACTIONS) {
	console.error(
		"`npm run release` only runs in the public repo's publish workflow.\n" +
			'To release: `npm run release:prepare -- <version>`, commit and merge to main, then `npm run release:sync`.\n' +
			'See docs/RELEASING.md.',
	);
	process.exit(1);
}
