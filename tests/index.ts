import { describe } from 'manten';

await describe('git-squash-branch', ({ runTestSuite }) => {
	runTestSuite(import('./specs/squash.js'));
	runTestSuite(import('./specs/pr.js'));
});
