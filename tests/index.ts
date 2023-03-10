import path from 'path';
import { test, expect } from 'manten';
import { createFixture } from 'fs-fixture';
import { execa, type Options } from 'execa';

const squashPath = path.resolve('dist/index.cjs');

const createGit = async (cwd: string) => {
	const git = (
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

	await git(
		'init',
		[
			// In case of different default branch name
			'--initial-branch=master',
		],
	);

	await git('config', ['user.name', 'name']);
	await git('config', ['user.email', 'email']);

	return git;
};

test('squashes branch', async () => {
	const fixture = await createFixture({
		file: '',
	});

	const git = await createGit(fixture.path);

	await git('add', ['file']);
	await git('commit', ['-am', 'commit-1']);

	await git('checkout', ['-b', 'branch-a']);

	await fixture.writeFile('file', 'foo');
	await git('commit', ['-am', 'commit-2']);

	await fixture.writeFile('file', 'bar');
	await git('commit', ['-am', 'commit-3']);

	const { stdout: logBefore } = await git('log');
	expect(logBefore).toMatch('commit-1');
	expect(logBefore).toMatch('commit-2');
	expect(logBefore).toMatch('commit-3');

	await execa(squashPath, ['-b', 'master', '-m', 'squash!'], {
		cwd: fixture.path,
	});

	const { stdout: logAfter } = await git('log');
	expect(logAfter).toMatch('commit-1');
	expect(logAfter).not.toMatch('commit-2');
	expect(logAfter).not.toMatch('commit-3');
	expect(logAfter).toMatch('squash!');

	await fixture.rm();
});

test('squashes branch to root', async () => {
	const fixture = await createFixture({
		file: '',
	});

	const git = await createGit(fixture.path);

	await git('add', ['file']);
	await git('commit', ['-am', 'commit-1']);

	await fixture.writeFile('file', 'foo');
	await git('commit', ['-am', 'commit-2']);

	await fixture.writeFile('file', 'bar');
	await git('commit', ['-am', 'commit-3']);

	const { stdout: logBefore } = await git('log');
	expect(logBefore).toMatch('commit-1');
	expect(logBefore).toMatch('commit-2');
	expect(logBefore).toMatch('commit-3');

	await execa(squashPath, ['-b', 'master', '-m', 'squash!'], {
		cwd: fixture.path,
	});

	const { stdout: logAfter } = await git('log');
	expect(logAfter).not.toMatch('commit-1');
	expect(logAfter).not.toMatch('commit-2');
	expect(logAfter).not.toMatch('commit-3');
	expect(logAfter).toMatch('squash!');

	await fixture.rm();
});
