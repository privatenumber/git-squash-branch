import { chmod } from 'node:fs/promises';
import path from 'node:path';
import { execa, type ExecaChildProcess, type Options } from 'execa';
import { createFixture } from 'fs-fixture';

const squashPath = path.resolve('dist/index.cjs');

type Git = (command: string, args?: string[], options?: Options) => ExecaChildProcess;

const createGit = (cwd: string): Git => (
	(command, args, options) => execa('git', [command, ...(args ?? [])], {
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
	await execa('git', ['init', '--bare', '--initial-branch=master', repositoryPath]);
	return {
		fixture,
		repositoryPath,
	};
};

export const cloneRepository = async (repositoryPath: string) => {
	const fixture = await createFixture({});

	await execa('git', ['clone', repositoryPath, fixture.path]);
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
	});
	await chmod(path.join(fixture.path, 'gh'), 0o755);

	return {
		fixture,
		env: {
			PATH: `${fixture.path}${path.delimiter}${process.env.PATH}`,
		},
	};
};

export const runCli = (args: string[], cwd: string, options?: Options) => execa(squashPath, args, {
	cwd,
	...options,
});
