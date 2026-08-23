import { cli } from 'cleye';
import { spinner, confirm } from '@clack/prompts';
import { green, red, gray } from 'ansis';
import spawn, { SubprocessError } from 'nano-spawn';
import packageJson from '../package.json';
import {
	stringify,
	assertCleanTree,
	getCurrentCommitMessage,
	getCurrentBranchState,
	getRemoteDefaultBranch,
	createCommit,
} from './utils.js';

const argv = cli({
	name: packageJson.name,

	version: packageJson.version,

	flags: {
		remote: {
			type: String,
			alias: 'r',
			description: 'Remote to fetch from',
			default: 'origin',
		},
		base: {
			type: String,
			alias: 'b',
			description: 'Base branch to compare against. If not specified, will try to detect it from the selected remote.',
		},
		message: {
			type: String,
			alias: 'm',
			description: 'Message for the squash commit (defaults to last commit message)',
		},
	},

	help: {
		description: packageJson.description,
	},

	commands: {
		pr: () => import('./commands/pr.js'),
	},

	strictFlags: true,

	parameters: [
		'[input]',
	],
});

(async () => {
	if (argv.command) {
		await argv.runCommand(argv.flags.remote);
		return;
	}

	if (argv._.input) {
		throw new Error(`Unknown command: ${argv._.input}`);
	}

	await assertCleanTree();

	let { base: baseBranch } = argv.flags;

	if (!baseBranch) {
		const s = spinner();

		s.start(`Detecting default branch from remote ${stringify(argv.flags.remote)}`);

		const detectedDefaultBranch = await getRemoteDefaultBranch(argv.flags.remote);

		s.stop(`Detected base branch: ${detectedDefaultBranch}`);

		if (detectedDefaultBranch) {
			const confirmed = await confirm({
				message: `Squash commits compared to ${stringify(detectedDefaultBranch)}?`,
			});

			if (confirmed) {
				baseBranch = detectedDefaultBranch;
			}
		}
	}

	if (!baseBranch) {
		throw new Error('Missing base branch. Specify it manually with the --base flag.');
	}

	const { currentBranch, currentCommit } = await getCurrentBranchState();
	const message = argv.flags.message ?? await getCurrentCommitMessage(currentCommit);
	let newCommit: string;

	if (baseBranch === currentBranch) {
		console.log('Current branch is the same as base branch. Squashing all commits to root.');
		newCommit = await createCommit(currentCommit, message);
	} else {
		await spawn('git', [
			'fetch',
			argv.flags.remote,
			`refs/heads/${baseBranch}:refs/remotes/${argv.flags.remote}/${baseBranch}`,
		]);
		const { stdout: bestCommonAncestor } = await spawn('git', ['merge-base', `${argv.flags.remote}/${baseBranch}`, currentCommit]);
		newCommit = await createCommit(currentCommit, message, bestCommonAncestor);
	}

	await spawn('git', ['update-ref', `refs/heads/${currentBranch}`, newCommit, currentCommit]);

	console.log(
		`${green('✔')} Successfully squashed!`
		+ `\nCommit: ${gray(newCommit)}`
		+ '\nMessage:'
		+ `\n${gray(message.trim())}\n`
		+ '\nTo revert back to the original commit:'
		+ `\n${gray(`git reset --hard ${currentCommit}`)}\n`
		+ '\nIf you use a remote, force push only if it has not changed since your last fetch:'
		+ `\n${gray(`git push --force-with-lease ${argv.flags.remote} ${currentBranch}`)}`,
	);
})().catch((error) => {
	const message = error instanceof SubprocessError && error.stderr
		? `${error.message}\n${error.stderr}`
		: error.message;
	console.error(`${red('✖')} ${message}`);
	process.exitCode = 1;
});
