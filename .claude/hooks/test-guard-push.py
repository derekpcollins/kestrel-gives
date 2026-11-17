#!/usr/bin/env python3
"""Tests for guard-push.py. Run by hand: python3 .claude/hooks/test-guard-push.py

Builds throwaway git repos under /tmp (removed at the end), feeds each command to the hook as
PreToolUse JSON, and checks the exit code: 2 = blocked, 0 = allowed. The hook only inspects the
commands; nothing is pushed. Not run by CI.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guard-push.py")
GIT = ["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
       "-c", "user.name=Test", "-c", "user.email=test@example.invalid"]


def git(cwd, *args):
    subprocess.run(GIT + list(args), cwd=cwd, check=True, capture_output=True)


def setup(root):
    """remote.git (HEAD main) and remote-master.git (HEAD master), plus clones:
    F on feature (tracks origin/feature), M on main, T on tracking (tracks origin/main),
    R on feature in the master repo."""
    paths = {}
    for name, default in (("remote.git", "main"), ("remote-master.git", "master")):
        bare = os.path.join(root, name)
        git(root, "init", "-q", "--bare", "-b", default, bare)
        seed = os.path.join(root, "seed-" + default)
        git(root, "init", "-q", "-b", default, seed)
        git(seed, "commit", "-q", "--allow-empty", "-m", "init")
        git(seed, "branch", "feature")
        git(seed, "remote", "add", "origin", bare)
        git(seed, "push", "-q", "origin", default, "feature")
    for key, remote, branch in (("F", "remote.git", "feature"), ("M", "remote.git", "main"),
                                ("T", "remote.git", "main"), ("R", "remote-master.git", "feature")):
        path = os.path.join(root, key)
        git(root, "clone", "-q", os.path.join(root, remote), path)
        if branch == "feature":
            git(path, "switch", "-q", "feature")
        paths[key] = path
    git(paths["T"], "switch", "-q", "-c", "tracking", "--track", "origin/main")
    return paths


def cases(p):
    F, M, T, R = p["F"], p["M"], p["T"], p["R"]
    out = []
    # The 45 variants from the glob-rule test: 3 prefixes x 15 argument forms, all blocked.
    for pre in ("git push", "git -C %s push" % F, "git -c core.x=y push"):
        for args in ("origin main", "origin main --force", "origin main -f",
                     "origin main --force-with-lease", "-f origin main", "--force origin main",
                     "--force-with-lease origin main", "-u origin main", "origin HEAD:main",
                     "origin HEAD:main --force", "origin HEAD:main -f",
                     "origin HEAD:main --force-with-lease", "--force origin HEAD:main",
                     "origin feature:main -f", "origin main:main"):
            out.append(("45 variants", F, "%s %s" % (pre, args), "deny"))
    deny = [
        # Pushes that never name main
        ("no main named", M, "git push --force"),
        ("no main named", M, "git push"),
        ("no main named", M, "git push origin"),
        ("no main named", M, "git push -u origin HEAD"),
        ("no main named", T, "git push"),
        ("no main named", T, "git push --force-with-lease origin"),
        ("no main named", F, "git push --all -f"),
        ("no main named", F, "git push origin --all"),
        ("no main named", F, "git push --mirror"),
        ("no main named", F, "git -c push.default=matching push"),
        ("no main named", F, "git -c remote.origin.push=refs/heads/feature:refs/heads/main push origin feature"),
        ("no main named", F, "git push origin 'refs/heads/*:refs/heads/*'"),
        ("no main named", M, "git push -u origin \"$(git branch --show-current)\""),
        ("no main named", M, "cd %s && git push" % M),
        ("no main named", F, "git -C %s push -f" % M),
        # Full ref names, +, delete
        ("full ref names", F, "git push origin refs/heads/main --force"),
        ("full ref names", F, "git push origin HEAD:refs/heads/main -f"),
        ("full ref names", F, "git push origin feature:refs/heads/main"),
        ("full ref names", F, "git push origin heads/main"),
        ("full ref names", F, "git push origin +main"),
        ("full ref names", F, "git push origin +HEAD:main"),
        ("full ref names", F, "git push origin :main"),
        ("full ref names", F, "git push origin --delete main"),
        ("full ref names", F, "git push -d origin main"),
        ("full ref names", F, "git push -fd origin main"),
        ("full ref names", F, "git push origin :refs/heads/main"),
        # Quoting
        ("quoted", F, "git push origin \"main\" --force"),
        ("quoted", F, "git push origin 'main'"),
        ("quoted", F, "git push origin \"HEAD:main\""),
        ("quoted", F, "git push origin \"refs/heads/main\" -f"),
        # Options and wrappers before push
        ("wrappers", F, "git --git-dir=%s/.git push origin main" % F),
        ("wrappers", F, "git --work-tree=%s --git-dir=%s/.git push -f origin main" % (F, F)),
        ("wrappers", F, "git --git-dir %s/.git push origin main" % F),
        ("wrappers", M, "git --git-dir=%s/.git push" % M),
        ("wrappers", F, "git --no-pager push origin main"),
        ("wrappers", F, "git -P push origin main --force"),
        ("wrappers", F, "git --exec-path=/usr/libexec/git-core push origin main"),
        ("wrappers", F, "env git push origin main"),
        ("wrappers", F, "env FOO=1 git push -f origin main"),
        ("wrappers", F, "command git push origin main"),
        ("wrappers", F, "/usr/bin/git push origin main"),
        ("wrappers", F, "time git push origin main"),
        ("wrappers", F, "nohup git push origin main"),
        ("wrappers", F, "GIT_DIR=%s/.git git push" % M),
        ("wrappers", F, "git -c alias.pp=push pp origin main"),
        ("wrappers", F, "git -c 'alias.sp=!git push' sp origin main"),
        ("wrappers", F, "echo main | xargs git push origin"),
        # Compound commands
        ("compound", F, "git status && git push origin main"),
        ("compound", F, "false || git push -f origin main"),
        ("compound", F, "true; git push origin main"),
        ("compound", F, "echo hi | git push origin main"),
        ("compound", F, "git add -A\ngit push origin main"),
        ("compound", F, "echo $(git push origin main)"),
        ("compound", F, "echo \"$(git push origin main)\""),
        ("compound", F, "echo `git push origin main`"),
        ("compound", F, "(git push origin main)"),
        ("compound", F, "bash -c \"git push origin main\""),
        ("compound", F, "sh -c 'git push --force origin HEAD:main'"),
        ("compound", F, "bash -lc 'cd /tmp && git push origin main'"),
        ("compound", F, "eval \"git push origin main\""),
        ("compound", F, "git push origin feature && git push origin main"),
        ("compound", F, "git push origin feature \\\n  main"),
        ("compound", F, "bash <<'EOF'\ngit push origin main\nEOF"),
        ("compound", F, "git push origin feature && git -c alias.x=push x origin main"),
        # master repo: origin/HEAD -> master
        ("master repo", R, "git push origin master"),
        ("master repo", R, "git push origin HEAD:master -f"),
        ("master repo", R, "git push origin main"),
        # Fail closed
        ("fail closed", F, "git push origin \"main"),
        ("fail closed", F, "git push origin $BRANCH"),
        ("fail closed", F, "git push origin \"$(cat branch.txt)\""),
        ("fail closed", F, "git --bogus-option push origin feature"),
        ("fail closed", F, "git push --bogus-option origin feature"),
        ("fail closed", F, "cd \"$DIR\" && git push"),
    ]
    allow = [
        ("allow", F, "git push -u origin feature"),
        ("allow", F, "git push origin feature"),
        ("allow", F, "git push"),
        ("allow", F, "git push -u origin HEAD"),
        ("allow", F, "git push -u origin \"$(git branch --show-current)\""),
        ("allow", F, "git push --force origin feature"),
        ("allow", F, "git push -f origin feature"),
        ("allow", F, "git push origin feature --force"),
        ("allow", F, "git push --force-with-lease origin feature"),
        ("allow", F, "git push --force-with-lease=feature origin feature"),
        ("allow", F, "git push --force-with-lease origin HEAD:feature"),
        ("allow", F, "git push origin fix-domain"),
        ("allow", F, "git push -u origin fix-domain"),
        ("allow", F, "git push --force origin feature/remain"),
        ("allow", F, "git push origin remain -f"),
        ("allow", F, "git push origin HEAD:fix-domain"),
        ("allow", F, "git push origin main-v2 --force-with-lease"),
        ("allow", F, "git push origin --delete old-branch"),
        ("allow", F, "git push origin v1.0"),
        ("allow", F, "git -C %s push origin feature" % F),
        ("allow", R, "git push origin feature"),
        ("allow", M, "cd %s && git push" % F),
        ("allow", F, "git status && git commit -m 'push main later' && git push -u origin feature"),
        ("allow", F, "gh pr create --title \"git push origin main\" --body x"),
        ("allow", F, "git log --grep push"),
        ("allow", F, "git commit -q -F - <<'EOF'\nDon't push to main\n\ngit push origin main is blocked now\nEOF"),
        ("allow", F, "git commit -m \"$(cat <<'EOF'\nDon't let git push origin main through\nEOF\n)\" && git push -u origin feature"),
        ("allow", F, "gh pr create --title x --body-file - <<'EOF'\nBlocks `git push origin main --force`; it's a backstop.\nEOF"),
        ("allow", F, "echo \"don't\" && git push origin feature"),
        ("allow", F, "npm run build"),
        ("allow", F, "ls -la"),
    ]
    out += [(g, cwd, c, "deny") for g, cwd, c in deny]
    out += [(g, cwd, c, "allow") for g, cwd, c in allow]
    return out


def run_hook(cwd, command):
    payload = {"session_id": "test", "cwd": cwd, "hook_event_name": "PreToolUse",
               "tool_name": "Bash", "tool_input": {"command": command}}
    r = subprocess.run([sys.executable, HOOK], input=json.dumps(payload), capture_output=True,
                       text=True, timeout=30, cwd=cwd)
    return r.returncode, r.stderr.strip()


def main():
    root = tempfile.mkdtemp(prefix="guard-push-test-", dir="/tmp")
    try:
        paths = setup(root)
        names = {v: k for k, v in paths.items()}
        results = []
        for group, cwd, command, expect in cases(paths):
            code, err = run_hook(cwd, command)
            got = {2: "deny", 0: "allow"}.get(code, "error %d" % code)
            results.append((group, names[cwd], command.replace(root + "/", "$T/"), expect, got, err))
        print("| # | Group | Repo | Command | Expected | Got | Result |")
        print("|---|---|---|---|---|---|---|")
        for n, (group, repo, command, expect, got, err) in enumerate(results, 1):
            ok = "pass" if got == expect else "FAIL"
            cmd = command.replace("\n", "\\n").replace("|", "\\|")
            print("| %d | %s | %s | `%s` | %s | %s | %s |" % (n, group, repo, cmd, expect, got, ok))
        failed = [r for r in results if r[3] != r[4]]
        print("\n%d/%d passed" % (len(results) - len(failed), len(results)))
        for r in failed:
            print("FAIL: %s -> %s %s" % (r[2], r[4], r[5]))
        if "-v" in sys.argv:
            for r in results:
                if r[5]:
                    print("%s\n    %s" % (r[2], r[5]))
        return 1 if failed else 0
    finally:
        shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
