// Host-side git operations on the deploy target repo. Adds are scoped to the
// deployed path — this module never stages anything it didn't create.

const { execFileSync } = require('child_process');

function git(repoPath, args, opts = {}) {
  return execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf-8', ...opts });
}

function assertRepoReady(repoPath, branch) {
  let head;
  try {
    head = git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  } catch {
    throw new Error(`Not a git repository: ${repoPath}`);
  }
  if (head !== branch) {
    throw new Error(
      `Deploy repo is on branch "${head}" but config expects "${branch}". ` +
      'Switch branches or update deploy.branch in config.operator.json.'
    );
  }
  // Never mix our commit with someone else's staged work
  const staged = git(repoPath, ['diff', '--cached', '--name-only']).trim();
  if (staged) {
    throw new Error(`Deploy repo has staged changes not made by this deploy:\n${staged}\nCommit or unstage them first.`);
  }
}

// Author stays the repo's own git config — Claude is a collaborator, not the author
function commitAndPush(repoPath, { pathspec, subject, coAuthor, branch, push = true, log = console.log }) {
  git(repoPath, ['add', '--', pathspec]);
  const staged = git(repoPath, ['diff', '--cached', '--name-only']).trim();
  if (!staged) {
    log('[git] nothing changed, skipping commit');
    return { committed: false, pushed: false };
  }
  git(repoPath, ['commit', '-m', `${subject}\n\nCo-Authored-By: ${coAuthor}`]);
  log(`[git] committed: ${subject}`);
  if (push) {
    log(`[git] pushing to origin/${branch}…`);
    execFileSync('git', ['-C', repoPath, 'push', 'origin', branch], { stdio: ['ignore', 'inherit', 'inherit'] });
    log('[git] pushed — website CI will deploy shortly');
  }
  return { committed: true, pushed: push };
}

module.exports = { git, assertRepoReady, commitAndPush };
