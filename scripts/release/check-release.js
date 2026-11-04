#!/usr/bin/env node
'use strict';

// Release gate: refuses a release whose version, tag or changelog entry is
// missing or stale. Runs in the dev repo (from sync-public.js) and again in
// the public repo's publish workflow, so it must stay dependency-free.
//
//   node scripts/release/check-release.js [--tag <tag>] [--npm]
//
//   --tag <tag>  the tag being released must be "v" + package.json version
//   --npm        the version must not be on npm yet and must be newer than
//                the latest published version

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const CHANGELOG_CANDIDATES = ['CHANGELOG.md', 'docs/CHANGELOG.md'];

function compareVersions(a, b) {
	const pa = SEMVER.exec(a);
	const pb = SEMVER.exec(b);
	for (let i = 1; i <= 3; i++) {
		const diff = Number(pa[i]) - Number(pb[i]);
		if (diff !== 0) return Math.sign(diff);
	}
	// A pre-release sorts before its release (1.0.0-beta.1 < 1.0.0).
	if (pa[4] && !pb[4]) return -1;
	if (!pa[4] && pb[4]) return 1;
	return (pa[4] || '').localeCompare(pb[4] || '', 'en', { numeric: true });
}

/** Splits a changelog into its "## [...]" sections: { name, heading, body }. */
function changelogSections(text) {
	const sections = [];
	let current = null;
	for (const line of text.split(/\r?\n/)) {
		const match = /^## \[([^\]]+)\](.*)$/.exec(line);
		if (match) {
			current = { name: match[1], heading: line, rest: match[2].trim(), body: [] };
			sections.push(current);
		} else if (current) {
			current.body.push(line);
		}
	}
	return sections;
}

function hasEntries(section) {
	return section.body.some((line) => /^\s*[-*] \S/.test(line));
}

/**
 * Checks package.json, package-lock.json and the changelog for a release of
 * package.json's version. Returns a list of problems (empty = releasable).
 */
function checkRelease({ pkg, lock, changelog, tag }) {
	const errors = [];
	const version = pkg.version;

	if (!SEMVER.test(String(version))) {
		return [`package.json version "${version}" is not a valid x.y.z version.`];
	}
	if (version === '0.0.0') {
		return [
			'package.json version is still 0.0.0. Run `npm run release:prepare -- <version>` first.',
		];
	}
	if (
		lock &&
		(lock.version !== version || (lock.packages?.[''] && lock.packages[''].version !== version))
	) {
		errors.push(
			`package-lock.json version does not match package.json (${version}). Run \`npm install\` and commit the lockfile.`,
		);
	}
	if (tag !== undefined && tag !== `v${version}`) {
		errors.push(`Tag "${tag}" does not match package.json version: expected "v${version}".`);
	}

	const sections = changelogSections(changelog);
	const entries = sections.filter((s) => s.name === version);
	if (entries.length === 0) {
		errors.push(
			`The changelog has no "## [${version}] - YYYY-MM-DD" section. Run \`npm run release:prepare -- ${version}\`.`,
		);
	} else if (entries.length > 1) {
		errors.push(`The changelog has ${entries.length} sections for ${version}; keep one.`);
	} else {
		const [entry] = entries;
		if (!/^- \d{4}-\d{2}-\d{2}$/.test(entry.rest)) {
			errors.push(
				`The changelog heading for ${version} needs a date: "## [${version}] - YYYY-MM-DD".`,
			);
		}
		if (!hasEntries(entry)) {
			errors.push(`The changelog section for ${version} has no entries.`);
		}
		const released = sections.filter((s) => SEMVER.test(s.name));
		if (released[0] !== entry) {
			errors.push(
				`The changelog section for ${version} must be the newest release section (found ${released[0].name} above it).`,
			);
		}
	}
	const unreleased = sections.find((s) => s.name.toLowerCase() === 'unreleased');
	if (unreleased && hasEntries(unreleased)) {
		errors.push(
			`The changelog's [Unreleased] section still has entries; move them into ${version}.`,
		);
	}
	return errors;
}

/** Checks the version against npm. Fails closed if npm can't be reached. */
function checkNpm(name, version) {
	const view = (spec) => {
		try {
			return execSync(`npm view ${spec} version --json`, {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			}).trim();
		} catch (error) {
			if (/E404|404 Not Found/.test(String(error.stderr) + String(error.stdout))) return '';
			throw new Error(
				`Could not ask npm about ${spec}: ${String(error.stderr || error.message).trim()}`,
			);
		}
	};
	const errors = [];
	if (view(`${name}@${version}`)) {
		errors.push(`${name}@${version} is already published. Bump the version.`);
	}
	const latest = view(name).replace(/"/g, '');
	if (latest && SEMVER.test(latest) && compareVersions(version, latest) <= 0) {
		errors.push(`Version ${version} is not newer than the latest published version (${latest}).`);
	}
	return errors;
}

function findChangelog(root) {
	const found = CHANGELOG_CANDIDATES.map((p) => path.join(root, p)).find((p) => fs.existsSync(p));
	if (!found)
		throw new Error(`No changelog found (looked for ${CHANGELOG_CANDIDATES.join(', ')}).`);
	return found;
}

function readJson(file) {
	return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}

function main(argv) {
	const root = process.cwd();
	const tagIndex = argv.indexOf('--tag');
	const tag = tagIndex >= 0 ? argv[tagIndex + 1] : undefined;
	const pkg = readJson(path.join(root, 'package.json'));
	const errors = checkRelease({
		pkg,
		lock: readJson(path.join(root, 'package-lock.json')),
		changelog: fs.readFileSync(findChangelog(root), 'utf8'),
		tag,
	});
	if (argv.includes('--npm') && errors.length === 0)
		errors.push(...checkNpm(pkg.name, pkg.version));

	if (errors.length) {
		console.error(`Release check failed for ${pkg.name}@${pkg.version}:`);
		for (const error of errors) console.error(`  - ${error}`);
		process.exit(1);
	}
	console.log(`Release check passed for ${pkg.name}@${pkg.version}.`);
}

if (require.main === module) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error.message);
		process.exit(1);
	}
}

module.exports = {
	checkRelease,
	checkNpm,
	changelogSections,
	compareVersions,
	findChangelog,
	SEMVER,
};
