import { chmod } from 'node:fs/promises';
import path from 'node:path';
import { createFixture } from 'fs-fixture';
import spawn, { SubprocessError, type Options, type Subprocess } from 'nano-spawn';

const squashPath = path.resolve('dist/index.mjs');

type Git = (command: string, args?: string[], options?: Options) => Subprocess;

const createGit = (cwd: string): Git => (
	(command, args, options) => spawn('git', [command, ...(args ?? [])], {
		cwd,
		...options,
	})
);

const configureGit = async (git: Git) => {
	await git('config', ['user.name', 'name']);
	await git('config', ['user.email', 'email']);
};

export const createRepository = async () => {
	const fixture = await createFixture({
		file: '',
	});

	const git = createGit(fixture.path);
	await git('init', ['--initial-branch=master']);
	await configureGit(git);

	return {
		fixture,
		git,
	};
};

export const createBareRepository = async () => {
	const fixture = await createFixture({});

	const repositoryPath = path.join(fixture.path, 'origin.git');
	await spawn('git', ['init', '--bare', '--initial-branch=master', repositoryPath]);
	return {
		fixture,
		repositoryPath,
	};
};

export const cloneRepository = async (repositoryPath: string) => {
	const fixture = await createFixture({});

	await spawn('git', ['clone', repositoryPath, fixture.path]);
	const git = createGit(fixture.path);
	await configureGit(git);

	return {
		fixture,
		git,
	};
};

type PullRequest = {
	title: string;
	number: number;
	baseRefName: string;
	headRefName: string;
	headRefOid: string;
	url: string;
	isCrossRepository: boolean;
};

export const createGh = async (pullRequest: PullRequest) => {
	const fixture = await createFixture({
		gh: `#!/usr/bin/env node
const [command, subcommand] = process.argv.slice(2);

if (command === '--version') {
	console.log('gh version 2.0.0 (https://github.com/cli/cli/releases/tag/v2.0.0)');
} else if (command === 'pr' && subcommand === 'view') {
	console.log(${JSON.stringify(JSON.stringify(pullRequest))});
} else {
	process.exitCode = 1;
}
`,
		'gh.cmd': '@node "%~dp0gh" %*\r\n',
	});
	await chmod(path.join(fixture.path, 'gh'), 0o755);

	return {
		fixture,
		env: {
			PATH: `${fixture.path}${path.delimiter}${process.env.PATH}`,
		},
	};
};

export const runCli = (args: string[], cwd: string, options?: Options) => spawn(squashPath, args, {
	cwd,
	...options,
});

export const getSubprocessError = (subprocess: Subprocess) => subprocess.then(
	() => {
		throw new Error('Expected the subprocess to fail');
	},
).catch((error) => {
	if (error instanceof SubprocessError) {
		return error;
	}

	throw error;
});
