# git-squash-branch

Script to squash commits in a Git branch or pull-request.

<sub>Support this project by ⭐️ starring and sharing it. [Follow me](https://github.com/privatenumber) to see what other cool projects I'm working on! ❤️</sub>

## Why?
To consolidate the commits in a branch to a single commit for a cleaner Git history.

Examples:
1. Squashing WIP commits in the default branch of a new repository. I personally do this often when starting a new project.

2. Squashing your PR's commits when [squash merging](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests) is disabled on the repository you're contributing to.

3. Squashing your PR's commits when your PR is deployed through another PR (e.g. in a batched PRs, GitHub cannot squash individual PRs in the batch)

## Usage

### Squash current branch
Run the script with [npx](https://nodejs.dev/learn/the-npx-nodejs-package-runner) from the repository branch you want to squash:
```
npx git-squash-branch
```

#### Example: squashing new commits in current branch compared to base branch
```sh
# You must be inside the branch you want to squash
$ git checkout branch-to-squash

$ npx git-squash-branch --base develop --message "feat: my new feature"

Successfully squashed with message:
feat: my new feature

To revert back to the original commit:
git reset --hard 4f0432ffd1

# Force push the squashed branch to remote
$ git push --force
```

#### Example: squashing all commits in current branch
```sh
$ git checkout main

$ npx git-squash-branch --base main --message "feat: init"

Current branch is the same as base branch. Squashing all commits to root.
Successfully squashed with message:
feat: init

To revert back to the original commit:
git reset --hard 4f0432ffd1

# Force push the squashed branch to remote
$ git push --force
```

### Squash PR
> ⚠️ Requires [GitHub CLI](https://cli.github.com/) to be installed

From inside the repository directory, pass in the PR number:
```
npx git-squash-branch pr <pr-number>
```

It will squash the PR branch into a single commit and force push it back to the PR branch.

#### Example
```sh
# You must be inside the repository for gh to fetch the PR
$ cd my-repo

$ npx git-squash-branch pr 1234

✔ Successfully squashed PR 1234 with message:
feat: my PR title

To revert the PR back to the original commit:
git push -f origin 4f0432ffd1:pr-branch-name
```

> Note: This command will not update the PR with the latest base branch.

### Manual
```
Usage:
  git-squash-branch [flags...]
  git-squash-branch <command>

Commands:
  pr

Flags:
  -b, --base <string>
  Base branch to compare against. If not specified, will try to
  detect it from remote "origin".

  -h, --help
  Show help

  -m, --message <string>
  Message for the squash commit (defaults to last commit message)

  -r, --remote <string>
  Remote to fetch from (default: "origin")

  --version
  Show version
```

## What does this script do?

Basically runs these commands, derived from this [StackOverflow answer](https://stackoverflow.com/a/25357146):
```sh
$ git reset --soft $(git merge-base <base-branch> $(git branch --show-current))
$ git commit -m <message>
```

On top of that, it adds extra features such as:
- Tries to automatically detect the base branch based on the `origin` remote
- Defaults to using the commit message from the last commit, if not provided
- Logs the current commit hash in case you want to revert the squash
