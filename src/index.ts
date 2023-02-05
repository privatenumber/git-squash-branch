import { execa } from 'execa';
import { cli } from 'cleye';
import prompts from 'prompts';
import { green, red, gray } from 'kolorist';
import { version, description } from '../package.json';
import {
	stringify,
	assertCleanTree,
	getCurrentCommitMessage,
	getRemoteDefaultBranch,
	squash,
} from './utils.js';
import { pr } from './pr.js';

cli({
	name: 'git-squash-branch',

	version,

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
		description,
	},

	commands: [
		pr,
	],
}, (argv) => {
	(async () => {
		await assertCleanTree();

		let { base: baseBranch } = argv.flags;
		if (!baseBranch) {
			const detectedDefaultBranch = await getRemoteDefaultBranch(argv.flags.remote);

			if (detectedDefaultBranch) {
				const response = await prompts({
					type: 'confirm',
					name: 'confirmed',
					message: `Use branch ${stringify(detectedDefaultBranch)}? (y/n)`,
				});

				if (response.confirmed) {
					baseBranch = detectedDefaultBranch;
				}
			}
		}

		if (!baseBranch) {
			throw new Error('Missing base branch. Specify it manually with the --base flag.');
		}

		const { stdout: currentBranch } = await execa('git', ['branch', '--show-current']);
		const { stdout: currentCommit } = await execa('git', ['rev-parse', 'HEAD']);
		const message = argv.flags.message ?? await getCurrentCommitMessage();

		if (baseBranch === currentBranch) {
			console.log('Current branch is the same as base branch. Squashing all commits to root.');
			const { stdout: orphanCommit } = await execa('git', ['commit-tree', 'HEAD^{tree}', '-m', message]);
			await execa('git', ['reset', orphanCommit]);
		} else {
			await squash(baseBranch, message);
		}

		console.log(
			`${green('✔')} Successfully squashed with message:`
			+ `\n${gray(message)}\n`
			+ '\nTo revert back to the original commit:'
			+ `\n${gray(`git reset --hard ${currentCommit}`)}\n`
			+ '\nIf you use a remote, don\'t forget to force push:'
			+ `\n${gray(`git push --force origin ${currentBranch}`)}`,
		);
	})().catch((error) => {
		console.error(`${red('✖')} ${error.message}`);
		process.exitCode = 1;
	});
});
