#!/usr/bin/env python3
"""PreToolUse hook for the Bash tool: blocks git pushes to protected branches.

Registered in .claude/settings.json and run before every Bash command. Reads the hook JSON on
stdin, finds every `git push` in the command (through &&, ||, ;, |, newlines, $(...), backticks,
subshells, `bash -c`/`sh -c`, `eval`, wrappers like env/command/time/nohup, git global options and
git aliases), and exits 2 with a reason on stderr if any of them would update a protected branch.
Exit 2 always blocks the call, and Claude sees the reason.

Protected: "main", whatever each remote's HEAD points to in the target repo (refs/remotes/*/HEAD,
so a master repo is covered), and anything in EXTRA_PROTECTED. Fails closed: if a command
mentions git and push but can't be parsed or resolved, it's blocked.

Only Python's standard library, so it runs on stock macOS. Tests: test-guard-push.py next to this.
GitHub branch protection is still the real enforcement; this keeps Claude from trying.
"""
import fnmatch
import json
import os
import re
import shlex
import subprocess
import sys

# Add more protected branch names here (e.g. "release", "production").
EXTRA_PROTECTED = []
ALWAYS_PROTECTED = ["main"]

SHELLS = {"sh", "bash", "zsh", "dash", "ksh", "fish"}
ARG_FEEDERS = {"xargs", "parallel"}  # git's arguments would come from stdin
MAX_DEPTH = 8

# $(...) and `...` forms that just print the current branch; pushing HEAD means the same thing.
CURRENT_BRANCH_SUBS = re.compile(
    r"\$\(\s*git\s+(?:branch\s+--show-current|rev-parse\s+--abbrev-ref\s+HEAD|symbolic-ref\s+--short\s+HEAD)\s*\)"
    r"|`\s*git\s+(?:branch\s+--show-current|rev-parse\s+--abbrev-ref\s+HEAD|symbolic-ref\s+--short\s+HEAD)\s*`"
)

# git global options (before the subcommand).
GIT_OPTS_WITH_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env",
                     "--super-prefix", "--attr-source", "--list-cmds"}
GIT_FLAGS = {"-p", "--paginate", "-P", "--no-pager", "--bare", "--no-replace-objects",
             "--no-lazy-fetch", "--literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs",
             "--icase-pathspecs", "--no-optional-locks", "--no-advice", "--exec-path", "--html-path",
             "--man-path", "--info-path", "-v", "--version", "-h", "--help"}

# Built-in subcommands, so we only look up aliases for names that aren't one of these.
GIT_BUILTINS = set("""
add am annotate apply archive bisect blame branch bundle cat-file check-attr check-ignore
check-mailmap check-ref-format checkout checkout-index cherry cherry-pick citool clean clone
column commit commit-graph commit-tree config count-objects credential describe diff diff-files
diff-index diff-tree difftool fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg
for-each-ref for-each-repo format-patch fsck gc get-tar-commit-id grep gui hash-object help
index-pack init instaweb interpret-trailers log ls-files ls-remote ls-tree mailinfo mailsplit
maintenance merge merge-base merge-file merge-index merge-tree mktag mktree mv name-rev notes
pack-objects pack-refs patch-id prune pull push range-diff read-tree rebase reflog remote repack
replace request-pull rerere reset restore rev-list rev-parse revert rm send-email shortlog show
show-branch show-index show-ref sparse-checkout stash status stripspace submodule switch
symbolic-ref tag unpack-file unpack-objects update-index update-ref update-server-info var
verify-commit verify-pack verify-tag version whatchanged worktree write-tree lfs
""".split())

# git push options.
PUSH_FLAGS = {"--all", "--branches", "--mirror", "--tags", "--follow-tags", "--no-follow-tags",
              "-n", "--dry-run", "--porcelain", "-d", "--delete", "-f", "--force",
              "--force-with-lease", "--no-force-with-lease", "--force-if-includes",
              "--no-force-if-includes", "-u", "--set-upstream", "--prune", "--no-prune", "--atomic",
              "--no-atomic", "-q", "--quiet", "-v", "--verbose", "--progress", "--no-progress",
              "--no-verify", "--verify", "--thin", "--no-thin", "-4", "--ipv4", "-6", "--ipv6",
              "--signed", "--no-signed", "--no-recurse-submodules"}
