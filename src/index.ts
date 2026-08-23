import { execa } from 'execa';
import { cli } from 'cleye';
import { spinner, confirm } from '@clack/prompts';
import { green, red, gray } from 'kolorist';
import packageJson from '../package.json';
import {
	stringify,
	assertCleanTree,
	getCurrentCommitMessage,
	getCurrentCommitHash,
	getRemoteDefaultBranch,
	squash,
} from './utils.js';
import { pr } from './pr.js';

cli({
	name: 'git-squash-branch',

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
			description: 'Base branch to compare against. If not specified, will try to detect it from remote "origin".',
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

	commands: [
		pr,
	],
}, (argv) => {
	(async () => {
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

		const { stdout: currentBranch } = await execa('git', ['branch', '--show-current']);
		const currentCommit = await getCurrentCommitHash();
		const message = argv.flags.message ?? await getCurrentCommitMessage();

		if (baseBranch === currentBranch) {
			console.log('Current branch is the same as base branch. Squashing all commits to root.');
			const { stdout: orphanCommit } = await execa('git', ['commit-tree', 'HEAD^{tree}', '-m', message]);
			await execa('git', ['reset', orphanCommit]);
		} else {
			await execa('git', [
				'fetch',
				argv.flags.remote,
				`refs/heads/${baseBranch}:refs/remotes/${argv.flags.remote}/${baseBranch}`,
			]);
			await squash(`${argv.flags.remote}/${baseBranch}`, message);
		}

		const newCommit = await getCurrentCommitHash();

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
		console.error(`${red('✖')} ${error.message}`);
		process.exitCode = 1;
	});
});
