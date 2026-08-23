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