PUSH_OPTS_WITH_ARG = {"-o", "--push-option", "--repo", "--receive-pack", "--exec"}
PUSH_OPTS_EQ = ("--force-with-lease=", "--signed=", "--recurse-submodules=", "--push-option=",
                "--repo=", "--receive-pack=", "--exec=")
PUSH_SHORT = set("nfduqv46")


class Deny(Exception):
    def __init__(self, rule, detail):
        super().__init__(detail)
        self.rule, self.detail = rule, detail


class Unparseable(Exception):
    pass


class Ctx:
    def __init__(self, cwd, env=None):
        self.cwd = cwd  # None once a `cd` goes somewhere we can't resolve
        self.env = dict(env or {})

    def copy(self):
        return Ctx(self.cwd, self.env)


# ---------- shell splitting ----------

def find_substitutions(s):
    """Inner text of every $(...), <(...), >(...) and `...` outside single quotes."""
    out, i, n, sq, dq = [], 0, len(s), False, False
    while i < n:
        c = s[i]
        if c == "\\" and not sq:
            i += 2
            continue
        if c == "'" and not dq:
            sq = not sq
        elif c == '"' and not sq:
            dq = not dq
        elif not sq and (s.startswith("$(", i) or (not dq and s[i:i + 2] in ("<(", ">("))):
            depth, j = 1, i + 2
            while j < n and depth:
                if s[j] == "(":
                    depth += 1
                elif s[j] == ")":
                    depth -= 1
                j += 1
            if depth:
                raise Unparseable("unbalanced $( ... )")
            out.append(s[i + 2:j - 1])
            i = j
            continue
        elif c == "`" and not sq:
            j = s.find("`", i + 1)
            if j < 0:
                raise Unparseable("unbalanced backtick")
            out.append(s[i + 1:j])
            i = j + 1
            continue
        i += 1
    return out


def split_commands(s):
    """Split shell text into simple commands (lists of words), dropping redirections."""
    lex = shlex.shlex(s, posix=True, punctuation_chars=";&|()<>\n")
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    lex.commenters = ""
    try:
        tokens = list(lex)
    except ValueError as e:
        raise Unparseable("couldn't parse the quoting (%s)" % e)
    cmds, cur, skip_next = [], [], False
    for t in tokens:
        if skip_next:
            skip_next = False
            continue
        if t and set(t) <= set(";&|()\n"):
            if cur:
                cmds.append(cur)
            cur = []
        elif t and set(t) <= set("<>&") and ("<" in t or ">" in t):
            skip_next = True  # the redirect target isn't an argument
        else:
            cur.append(t)
    if cur:
        cmds.append(cur)
    return cmds


HEREDOC = re.compile(r"<<(-?)\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\2")


def strip_heredocs(s):
    """Drop here-document bodies (commit messages, PR bodies): they're text, not commands.
    Returns (text without the bodies, bodies fed to a shell, which are commands)."""
    out, scripts, pos = [], [], 0
    while True:
        m = HEREDOC.search(s, pos)
        nl = s.find("\n", m.end()) if m else -1
        if not m or nl < 0:
            out.append(s[pos:])
            return "".join(out), scripts
        out.append(s[pos:nl + 1])
        lines = s[nl + 1:].split("\n")
        body, pos = lines, len(s)
        for k, line in enumerate(lines):
            if (line.lstrip("\t") if m.group(1) else line) == m.group(3):
                body, pos = lines[:k], nl + 1 + sum(len(x) + 1 for x in lines[:k + 1])
                break
        # `bash <<EOF` / `sh -s <<EOF` run the body as commands.
        before = re.split(r"[;&|()\n]", s[:m.start()])[-1].split()
        if any(os.path.basename(w) in SHELLS or w == "eval" for w in before):
            scripts.append("\n".join(body))


def analyze_shell(s, ctx, depth):
    if depth > MAX_DEPTH:
        raise Unparseable("commands nested too deeply")
    s, scripts = strip_heredocs(s.replace("\\\n", ""))
    for script in scripts:
        analyze_shell(script, ctx.copy(), depth + 1)
    s = CURRENT_BRANCH_SUBS.sub("HEAD", s)
    for inner in find_substitutions(s):
        analyze_shell(inner, ctx.copy(), depth + 1)
    for words in split_commands(s):
        analyze_simple(words, ctx, depth)


ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")


