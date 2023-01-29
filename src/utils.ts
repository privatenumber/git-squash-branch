import { execa } from 'execa';

export const { stringify } = JSON;

export const getCurrentCommitMessage = async () => {
	const { stdout } = await execa('git', ['--no-pager', 'log', '-1', '--pretty=%B']);
	return stdout;
};

export const getRemoteDefaultBranch = async (remote: string) => {
	const { stdout } = await execa(
		'git',
		['remote', 'show', remote],
		{
			// In case non-English locale
			env: { LC_ALL: 'C' },
			reject: false,
		},
	);

	return stdout.match(/ {2}HEAD branch: (.*)/)?.[1];
};

export const assertCleanTree = async () => {
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

export const squash = async (
	baseBranch: string,
	message: string,
) => {
	/**
	 * Instead of soft-resetting to the latest base branch (e.g. origin/master),
	 * we to reset the best common ancestor between the base & current branch.
	 *
	 * If we soft-reset to origin/master, it's possible changes made in origin/master
	 * to irrelevant files will be reverted back to the state of the current branch.
	 */
	const {
		stdout: bestCommonAncestor,
	} = await execa('git', ['merge-base', baseBranch, 'HEAD']);

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
};
