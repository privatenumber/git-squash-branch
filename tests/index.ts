import path from 'path';
import { test, expect } from 'manten';
import { createFixture } from 'fs-fixture';
import { execa, type Options } from 'execa';

const squashPath = path.resolve('dist/cli.cjs');

const createGit = async (cwd: string) => {
	await execa(
		'git',
		[
			'init',
			// In case of different default branch name
			'--initial-branch=master',
		],
		{ cwd },
	);

	return (
		command: string,
		args?: string[],
		options?: Options,
	) => (
		execa(
			'git',
			[command, ...(args || [])],
			{
				cwd,
				...options,
			},
		)
	);
};

test('squashes branch', async () => {
	const fixture = await createFixture({
		file: '',
	});

	const git = await createGit(fixture.path);

	await git('add', ['file']);

	await git('commit', ['-am', 'commit-1']);

	await git('checkout', ['-b', 'branch-a']);

	fixture.writeFile('file', 'foo');

	await git('commit', ['-am', 'commit-2']);

	fixture.writeFile('file', 'bar');

	await git('commit', ['-am', 'commit-3']);

	await execa(squashPath, ['-b', 'master', '-m', 'squash!'], {
		cwd: fixture.path,
	});

	const { stdout } = await git('log');

	expect(stdout).toMatch('commit-1');
	expect(stdout).not.toMatch('commit-2');
	expect(stdout).not.toMatch('commit-3');
	expect(stdout).toMatch('squash!');

	await fixture.rm();
});