def analyze_simple(words, ctx, depth):
    env = {}
    i = 0
    while i < len(words) and ASSIGN.match(words[i]):
        k, v = words[i].split("=", 1)
        env[k] = v
        i += 1
    words = words[i:]
    if not words:
        return
    if os.path.basename(words[0]) in ("cd", "pushd"):
        args = [w for w in words[1:] if not w.startswith("-")]
        target = args[0] if args else "~"
        if "$" in target or "`" in target or ctx.cwd is None:
            ctx.cwd = None
        else:
            ctx.cwd = os.path.normpath(os.path.join(ctx.cwd, os.path.expanduser(target)))
        return
    feeder = False
    for j, w in enumerate(words):
        base = os.path.basename(w)
        if ASSIGN.match(w):  # `env FOO=1 git ...`
            k, v = w.split("=", 1)
            env[k] = v
        elif base in ARG_FEEDERS:
            feeder = True
        elif base in SHELLS:
            for k in range(j + 1, len(words) - 1):
                if re.match(r"^-[A-Za-z]*c[A-Za-z]*$", words[k]):
                    analyze_shell(words[k + 1], ctx.copy(), depth + 1)
                    break
            return
        elif base == "eval":
            analyze_shell(" ".join(words[j + 1:]), ctx.copy(), depth + 1)
            return
        elif base == "git":
            sub = Ctx(ctx.cwd, {**ctx.env, **env})
            analyze_git(words[j + 1:], sub, depth, feeder)
            return


# ---------- git ----------

def run_git(repo, *args):
    """Run git against the target repo; return stdout, or None if it fails."""
    if repo["cwd"] is None:
        return None
    cmd = ["git", "-C", repo["cwd"]]
    for k in ("git_dir", "work_tree"):
        if repo.get(k):
            cmd.append("--%s=%s" % (k.replace("_", "-"), repo[k]))
    for c in repo.get("configs", []):
        cmd += ["-c", c]
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update({k: v for k, v in repo.get("env", {}).items() if k.startswith("GIT_")})
    try:
        r = subprocess.run(cmd + list(args), capture_output=True, text=True, timeout=5, env=env)
    except Exception:
        return None
    return r.stdout if r.returncode == 0 else None


def analyze_git(args, ctx, depth, feeder=False):
    repo = {"cwd": ctx.cwd, "git_dir": ctx.env.get("GIT_DIR"),
            "work_tree": ctx.env.get("GIT_WORK_TREE"), "configs": [], "env": ctx.env}
    mentions_push = any("push" in a for a in args)
    i = 0
    while i < len(args):
        a = args[i]
        name, eq, val = a.partition("=")
        if a in GIT_OPTS_WITH_ARG or (eq and name in GIT_OPTS_WITH_ARG and name.startswith("--")):
            if not eq:
                if i + 1 >= len(args):
                    return
                val = args[i + 1]
                i += 1
            if name == "-C":
                if "$" in val or "`" in val or repo["cwd"] is None:
                    repo["cwd"] = None
                else:
                    repo["cwd"] = os.path.normpath(os.path.join(repo["cwd"], os.path.expanduser(val)))
            elif name == "-c":
                repo["configs"].append(val)
            elif name == "--git-dir":
                repo["git_dir"] = val
            elif name == "--work-tree":
                repo["work_tree"] = val
            i += 1
        elif a in GIT_FLAGS or (eq and name == "--exec-path"):
            i += 1
        elif a.startswith("-"):
            if mentions_push:
                raise Unparseable("unknown git option %s before the subcommand" % a)
            return
        else:
            break
    if i >= len(args):
        return
    subcmd, rest = args[i], args[i + 1:]
    if subcmd == "push":
        if feeder:
            raise Unparseable("git push gets its arguments from xargs/parallel, so the destination can't be checked")
        analyze_push(rest, repo)
        return
    if subcmd in GIT_BUILTINS or depth > MAX_DEPTH:
        return
    # Maybe an alias: `git -c alias.p=push p origin main`, or one set in git config.
    alias = None
    for c in reversed(repo["configs"]):
        k, _, v = c.partition("=")
        if k.lower() == "alias." + subcmd.lower():
            alias = v
            break
    if alias is None:
        out = run_git(repo, "config", "--get", "alias." + subcmd)
        alias = out.strip() if out else None
        if alias is None and repo["cwd"] is None and mentions_push:
            raise Unparseable("can't tell which repo this runs in, so can't check the alias %r" % subcmd)
    if not alias:
        return
    if alias.startswith("!"):
        top = run_git(repo, "rev-parse", "--show-toplevel")
        sub = Ctx(top.strip() if top else repo["cwd"], ctx.env)
        analyze_shell(alias[1:] + " " + " ".join(shlex.quote(r) for r in rest), sub, depth + 1)
    else:
        try:
            expanded = shlex.split(alias)
        except ValueError:
            raise Unparseable("couldn't parse the git alias %r" % subcmd)
        pre = []
        for k in ("git_dir", "work_tree"):
            if repo.get(k):
                pre.append("--%s=%s" % (k.replace("_", "-"), repo[k]))
        for c in repo["configs"]:
            pre += ["-c", c]
        analyze_git(pre + expanded + rest, Ctx(repo["cwd"], ctx.env), depth + 1, feeder)


