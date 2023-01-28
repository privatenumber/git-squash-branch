# git-squash-branch

Script to squash the commits in the current Git branch.

<sub>Support this project by ⭐️ starring and sharing it. [Follow me](https://github.com/privatenumber) to see what other cool projects I'm working on! ❤️</sub>

## Usage

Run the script with [npx](https://nodejs.dev/learn/the-npx-nodejs-package-runner) from the branch you want to squash:
```sh
$ npx git-squash-branch --base develop --message "feat: my new feature"

Successfully squashed with message:
feat: my new feature

To revert back to the original commit:
git reset --hard 4f0432ffd1

$ git push --force
```

### Manual
```
Usage:
  git-squash-branch [flags...]

Flags:
  -b, --base <string>
  Base branch to compare against. If not specified, will try to detect it from
  remote "origin".

  -h, --help
  Show help

  -m, --message <string>
  Message for the squash commit. (Defaults to last commit message.)

  --version
  Show version
```

## FAQ
### Why?
To consolidate the commits in your branch into a single commit for a cleaner Git history.

Usually, squashing can be easily done [on GitHub when merging pull-requests](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests).

However, there are cases where it cannot be used and you may prefer to manually squash your branch.

Examples:
1. Squash merging is disabled for your repository

2. When multiple PRs are merged together in a batched PR via merge-commit, GitHub does not support squashing the individual PRs.

### What does this script do?

Basically runs these commands, derived from this [StackOveflow answer](https://stackoverflow.com/a/25357146):
```sh
$ git reset --soft $(git merge-base <base-branch> $(git branch --show-current))
$ git commit -m <message>
```

On top of that, it adds some features such as:
- Tries to automatically detect the base branch based on the `origin` remote
- Defaults to using the commit message from the last commit, if not provided
- Logs the current commit hash in case you want to revert the squash
