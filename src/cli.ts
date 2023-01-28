import { execa } from 'execa';
import { cli } from 'cleye';
import prompts from 'prompts';
import { green, red, gray } from 'kolorist';
import { version, description } from '../package.json';

const getCurrentCommit = async () => {
	const { stdout } = await execa('git', ['rev-parse', 'HEAD']);
	return stdout;
};

const getCurrentCommitMessage = async () => {
	const { stdout } = await execa('git', ['--no-pager', 'log', '-1', '--pretty=%B']);
	return stdout;
};

const getCurrentBranch = async () => {
	const { stdout } = await execa('git', ['branch', '--show-current']);
	return stdout;
};

const getBestCommonAncestor = async (baseBranch: string, headBranch: string) => {
	const { stdout } = await execa('git', ['merge-base', baseBranch, headBranch]);
	return stdout;
};

const getRemoteDefaultBranch = async () => {
	const { stdout } = await execa(
		'git',
		['remote', 'show', 'origin'],
		{
			// In case non-English locale
			env: { LC_ALL: 'C' },
			reject: false,
		},
	);

	return stdout.match(/ {2}HEAD branch: (.*)/)?.[1];
};

const assertCleanTree = async () => {
	const { stdout } = await execa('git', ['status', '--porcelain', '--untracked-files=no']).catch((error) => {
		if (error.stderr.includes('not a git repository')) {
			throw new Error('Not in a git repository');
		}

		throw error;
	});

	if (stdout) {
		throw new Error('Working tree is not clean');
	}
};

(async () => {
	const argv = cli({
		name: 'git-squash-branch',

		version,

		flags: {
			base: {
				type: String,
				alias: 'b',
				description: 'Base branch to compare against. If not specified, will try to detect it from remote "origin".',
			},
			message: {
				type: String,
				alias: 'm',
				description: 'Message for the squash commit. (Defaults to last commit message.)',
			},
		},

		help: {
			description,
		},
	});

	await assertCleanTree();

	let { base: baseBranch } = argv.flags;
	if (!baseBranch) {
		const detectedDefaultBranch = await getRemoteDefaultBranch();

		if (detectedDefaultBranch) {
			const response = await prompts({
				type: 'confirm',
				name: 'confirmed',
				message: `Use branch ${JSON.stringify(detectedDefaultBranch)}? (y/n)`,
			});

			if (response.confirmed) {
				baseBranch = detectedDefaultBranch;
			}
		}
	}

	if (!baseBranch) {
		throw new Error('Missing base branch. Specify it manually with the --base flag.');
	}

	const [
		currentCommit,
		message,
	] = await Promise.all([
		getCurrentCommit(),
		argv.flags.message ?? await getCurrentCommitMessage(),
	]);

	/**
	 * Instead of soft-resetting to the latest base branch (e.g. origin/master),
	 * we to reset the best common ancestor between the base & current branch.
	 *
	 * If we soft-reset to origin/master, it's possible changes made in origin/master
	 * to irrelevant files will be reverted back to the state of the current branch.
	 */
	const bestCommonAncestor = await getBestCommonAncestor(baseBranch, await getCurrentBranch());

	/**
	 * Soft reset to move the index back to the common ancestor
	 *
	 * Reset using soft mode so all the changes remain staged,
	 * so we can commit without adding them back.
	 *
	 * Some sources don't use `--soft`, which defaults to `--mixed`,
	 * but mixed mode unstages all changes, and we cannot automatically
	 * stage them back.
	 */
	await execa('git', ['reset', '--soft', bestCommonAncestor]);

	/**
	 * --no-verify to skip pre-commit hooks
	 * Since the code is already committed, we don't need to run them again
	 */
	await execa('git', ['commit', '--no-verify', '--message', message]);

	console.log(
		`${green('✔')} Successfully squashed with message:`
		+ `\n${gray(message)}\n`
		+ 'To revert back to the original commit:'
		+ `\n${gray(`git reset --hard ${currentCommit}`)}`,
	);
})().catch((error) => {
	console.error(`${red('✖')} ${error.message}`);
	process.exit(1);
});