def protected_branches(repo):
    names = set(ALWAYS_PROTECTED) | set(EXTRA_PROTECTED)
    out = run_git(repo, "for-each-ref", "--format=%(refname) %(symref)", "refs/remotes")
    for line in (out or "").splitlines():
        ref, _, target = line.partition(" ")
        if ref.endswith("/HEAD") and target.startswith("refs/remotes/"):
            remote = ref[len("refs/remotes/"):-len("/HEAD")]
            prefix = "refs/remotes/%s/" % remote
            if target.startswith(prefix):
                names.add(target[len(prefix):])
    return {n.lower() for n in names}


def branch_name(ref):
    """'refs/heads/main', 'heads/main' or 'main' -> 'main'. Other refs/... -> None."""
    if ref.startswith("refs/heads/"):
        return ref[len("refs/heads/"):]
    if ref.startswith("heads/"):
        return ref[len("heads/"):]
    if ref.startswith("refs/"):
        return None
    return ref


def hits_protected(dst, protected):
    if "*" in dst:  # wildcard refspec, e.g. refs/heads/*:refs/heads/*
        full = dst if dst.startswith("refs/") else "refs/heads/" + dst
        return any(fnmatch.fnmatchcase("refs/heads/" + p, full) for p in protected) or \
            any(fnmatch.fnmatchcase(p, dst.lower()) for p in protected)
    name = branch_name(dst)
    return name is not None and name.lower() in protected


def current_branch(repo):
    out = run_git(repo, "symbolic-ref", "-q", "--short", "HEAD")
    return out.strip() if out else None


