import path from 'node:path';
import { expect, testSuite } from 'manten';
import {
	cloneRepository,
	createBareRepository,
	createRepository,
	getSubprocessError,
	runCli,
} from '../utils/git.js';

export default testSuite(({ describe }) => {
	describe('squash', ({ test }) => {
		test('squashes branch', async () => {
			const { fixture, git } = await createRepository();
			const remote = await createBareRepository();

			await git('add', ['file']);
			await git('commit', ['-am', 'commit-1']);
			await git('remote', ['add', 'origin', remote.repositoryPath]);
			await git('push', ['-u', 'origin', 'master']);
			await git('checkout', ['-b', 'branch-a']);
			await fixture.writeFile('file', 'foo');
			await git('commit', ['-am', 'commit-2']);
			await fixture.writeFile('file', 'bar');
			await git('commit', ['-am', 'commit-3']);

			await runCli(['-b', 'master', '-m', 'squash!'], fixture.path);

			const { stdout: log } = await git('log');
			expect(log).toMatch('commit-1');
			expect(log).not.toMatch('commit-2');
			expect(log).not.toMatch('commit-3');
			expect(log).toMatch('squash!');
			await fixture.rm();
			await remote.fixture.rm();
		});

		test('squashes branch to root', async () => {
			const { fixture, git } = await createRepository();

			await git('add', ['file']);
			await git('commit', ['-am', 'commit-1']);
			await fixture.writeFile('file', 'foo');
			await git('commit', ['-am', 'commit-2']);
			await fixture.writeFile('file', 'bar');
			await git('commit', ['-am', 'commit-3']);

			await runCli(['-b', 'master', '-m', 'squash!'], fixture.path);

			const { stdout: log } = await git('log');
			expect(log).not.toMatch('commit-1');
			expect(log).not.toMatch('commit-2');
			expect(log).not.toMatch('commit-3');
			expect(log).toMatch('squash!');
			await fixture.rm();
		});

		test('rejects untracked files', async () => {
			const { fixture, git } = await createRepository();

			await git('add', ['file']);
			await git('commit', ['-am', 'commit-1']);
			await git('checkout', ['-b', 'branch-a']);
			await fixture.writeFile('file', 'branch');
			await git('commit', ['-am', 'commit-2']);
			const { stdout: head } = await git('rev-parse', ['HEAD']);
			await fixture.writeFile('untracked', '');

			const error = await getSubprocessError(runCli(['-b', 'master', '-m', 'squash!'], fixture.path));

			expect(error.stderr).toMatch('Working tree is not clean');
			const { stdout: currentHead } = await git('rev-parse', ['HEAD']);
			expect(currentHead).toBe(head);
			await fixture.rm();
		});

		test('uses the remote base branch', async () => {
			const remote = await createRepository();
			const remotePath = path.join(remote.fixture.path, 'origin.git');
			await remote.git('init', ['--bare', '--initial-branch=master', remotePath]);
			await remote.git('add', ['file']);
			await remote.git('commit', ['-am', 'base']);
			await remote.git('remote', ['add', 'origin', remotePath]);
			await remote.git('push', ['-u', 'origin', 'master']);

			const { fixture, git } = await cloneRepository(remotePath);
			await fixture.writeFile('file', 'local-base');
			await git('commit', ['-am', 'local-base']);
			await git('checkout', ['-b', 'branch-a']);
			await fixture.writeFile('file', 'branch');
			await git('commit', ['-am', 'branch']);

			await runCli(['-b', 'master', '-m', 'squash!'], fixture.path);

			const { stdout: log } = await git('log');
			expect(log).toMatch('base');
			expect(log).not.toMatch('local-base');
			expect(log).not.toMatch('branch');
			expect(log).toMatch('squash!');
			await remote.fixture.rm();
			await fixture.rm();
		});

		test('restores the branch when the squash commit fails', async () => {
			const { fixture, git } = await createRepository();
			const remote = await createBareRepository();

			await git('add', ['file']);
			await git('commit', ['-am', 'commit-1']);
			await git('remote', ['add', 'origin', remote.repositoryPath]);
			await git('push', ['-u', 'origin', 'master']);
			await git('checkout', ['-b', 'branch-a']);
			await fixture.writeFile('file', 'branch');
			await git('commit', ['-am', 'commit-2']);
			const { stdout: head } = await git('rev-parse', ['HEAD']);
			await git('config', ['user.name', '']);
			await git('config', ['user.email', '']);

			await getSubprocessError(runCli(['-b', 'master', '-m', 'squash!'], fixture.path));

			const { stdout: currentHead } = await git('rev-parse', ['HEAD']);
			const { stdout: status } = await git('status', ['--porcelain']);
			expect(currentHead).toBe(head);
			expect(status).toBe('');
			await fixture.rm();
			await remote.fixture.rm();
		});
	});
});
