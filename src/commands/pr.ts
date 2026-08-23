import { cli } from 'cleye';
import task from 'tasuku';
import { green, gray } from 'ansis';
import spawn, { SubprocessError } from 'nano-spawn';
import terminalLink from 'terminal-link';
import {
	stringify,
	createCommit,
} from '../utils.js';

const assertHasGh = async () => {
	const { stdout } = await spawn('gh', ['--version']).catch(() => ({ stdout: '' }));

	if (!stdout.includes('https://github.com/cli/cli/releases/tag/')) {
		throw new Error('You must have GitHub CLI installed to use this command: https://cli.github.com');
	}
};

const properties = ['title', 'number', 'baseRefName', 'headRefName', 'headRefOid', 'url', 'isCrossRepository'] as const;
type PrData = {
	title: string;
	number: number;
	baseRefName: string;
	headRefName: string;
	headRefOid: string;
	url: string;
	isCrossRepository: boolean;
};

const getPrInfo = async (number: string) => {
	const { stdout } = await spawn('gh', ['pr', 'view', number, '--json', properties.join(',')]);
	return JSON.parse(stdout) as PrData;
};

const throwWithSubprocessOutput = (error: unknown): never => {
	if (error instanceof SubprocessError && error.stderr) {
		throw new Error(`${error.message}\n${error.stderr}`);
	}

	throw error;
};

export default async (parentRemote: string) => {
	const argv = cli({
		parameters: [
			'<number>',
		],
		flags: {
			remote: {
				type: String,
				alias: 'r',
				description: 'Remote to fetch from',
			},
			message: {
				type: String,
				alias: 'm',
				description: 'Message for the squash commit (defaults to PR title)',
			},
		},
	});

	await assertHasGh();

	const remote = argv.flags.remote ?? parentRemote;

	// Can be a number, url, or branch
	const prReference = argv._.number;
	const isNumber = /^\d+$/.test(prReference);

	const fetchedPr = await task(
		`Fetching PR ${isNumber ? '#' : ''}${prReference}`,
		() => getPrInfo(prReference).catch(throwWithSubprocessOutput),
	).clear();

	if (fetchedPr.isCrossRepository) {
		throw new Error('Fork pull requests are not supported because their head branches are not on the selected remote.');
	}

	const {
		baseRefName, headRefName, headRefOid, title, url, number,
	} = fetchedPr;
	const message = argv.flags.message || `${title} (#${number})`;

	await task(
		`Fetching branches from remote ${stringify(remote)}`,
		() => spawn('git', [
			'fetch',
			remote,
			`refs/heads/${baseRefName}:refs/remotes/${remote}/${baseRefName}`,
			`refs/heads/${headRefName}:refs/remotes/${remote}/${headRefName}`,
		]).catch(throwWithSubprocessOutput),
	).clear();

	const squashedHead = await task('Squashing PR', async () => {
		const { stdout: base } = await spawn('git', ['merge-base', `${remote}/${baseRefName}`, `${remote}/${headRefName}`]);
		return createCommit(`${remote}/${headRefName}`, message, base);
	}).clear();

	await task(
		`Pushing to remote ${stringify(remote)}`,
		() => spawn('git', [
			'push',
			'--no-verify',
			`--force-with-lease=refs/heads/${headRefName}:${headRefOid}`,
			remote,
			`${squashedHead}:refs/heads/${headRefName}`,
		]).catch(throwWithSubprocessOutput),
	).clear();

	console.log(
		`${green('✔')} Successfully squashed ${terminalLink(`PR #${number}`, url)} with message:`
		+ `\n${gray(message)}\n`
		+ '\nTo revert the PR back to the original commit:'
		+ `\n${gray(`git push --force-with-lease=refs/heads/${headRefName}:${squashedHead} ${remote} ${headRefOid}:refs/heads/${headRefName}`)}\n`
		+ '\nIf you have the branch locally, hard-reset it to the squashed remote branch:'
		+ `\n${gray(`git checkout ${headRefName} && git reset --hard ${remote}/${headRefName}`)}`,
	);
};
