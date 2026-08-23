import spawn, { SubprocessError } from 'nano-spawn';

export const { stringify } = JSON;

export const getCurrentCommitMessage = async (commit: string) => {
	const { stdout } = await spawn('git', ['--no-pager', 'log', '-1', '--pretty=%B', commit]);
	return stdout;
};

export const getCurrentBranchState = async () => {
	const { stdout } = await spawn('git', ['status', '--porcelain=v2', '--branch']);
	const currentBranch = stdout.match(/^# branch\.head (.+)$/m)?.[1];

	if (currentBranch === '(detached)') {
		throw new Error('Cannot squash from a detached HEAD');
	}

	const currentCommit = stdout.match(/^# branch\.oid (.+)$/m)?.[1];

	if (!currentBranch || !currentCommit || currentCommit === '(initial)') {
		throw new Error('Cannot determine the current branch and commit');
	}

	return {
		currentBranch,
		currentCommit,
	};
};

export const createCommit = async (
	sourceCommit: string,
	message: string,
	parentCommit?: string,
) => {
	const args = ['commit-tree', `${sourceCommit}^{tree}`];

	if (parentCommit) {
		args.push('-p', parentCommit);
	}

	args.push('-m', message);
	const { stdout } = await spawn('git', args);
	return stdout;
};

export const getRemoteDefaultBranch = async (remote: string) => {
	const { stdout } = await spawn('git', ['ls-remote', '--symref', remote, 'HEAD']);
	return stdout.match(/^ref: refs\/heads\/(.+)\tHEAD$/m)?.[1];
};

export const assertCleanTree = async () => {
	const { stdout } = await spawn('git', ['status', '--porcelain']).catch((error) => {
		if (error instanceof SubprocessError && error.stderr.includes('not a git repository')) {
			throw new Error('Not in a git repository');
		}

		throw error;
	});

	if (stdout) {
		throw new Error('Working tree is not clean');
	}
};
