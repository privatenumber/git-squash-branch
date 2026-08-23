import path from 'node:path';
import { expect, testSuite } from 'manten';
import {
	cloneRepository,
	createBareRepository,
	createGh,
	createRepository,
	getSubprocessError,
	runCli,
} from '../utils/git.js';

const createPullRequest = (headRefOid: string, isCrossRepository = false) => ({
	title: 'Pull request',
	number: 1,
	baseRefName: 'master',
	headRefName: 'branch-a',
	headRefOid,
	url: 'https://github.com/example/repository/pull/1',
	isCrossRepository,
});

const createPullRequestRepository = async () => {
	const remote = await createBareRepository();
	const author = await createRepository();

	await author.git('add', ['file']);
	await author.git('commit', ['-am', 'base']);
	await author.git('remote', ['add', 'origin', remote.repositoryPath]);
	await author.git('push', ['-u', 'origin', 'master']);
	await author.git('checkout', ['-b', 'branch-a']);
	await author.fixture.writeFile('file', 'branch');
	await author.git('commit', ['-am', 'branch']);
	await author.git('push', ['-u', 'origin', 'branch-a']);

	return {
		remote,
		author,
	};
};

export default testSuite(({ describe }) => {
	describe('pr', ({ test }) => {
		test('reports installation instructions when GitHub CLI is unavailable', async () => {
			const { fixture } = await createRepository();
			const error = await getSubprocessError(runCli(['pr', '1'], fixture.path, {
				env: {
					PATH: path.dirname(process.execPath),
				},
			}));

			expect(error.stderr).toMatch('You must have GitHub CLI installed to use this command: https://cli.github.com');
			await fixture.rm();
		});

		test('squashes the remote branch without changing local state', async () => {
			const { remote, author } = await createPullRequestRepository();
			const runner = await cloneRepository(remote.repositoryPath);
			const { stdout: currentHead } = await runner.git('rev-parse', ['HEAD']);
			const { stdout: prHead } = await author.git('rev-parse', ['branch-a']);
			const { stdout: prTree } = await author.git('rev-parse', ['branch-a^{tree}']);
			const { stdout: base } = await author.git('rev-parse', ['master']);
			await runner.fixture.writeFile('file', 'local change');
			await runner.fixture.writeFile('untracked', '');
			const gh = await createGh(createPullRequest(prHead));

			await runCli(['pr', '1'], runner.fixture.path, {
				env: gh.env,
			});

			const { stdout: status } = await runner.git('status', ['--porcelain']);
			const { stdout: head } = await runner.git('rev-parse', ['HEAD']);
			const { stdout: currentBranch } = await runner.git('branch', ['--show-current']);
			await runner.git('fetch', ['origin', 'branch-a:refs/remotes/origin/branch-a']);
			const { stdout: squashedHead } = await runner.git('rev-parse', ['origin/branch-a']);
			const { stdout: squashedTree } = await runner.git('rev-parse', ['origin/branch-a^{tree}']);
			const { stdout: squashedParent } = await runner.git('rev-parse', ['origin/branch-a^']);
			expect(status).toStrictEqual(' M file\n?? untracked');
			expect(head).toBe(currentHead);
			expect(currentBranch).toBe('master');
			expect(squashedHead).not.toBe(prHead);
			expect(squashedTree).toBe(prTree);
			expect(squashedParent).toBe(base);
			await author.fixture.rm();
			await remote.fixture.rm();
			await runner.fixture.rm();
			await gh.fixture.rm();
		});

		test('uses the remote before the PR command', async () => {
			const { remote, author } = await createPullRequestRepository();
			const upstream = await createBareRepository();
			await author.git('remote', ['add', 'upstream', upstream.repositoryPath]);
			await author.git('push', ['upstream', 'master', 'branch-a']);
			const runner = await cloneRepository(remote.repositoryPath);
			await runner.git('remote', ['add', 'upstream', upstream.repositoryPath]);
			const { stdout: head } = await author.git('rev-parse', ['branch-a']);
			const gh = await createGh(createPullRequest(head));

			await runCli(['--remote', 'upstream', 'pr', '1'], runner.fixture.path, {
				env: gh.env,
			});

			const { stdout: originBranch } = await runner.git('ls-remote', ['origin', 'refs/heads/branch-a']);
			const { stdout: upstreamBranch } = await runner.git('ls-remote', ['upstream', 'refs/heads/branch-a']);
			expect(originBranch).toMatch(head);
			expect(upstreamBranch).not.toMatch(head);
			await author.fixture.rm();
			await remote.fixture.rm();
			await upstream.fixture.rm();
			await runner.fixture.rm();
			await gh.fixture.rm();
		});

		test('rejects fork pull requests before mutating Git state', async () => {
			const { remote, author } = await createPullRequestRepository();
			const runner = await cloneRepository(remote.repositoryPath);
			const { stdout: head } = await author.git('rev-parse', ['branch-a']);
			await runner.git('update-ref', ['-d', 'refs/remotes/origin/branch-a']);
			const gh = await createGh(createPullRequest(head, true));

			const error = await getSubprocessError(runCli(['pr', '1'], runner.fixture.path, {
				env: gh.env,
			}));

			expect(error.stderr).toMatch('Fork pull requests are not supported');
			const { stdout: currentBranch } = await runner.git('branch', ['--show-current']);
			await getSubprocessError(runner.git('show-ref', ['--verify', '--quiet', 'refs/remotes/origin/branch-a']));
			const { stdout: remoteBranch } = await runner.git('ls-remote', ['origin', 'refs/heads/branch-a']);
			expect(currentBranch).toBe('master');
			expect(remoteBranch).toMatch(head);
			await author.fixture.rm();
			await remote.fixture.rm();
			await runner.fixture.rm();
			await gh.fixture.rm();
		});

		test('keeps a branch unchanged when its force-with-lease is stale', async () => {
			const { remote, author } = await createPullRequestRepository();
			const runner = await cloneRepository(remote.repositoryPath);
			const { stdout: initialHead } = await author.git('rev-parse', ['branch-a']);
			const racing = await cloneRepository(remote.repositoryPath);
			await racing.git('checkout', ['-b', 'branch-a', 'origin/branch-a']);
			await racing.fixture.writeFile('file', 'racing');
			await racing.git('commit', ['-am', 'racing']);
			await racing.git('push', ['origin', 'branch-a']);
			const { stdout: racingHead } = await racing.git('rev-parse', ['HEAD']);
			const gh = await createGh(createPullRequest(initialHead));

			const error = await getSubprocessError(runCli(['pr', '1'], runner.fixture.path, {
				env: gh.env,
			}));

			expect(error.stderr).toMatch('stale info');
			const { stdout: currentBranch } = await runner.git('branch', ['--show-current']);
			const { stdout: temporaryBranches } = await runner.git('branch', ['--list', 'master_*']);
			const { stdout: remoteBranch } = await runner.git('ls-remote', ['origin', 'refs/heads/branch-a']);
			expect(currentBranch).toBe('master');
			expect(temporaryBranches).toBe('');
			expect(remoteBranch).toMatch(racingHead);
			await author.fixture.rm();
			await remote.fixture.rm();
			await runner.fixture.rm();
			await racing.fixture.rm();
			await gh.fixture.rm();
		});
	});
});
