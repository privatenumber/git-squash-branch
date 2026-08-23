import { describe } from 'manten';

await describe('git-squash-branch', async () => {
	await Promise.all([
		import('./specs/squash.js'),
		import('./specs/pr.js'),
	]);
});