def analyze_push(rest, repo):
    all_branches = mirror = prune = tags = delete = False
    repo_opt = None
    positionals = []
    i = 0
    while i < len(rest):
        a = rest[i]
        if a == "--":
            positionals += rest[i + 1:]
            break
        if a in ("--all", "--branches"):
            all_branches = True
        elif a == "--mirror":
            mirror = True
        elif a == "--prune":
            prune = True
        elif a == "--tags":
            tags = True
        elif a in ("-d", "--delete"):
            delete = True
        elif a in PUSH_FLAGS:
            pass
        elif a in PUSH_OPTS_WITH_ARG:
            if a == "--repo" and i + 1 < len(rest):
                repo_opt = rest[i + 1]
            i += 1
        elif a.startswith(PUSH_OPTS_EQ):
            if a.startswith("--repo="):
                repo_opt = a.split("=", 1)[1]
        elif re.match(r"^-[A-Za-z0-9]+$", a):  # bundled short flags, e.g. -uf
            letters = a[1:]
            for k, ch in enumerate(letters):
                if ch == "o":
                    if k == len(letters) - 1:
                        i += 1
                    break
                if ch == "d":
                    delete = True
                if ch not in PUSH_SHORT:
                    raise Unparseable("unknown git push option -%s" % ch)
        elif a.startswith("-"):
            raise Unparseable("unknown git push option %s" % a)
        else:
            positionals.append(a)
        i += 1

    if mirror:
        raise Deny("--mirror", "`git push --mirror` overwrites every branch on the remote, main included")
    if all_branches:
        raise Deny("--all", "`git push --all` pushes every local branch, main included")

    refspecs = positionals if repo_opt is not None else positionals[1:]
    protected = protected_branches(repo)
    names = ", ".join(sorted(protected))

    for spec in refspecs:
        if "$" in spec or "`" in spec:
            raise Unparseable("can't tell where %r points; write the branch name out" % spec)
        s = spec[1:] if spec.startswith("+") else spec
        if ":" in s:
            src, dst = s.split(":", 1)
        else:
            src, dst = s, ""
        if not dst:
            if src in ("HEAD", "@"):
                dst = current_branch(repo)
                if dst is None:
                    raise Unparseable("can't tell which branch HEAD is in this repo")
            else:
                dst = src
        if hits_protected(dst, protected):
            if src == "" or delete:
                raise Deny("delete", "%r deletes the protected branch %s on the remote" % (spec, dst))
            raise Deny("refspec", "%r updates the protected branch %s (protected here: %s)" % (spec, dst, names))
        if prune and "*" in spec:
            raise Deny("--prune", "`--prune` with a wildcard refspec can delete protected branches")

    # remote.<name>.push config (set in the repo or with -c) can redirect any push.
    cfg = run_git(repo, "config", "--get-regexp", r"^remote\..*\.push$")
    for line in (cfg or "").splitlines():
        spec = line.split(" ", 1)[1] if " " in line else ""
        spec = spec[1:] if spec.startswith("+") else spec
        dst = spec.split(":", 1)[1] if ":" in spec else spec
        if dst and hits_protected(dst, protected):
            raise Deny("remote push config", "remote.*.push is set to %r, which pushes to a protected branch" % line)

    if refspecs:
        return

    # No refspec: git decides from the current branch and config.
    if repo["cwd"] is None:
        raise Unparseable("a bare `git push` in a directory that can't be resolved")
    if run_git(repo, "rev-parse", "--git-dir") is None:
        raise Unparseable("a bare `git push` outside a readable git repo")
    if prune:
        raise Deny("--prune", "`git push --prune` without a refspec can delete protected branches")
    push_default = (run_git(repo, "config", "--get", "push.default") or "simple").strip()
    if push_default == "matching":
        raise Deny("push.default=matching", "a bare `git push` with push.default=matching pushes main too")
    cur = current_branch(repo)
    if cur is None:
        return  # detached HEAD: git refuses a bare push
    if cur.lower() in protected:
        raise Deny("current branch", "a bare `git push` on %s pushes the protected branch %s" % (cur, cur))
    merge = (run_git(repo, "config", "--get", "branch.%s.merge" % cur) or "").strip()
    if merge and hits_protected(merge, protected):
        raise Deny("upstream", "%s tracks %s, so a bare `git push` could update it" % (cur, merge))


# ---------- entry point ----------

def block(rule, detail):
    print("guard-push blocked this command [rule: %s]: %s. Pushes to main (or another protected "
          "branch) go through a pull request: push a feature branch and open a PR. "
          "(.claude/hooks/guard-push.py)" % (rule, detail), file=sys.stderr)
    sys.exit(2)


def main():
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except ValueError:
        if "push" in raw:
            block("unparseable", "the hook input wasn't valid JSON")
        return
    if data.get("tool_name") != "Bash":
        return
    command = (data.get("tool_input") or {}).get("command") or ""
    if "git" not in command:
        return
    try:
        analyze_shell(command, Ctx(data.get("cwd") or os.getcwd()), 0)
    except Deny as d:
        block(d.rule, d.detail)
    except Unparseable as u:
        if "push" not in command:
            return  # e.g. odd quoting in a command that can't be a push
        block("unparseable", "%s (fails closed)" % u)
    except Exception as e:  # a bug here must not let a push through
        if "push" in command:
            block("hook error", "%s: %s (fails closed)" % (type(e).__name__, e))


if __name__ == "__main__":
    main()
