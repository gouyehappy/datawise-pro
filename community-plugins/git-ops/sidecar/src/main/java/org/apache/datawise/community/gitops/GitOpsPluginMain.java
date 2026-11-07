package org.apache.datawise.community.gitops;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Git Ops sidecar: connection holds git binary; repositories are added inside the workbench.
 */
public final class GitOpsPluginMain extends StdioJsonRpcSidecar {

    private final Map<String, Workspace> workspaces = new ConcurrentHashMap<>();
    private volatile Path pluginDataDir;

    public static void main(String[] args) throws Exception {
        new GitOpsPluginMain().runStdio();
    }

    @Override
    protected JsonNode handle(String method, JsonNode params) {
        return switch (method) {
            case "plugin/initialize" -> initialize(params);
            case "connection/test" -> testConnection(params.path("connection"));
            case "connection/connect" -> connect(params.path("connection"));
            case "connection/disconnect" -> {
                workspaces.remove(params.path("connection").path("id").asText("anon"));
                yield ok("success", true);
            }
            case "connection/action" -> ok("success", true, "message", "ok");
            case "context-menu/invoke" -> ok("message", "Open the Git Ops workbench from a Git workspace connection.");

            case "git/repos" -> listRepos(requireWs(params), params.path("query").asText(""));
            case "git/repo-add" -> addRepo(requireWs(params), params);
            case "git/repo-clone" -> cloneRepo(requireWs(params), params);
            case "git/repo-init" -> initRepo(requireWs(params), params);
            case "git/repo-remove" -> removeRepo(requireWs(params), params.path("repoId").asText(""));
            case "git/repo-select" -> selectRepo(requireWs(params), params.path("repoId").asText(""));
            case "git/repo-demo" -> addDemoRepo(requireWs(params));

            case "git/status" -> status(requireRepo(params));
            case "git/log" -> log(requireRepo(params), params);
            case "git/branches" -> branches(requireRepo(params));
            case "git/diff" -> diff(requireRepo(params), params);
            case "git/show" -> show(requireRepo(params), params);
            case "git/remotes" -> remotes(requireRepo(params));
            case "git/stage" -> stage(requireRepo(params), paths(params), true);
            case "git/unstage" -> stage(requireRepo(params), paths(params), false);
            case "git/apply-patch" -> applyPatch(requireRepo(params), params);
            case "git/discard" -> discard(requireRepo(params), params);
            case "git/ignore" -> ignore(requireRepo(params), paths(params));
            case "git/commit" -> commit(requireRepo(params), params);
            case "git/checkout" -> checkout(requireRepo(params), params);
            case "git/branch-create" -> branchCreate(requireRepo(params), params);
            case "git/branch-delete" -> branchDelete(requireRepo(params), params);
            case "git/branch-rename" -> branchRename(requireRepo(params), params);
            case "git/merge" -> merge(requireRepo(params), params);
            case "git/cherry-pick" -> cherryPick(requireRepo(params), params);
            case "git/revert" -> revert(requireRepo(params), params);
            case "git/abort" -> abort(requireRepo(params), params);
            case "git/fetch" -> fetch(requireRepo(params), params);
            case "git/pull" -> pull(requireRepo(params), params);
            case "git/push" -> push(requireRepo(params), params);
            case "git/reset" -> reset(requireRepo(params), params);
            case "git/stash" -> stash(requireRepo(params), params);
            case "git/tools" -> tools(requireWs(params));
            default -> throw new UnknownMethodException(method);
        };
    }

    private ObjectNode initialize(JsonNode params) {
        String dir = params.path("pluginDataDir").asText("");
        if (!dir.isBlank()) {
            pluginDataDir = Path.of(dir);
        }
        ObjectNode out = mapper().createObjectNode();
        out.put("ok", true);
        out.put("name", "Git Ops");
        return out;
    }

    private ObjectNode testConnection(JsonNode connection) {
        Workspace ws = Workspace.fromConnection(connection);
        CliResult ver = git(ws, Path.of(".").toAbsolutePath(), 30, "--version");
        ObjectNode out = mapper().createObjectNode();
        out.put("gitBinary", ws.gitBinary);
        out.put("gitAvailable", ver.exitCode == 0);
        out.put("gitVersion", firstLine(ver.stdout + ver.stderr));
        if (ver.exitCode == 0) {
            out.put("success", true);
            out.put("message", "git OK · " + firstLine(ver.stdout) + " · add repositories inside the workbench");
        } else {
            out.put("success", false);
            out.put("message", "git binary not available: " + ws.gitBinary + " — "
                    + firstLine(ver.stderr.isBlank() ? ver.stdout : ver.stderr));
        }
        return out;
    }

    private ObjectNode connect(JsonNode connection) {
        Workspace ws = Workspace.fromConnection(connection);
        loadInventory(ws);
        workspaces.put(ws.id, ws);
        ObjectNode out = mapper().createObjectNode();
        out.put("success", true);
        out.put("handle", "git-" + ws.id);
        out.put("repoCount", ws.repos.size());
        out.put("gitBinary", ws.gitBinary);
        return out;
    }

    private Workspace requireWs(JsonNode params) {
        String id = params.path("connectionId").asText("");
        if (id.isBlank()) {
            id = params.path("connection").path("id").asText("");
        }
        if (id.isBlank()) {
            id = "default";
        }
        Workspace ws = workspaces.get(id);
        if (ws == null) {
            JsonNode conn = params.path("connection");
            if (!conn.isMissingNode() && !conn.isNull() && !conn.isEmpty()) {
                // Ensure id is present so inventory keys match subsequent invokes.
                if (!conn.has("id") || conn.path("id").asText("").isBlank()) {
                    ObjectNode patched = conn.deepCopy();
                    patched.put("id", id);
                    conn = patched;
                }
                ws = Workspace.fromConnection(conn);
                loadInventory(ws);
                workspaces.put(ws.id, ws);
            }
        }
        if (ws == null) {
            // Soft-open: UI may call git/* before host reconnect; use gitBinary hint if any.
            String binary = params.path("gitBinary").asText("git");
            if (binary.isBlank()) binary = "git";
            ws = new Workspace(id, binary);
            loadInventory(ws);
            workspaces.put(id, ws);
        }
        return ws;
    }

    private RepoCtx requireRepo(JsonNode params) {
        Workspace ws = requireWs(params);
        String repoId = params.path("repoId").asText("").trim();
        if (repoId.isBlank()) {
            repoId = ws.activeRepoId == null ? "" : ws.activeRepoId;
        }
        Repo repo = ws.repos.get(repoId);
        if (repo == null && ws.repos.size() == 1) {
            repo = ws.repos.values().iterator().next();
            repoId = repo.id;
        }
        if (repo == null) {
            throw new IllegalArgumentException("No repository selected. Add one in the left rail.");
        }
        ws.activeRepoId = repoId;
        saveInventory(ws);
        return new RepoCtx(ws, repo);
    }

    private ObjectNode listRepos(Workspace ws, String query) {
        ObjectNode out = mapper().createObjectNode();
        out.put("gitBinary", ws.gitBinary);
        out.put("activeRepoId", ws.activeRepoId == null ? "" : ws.activeRepoId);
        ArrayNode rows = out.putArray("repos");
        String q = query == null ? "" : query.toLowerCase(Locale.ROOT);
        for (Repo r : ws.repos.values()) {
            if (!q.isBlank() && !r.name.toLowerCase(Locale.ROOT).contains(q)
                    && !r.path.toLowerCase(Locale.ROOT).contains(q)) {
                continue;
            }
            ObjectNode row = rows.addObject();
            row.put("id", r.id);
            row.put("name", r.name);
            row.put("path", r.path);
            row.put("active", r.id.equals(ws.activeRepoId));
            CliResult branch = git(ws, Path.of(r.path), 15, "rev-parse", "--abbrev-ref", "HEAD");
            if (branch.exitCode == 0) {
                row.put("branch", firstLine(branch.stdout));
            }
            CliResult dirty = git(ws, Path.of(r.path), 15, "status", "--porcelain");
            row.put("clean", dirty.exitCode == 0 && dirty.stdout.isBlank());
        }
        out.put("success", true);
        return out;
    }

    private ObjectNode addRepo(Workspace ws, JsonNode params) {
        String rawPath = params.path("path").asText("").trim();
        String displayName = params.path("name").asText("").trim();
        if (rawPath.isBlank()) {
            return fail("Repository path is required");
        }
        Path start = Path.of(rawPath).toAbsolutePath().normalize();
        if (!Files.isDirectory(start)) {
            return fail("Path is not a directory: " + start);
        }
        CliResult top = git(ws, start, 30, "rev-parse", "--show-toplevel");
        if (top.exitCode != 0 || firstLine(top.stdout).isBlank()) {
            return fail("Not a Git work tree: " + start);
        }
        Path root = Path.of(firstLine(top.stdout)).toAbsolutePath().normalize();
        String rootStr = root.toString();
        for (Repo existing : ws.repos.values()) {
            if (existing.path.equalsIgnoreCase(rootStr)) {
                ws.activeRepoId = existing.id;
                saveInventory(ws);
                ObjectNode out = mapper().createObjectNode();
                out.put("success", true);
                out.put("repoId", existing.id);
                out.put("message", "Already in workspace · selected");
                out.put("path", existing.path);
                return out;
            }
        }
        String name = displayName.isBlank() ? root.getFileName().toString() : displayName;
        String id = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        Repo repo = new Repo(id, name, rootStr);
        ws.repos.put(id, repo);
        ws.activeRepoId = id;
        saveInventory(ws);
        ObjectNode out = mapper().createObjectNode();
        out.put("success", true);
        out.put("repoId", id);
        out.put("name", name);
        out.put("path", rootStr);
        out.put("message", "Repository added");
        return out;
    }

    private ObjectNode cloneRepo(Workspace ws, JsonNode params) {
        String url = params.path("url").asText("").trim();
        String parentRaw = params.path("path").asText("").trim();
        String displayName = params.path("name").asText("").trim();
        if (url.isBlank()) {
            return fail("Clone URL is required");
        }
        if (parentRaw.isBlank()) {
            return fail("Target folder is required");
        }
        Path parent = Path.of(parentRaw).toAbsolutePath().normalize();
        if (!Files.isDirectory(parent)) {
            try {
                Files.createDirectories(parent);
            } catch (Exception e) {
                return fail("Cannot create folder: " + parent + " · " + e.getMessage());
            }
        }
        String folder = displayName;
        if (folder.isBlank()) {
            folder = inferCloneFolderName(url);
        }
        if (folder.isBlank()) {
            return fail("Could not infer repository folder name");
        }
        Path target = parent.resolve(folder).normalize();
        if (Files.exists(target)) {
            return fail("Target already exists: " + target);
        }
        CliResult clone = gitProgress(ws, parent, 600, "clone", "Cloning " + url,
                "clone", "--progress", "--", url, target.toString());
        if (clone.exitCode != 0) {
            String cleaned = stripGitProgressNoise(clone.stderr.isBlank() ? clone.stdout : clone.stderr);
            ObjectNode out = fail(usefulGitError(cleaned, clone.exitCode));
            out.put("stderr", cleaned);
            out.put("stdout", clone.stdout);
            out.put("exitCode", clone.exitCode);
            return out;
        }
        ObjectNode addParams = mapper().createObjectNode();
        addParams.put("path", target.toString());
        addParams.put("name", folder);
        ObjectNode added = addRepo(ws, addParams);
        if (added.path("success").asBoolean(false)) {
            added.put("message", "Cloned and opened · " + target);
            added.put("cloned", true);
        }
        return added;
    }

    private ObjectNode initRepo(Workspace ws, JsonNode params) {
        String rawPath = params.path("path").asText("").trim();
        String displayName = params.path("name").asText("").trim();
        String branch = params.path("branch").asText("main").trim();
        if (rawPath.isBlank()) {
            return fail("Folder path is required");
        }
        if (branch.isBlank()) branch = "main";
        Path dir = Path.of(rawPath).toAbsolutePath().normalize();
        try {
            Files.createDirectories(dir);
        } catch (Exception e) {
            return fail("Cannot create folder: " + dir + " · " + e.getMessage());
        }
        CliResult probe = git(ws, dir, 15, "rev-parse", "--is-inside-work-tree");
        if (probe.exitCode == 0 && "true".equalsIgnoreCase(firstLine(probe.stdout))) {
            return fail("Already a Git work tree: " + dir);
        }
        CliResult init = git(ws, dir, 60, "init", "-b", branch);
        if (init.exitCode != 0) {
            // Older git without -b: fall back
            init = git(ws, dir, 60, "init");
            if (init.exitCode != 0) {
                return fail(firstLine(init.stderr.isBlank() ? init.stdout : init.stderr));
            }
            git(ws, dir, 30, "checkout", "-b", branch);
        }
        ObjectNode addParams = mapper().createObjectNode();
        addParams.put("path", dir.toString());
        if (!displayName.isBlank()) addParams.put("name", displayName);
        ObjectNode added = addRepo(ws, addParams);
        if (added.path("success").asBoolean(false)) {
            added.put("message", "Initialized and opened · " + dir);
            added.put("initialized", true);
        }
        return added;
    }

    private static String inferCloneFolderName(String url) {
        String s = url.trim();
        if (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        if (s.endsWith(".git")) s = s.substring(0, s.length() - 4);
        int slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
        int colon = s.lastIndexOf(':');
        int cut = slash >= 0 ? slash : (colon >= 0 && !s.contains("://") ? colon : -1);
        String name = cut >= 0 ? s.substring(cut + 1) : s;
        name = name.replaceAll("[\\\\/:*?\"<>|]+", "-").trim();
        return name;
    }

    private ObjectNode removeRepo(Workspace ws, String repoId) {
        if (repoId == null || repoId.isBlank()) {
            return fail("repoId is required");
        }
        Repo removed = ws.repos.remove(repoId);
        if (removed == null) {
            return fail("Repository not found: " + repoId);
        }
        if (repoId.equals(ws.activeRepoId)) {
            ws.activeRepoId = ws.repos.isEmpty() ? null : ws.repos.keySet().iterator().next();
        }
        saveInventory(ws);
        ObjectNode out = mapper().createObjectNode();
        out.put("success", true);
        out.put("message", "Removed from workspace (disk untouched): " + removed.path);
        out.put("activeRepoId", ws.activeRepoId == null ? "" : ws.activeRepoId);
        return out;
    }

    private ObjectNode selectRepo(Workspace ws, String repoId) {
        if (repoId == null || repoId.isBlank() || !ws.repos.containsKey(repoId)) {
            return fail("Repository not found");
        }
        ws.activeRepoId = repoId;
        saveInventory(ws);
        ObjectNode out = mapper().createObjectNode();
        out.put("success", true);
        out.put("repoId", repoId);
        out.put("path", ws.repos.get(repoId).path);
        return out;
    }

    private ObjectNode addDemoRepo(Workspace ws) {
        Path demo = ensureDemoRepo(ws);
        ObjectNode params = mapper().createObjectNode();
        params.put("path", demo.toString());
        params.put("name", "demo-repo");
        return addRepo(ws, params);
    }

    private ObjectNode tools(Workspace ws) {
        CliResult ver = git(ws, Path.of(".").toAbsolutePath(), 15, "--version");
        ObjectNode out = mapper().createObjectNode();
        out.put("gitBinary", ws.gitBinary);
        out.put("available", ver.exitCode == 0);
        out.put("version", firstLine(ver.stdout + ver.stderr));
        out.put("repoCount", ws.repos.size());
        return out;
    }

    private ObjectNode status(RepoCtx ctx) {
        Path root = Path.of(ctx.repo.path);
        ObjectNode out = mapper().createObjectNode();
        out.put("repoId", ctx.repo.id);
        out.put("repoName", ctx.repo.name);
        out.put("repoPath", root.toString());

        CliResult branch = git(ctx.ws, root, 30, "rev-parse", "--abbrev-ref", "HEAD");
        out.put("branch", firstLine(branch.stdout));
        out.put("detached", "HEAD".equals(firstLine(branch.stdout)));

        CliResult sha = git(ctx.ws, root, 30, "rev-parse", "--short", "HEAD");
        if (sha.exitCode == 0) {
            out.put("head", firstLine(sha.stdout));
        }

        boolean merging = gitPathExists(ctx.ws, root, "MERGE_HEAD");
        boolean rebasing = gitPathExists(ctx.ws, root, "rebase-merge")
                || gitPathExists(ctx.ws, root, "rebase-apply");
        boolean cherryPicking = gitPathExists(ctx.ws, root, "CHERRY_PICK_HEAD");
        out.put("merging", merging);
        out.put("rebasing", rebasing);
        out.put("cherryPicking", cherryPicking);
        if (merging) out.put("inProgress", "merge");
        else if (rebasing) out.put("inProgress", "rebase");
        else if (cherryPicking) out.put("inProgress", "cherry-pick");
        else out.put("inProgress", "");

        CliResult upstream = git(ctx.ws, root, 30, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
        if (upstream.exitCode == 0) {
            out.put("upstream", firstLine(upstream.stdout));
            CliResult counts = git(ctx.ws, root, 30, "rev-list", "--left-right", "--count", "HEAD...@{u}");
            if (counts.exitCode == 0) {
                String[] parts = firstLine(counts.stdout).split("\\s+");
                if (parts.length >= 2) {
                    out.put("ahead", parseIntSafe(parts[0]));
                    out.put("behind", parseIntSafe(parts[1]));
                }
            }
        }

        CliResult porcelain = git(ctx.ws, root, 60, "status", "--porcelain=v1", "-uall", "-b");
        out.put("success", porcelain.exitCode == 0);
        out.put("exitCode", porcelain.exitCode);
        if (porcelain.exitCode != 0) {
            out.put("message", firstLine(porcelain.stderr.isBlank() ? porcelain.stdout : porcelain.stderr));
            out.put("stderr", porcelain.stderr);
            return out;
        }

        ArrayNode staged = out.putArray("staged");
        ArrayNode unstaged = out.putArray("unstaged");
        ArrayNode untracked = out.putArray("untracked");
        ArrayNode conflicted = out.putArray("conflicted");
        String branchLine = "";
        for (String line : porcelain.stdout.split("\n")) {
            if (line.isBlank()) continue;
            if (line.startsWith("## ")) {
                branchLine = line.substring(3).trim();
                continue;
            }
            if (line.length() < 3) continue;
            char x = line.charAt(0);
            char y = line.charAt(1);
            String path = line.substring(3);
            if (path.contains(" -> ")) {
                path = path.substring(path.lastIndexOf(" -> ") + 4);
            }
            ObjectNode row = mapper().createObjectNode();
            row.put("path", path);
            row.put("xy", "" + x + y);
            if (x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D')) {
                conflicted.add(row);
            } else {
                if (x != ' ' && x != '?') {
                    ObjectNode s = row.deepCopy();
                    s.put("code", String.valueOf(x));
                    staged.add(s);
                }
                if (y == '?') {
                    untracked.add(row);
                } else if (y != ' ') {
                    ObjectNode u = row.deepCopy();
                    u.put("code", String.valueOf(y));
                    unstaged.add(u);
                }
            }
        }
        if (!branchLine.isBlank()) {
            out.put("branchHeader", branchLine);
        }
        out.put("clean", staged.isEmpty() && unstaged.isEmpty() && untracked.isEmpty() && conflicted.isEmpty());
        return out;
    }

    private ObjectNode log(RepoCtx ctx, JsonNode params) {
        Path root = Path.of(ctx.repo.path);
        int limit = Math.min(200, Math.max(1, params.path("limit").asInt(50)));
        String query = params.path("query").asText("").trim();
        String ref = params.path("ref").asText("").trim();
        if (!ref.isBlank() && !isSafeRefName(ref)) {
            return fail("Invalid ref: " + ref);
        }
        List<String> args = new ArrayList<>();
        args.add("log");
        args.add("--pretty=format:%H%x09%h%x09%an%x09%ae%x09%ad%x09%P%x09%s");
        args.add("--date=iso-strict");
        args.add("-n");
        args.add(String.valueOf(limit));
        if (!query.isBlank()) {
            args.add("--grep=" + query);
            args.add("-i");
        }
        if (!ref.isBlank()) args.add(ref);
        CliResult r = git(ctx.ws, root, 60, args.toArray(String[]::new));
        ObjectNode out = mapper().createObjectNode();
        out.put("success", r.exitCode == 0);
        out.put("exitCode", r.exitCode);
        ArrayNode commits = out.putArray("commits");
        if (r.exitCode != 0) {
            out.put("message", firstLine(r.stderr.isBlank() ? r.stdout : r.stderr));
            return out;
        }
        for (String line : r.stdout.split("\n")) {
            if (line.isBlank()) continue;
            String[] p = line.split("\t", 7);
            if (p.length < 7) continue;
            ObjectNode c = commits.addObject();
            c.put("hash", p[0]);
            c.put("short", p[1]);
            c.put("author", p[2]);
            c.put("email", p[3]);
            c.put("date", p[4]);
            c.put("parents", p[5]);
            c.put("parentCount", p[5].isBlank() ? 0 : p[5].trim().split("\\s+").length);
            c.put("subject", p[6]);
        }
        return out;
    }

    private ObjectNode branches(RepoCtx ctx) {
        Path root = Path.of(ctx.repo.path);
        ObjectNode out = mapper().createObjectNode();
        CliResult cur = git(ctx.ws, root, 30, "rev-parse", "--abbrev-ref", "HEAD");
        out.put("current", firstLine(cur.stdout));

        CliResult local = git(ctx.ws, root, 60, "for-each-ref",
                "--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)%09%(HEAD)%09%(upstream:track)",
                "refs/heads");
        ArrayNode locals = out.putArray("local");
        if (local.exitCode == 0) {
            for (String line : local.stdout.split("\n")) {
                if (line.isBlank()) continue;
                String[] p = line.split("\t", 5);
                ObjectNode b = locals.addObject();
                b.put("name", p[0]);
                if (p.length > 1) b.put("hash", p[1]);
                if (p.length > 2 && !p[2].isBlank()) b.put("upstream", p[2]);
                b.put("current", p.length > 3 && "*".equals(p[3]));
                if (p.length > 4 && !p[4].isBlank()) {
                    String track = p[4].trim();
                    // e.g. [ahead 2, behind 1] / [ahead 1] / [behind 3] / [gone]
                    b.put("track", track);
                    java.util.regex.Matcher am = java.util.regex.Pattern.compile("ahead\\s+(\\d+)").matcher(track);
                    java.util.regex.Matcher bm = java.util.regex.Pattern.compile("behind\\s+(\\d+)").matcher(track);
                    if (am.find()) b.put("ahead", Integer.parseInt(am.group(1)));
                    if (bm.find()) b.put("behind", Integer.parseInt(bm.group(1)));
                    if (track.contains("gone")) b.put("gone", true);
                }
            }
        }

        CliResult remote = git(ctx.ws, root, 60, "for-each-ref",
                "--format=%(refname:short)%09%(objectname:short)",
                "refs/remotes");
        ArrayNode remotes = out.putArray("remote");
        if (remote.exitCode == 0) {
            for (String line : remote.stdout.split("\n")) {
                if (line.isBlank()) continue;
                String[] p = line.split("\t", 2);
                String shortName = p[0].trim();
                // Symbolic remote HEAD may appear as "origin" or "origin/HEAD".
                // Always normalize to "origin/HEAD" so the UI groups it under that remote
                // as HEAD (SourceTree-style) instead of a bogus "(other)" bucket.
                if (!shortName.contains("/")) {
                    shortName = shortName + "/HEAD";
                } else if (shortName.endsWith("/HEAD")) {
                    // already normalized
                }
                ObjectNode b = remotes.addObject();
                b.put("name", shortName);
                if (shortName.endsWith("/HEAD")) b.put("isHead", true);
                if (p.length > 1) b.put("hash", p[1]);
            }
        }
        out.put("success", true);
        return out;
    }

    private ObjectNode diff(RepoCtx ctx, JsonNode params) {
        Path root = Path.of(ctx.repo.path);
        String path = params.path("path").asText("").trim();
        boolean staged = params.path("staged").asBoolean(false);
        List<String> args = new ArrayList<>();
        args.add("diff");
        args.add("--no-color");
        if (staged) args.add("--cached");
        if (!path.isBlank()) {
            args.add("--");
            args.add(path);
        }
        CliResult r = git(ctx.ws, root, 120, args.toArray(String[]::new));
        ObjectNode out = mapper().createObjectNode();
        out.put("success", r.exitCode == 0);
        out.put("exitCode", r.exitCode);
        out.put("diff", r.stdout);
        out.put("stderr", r.stderr);
        out.put("staged", staged);
        out.put("path", path);
        if (r.exitCode != 0) {
            out.put("message", firstLine(r.stderr.isBlank() ? r.stdout : r.stderr));
        }
        return out;
    }

    private ObjectNode show(RepoCtx ctx, JsonNode params) {
        Path root = Path.of(ctx.repo.path);
        String target = params.path("rev").asText("HEAD").trim();
        if (target.isBlank()) target = "HEAD";
        String path = params.path("path").asText("").trim();
        ObjectNode out = mapper().createObjectNode();
        out.put("rev", target);

        // Single-file patch inside a commit (history detail)
        if (!path.isBlank()) {
            CliResult r = git(ctx.ws, root, 90, "show", "--no-color", "--format=", target, "--", path);
            out.put("success", r.exitCode == 0);
            out.put("exitCode", r.exitCode);
            out.put("diff", r.stdout == null ? "" : r.stdout);
            out.put("stderr", r.stderr);
            if (r.exitCode != 0) {
                out.put("message", firstLine(r.stderr.isBlank() ? r.stdout : r.stderr));
            }
            return out;
        }

        CliResult meta = git(ctx.ws, root, 30,
                "log", "-1",
                "--format=%H%x09%h%x09%an%x09%ae%x09%ad%x09%P%x09%s%x09%b",
                "--date=iso-strict",
                target);
        out.put("success", meta.exitCode == 0);
        out.put("exitCode", meta.exitCode);
        if (meta.exitCode != 0) {
            out.put("message", firstLine(meta.stderr.isBlank() ? meta.stdout : meta.stderr));
            out.put("stderr", meta.stderr);
            return out;
        }
        String[] lines = meta.stdout.split("\n", -1);
        if (lines.length > 0 && !lines[0].isBlank()) {
            String[] p = lines[0].split("\t", 8);
            if (p.length >= 7) {
                out.put("hash", p[0]);
                out.put("short", p[1]);
                out.put("author", p[2]);
                out.put("email", p[3]);
                out.put("date", p[4]);
                out.put("parents", p[5]);
                out.put("subject", p[6]);
                StringBuilder body = new StringBuilder(p.length > 7 ? p[7] : "");
                for (int i = 1; i < lines.length; i++) {
                    if (body.length() > 0) body.append('\n');
                    body.append(lines[i]);
                }
                out.put("body", body.toString().trim());
            }
        }

        CliResult files = git(ctx.ws, root, 60, "show", "--pretty=format:", "--name-status", "--no-renames", "--no-color", target);
        ArrayNode fileArr = out.putArray("files");
        if (files.exitCode == 0) {
            for (String line : files.stdout.split("\n")) {
                if (line.isBlank()) continue;
                String[] p = line.split("\t", 2);
                if (p.length < 2) continue;
                ObjectNode f = fileArr.addObject();
                f.put("status", p[0].trim());
                f.put("path", p[1].trim());
            }
        }

        // Keep a compact text fallback for older UI paths
        String subject = out.path("subject").asText("");
        String author = out.path("author").asText("");
        String date = out.path("date").asText("");
        out.put("output",
                "commit " + out.path("hash").asText(target) + "\n"
                        + "Author: " + author + "\n"
                        + "Date:   " + date + "\n\n"
                        + "    " + subject + "\n");
        return out;
    }

    private ObjectNode remotes(RepoCtx ctx) {
        Path root = Path.of(ctx.repo.path);
        CliResult r = git(ctx.ws, root, 30, "remote", "-v");
        ObjectNode out = mapper().createObjectNode();
        out.put("success", r.exitCode == 0);
        ArrayNode rows = out.putArray("remotes");
        Set<String> seen = new LinkedHashSet<>();
        if (r.exitCode == 0) {
            for (String line : r.stdout.split("\n")) {
                if (line.isBlank()) continue;
                String[] p = line.trim().split("\\s+");
                if (p.length < 2) continue;
                String key = p[0] + "|" + p[1];
                if (!seen.add(key)) continue;
                ObjectNode row = rows.addObject();
                row.put("name", p[0]);
                row.put("url", p[1]);
                if (p.length > 2) {
                    row.put("kind", p[2].replace("(", "").replace(")", ""));
                }
            }
        } else {
            out.put("message", firstLine(r.stderr));
        }
        return out;
    }

    private ObjectNode stage(RepoCtx ctx, List<String> paths, boolean add) {
        Path root = Path.of(ctx.repo.path);
        if (paths.isEmpty()) return fail("No paths provided");
        List<String> args = new ArrayList<>();
        if (add) {
            args.add("add");
            args.add("--");
            args.addAll(paths);
        } else {
            args.add("restore");
            args.add("--staged");
            args.add("--");
            args.addAll(paths);
        }
        return cliResult(ctx, root, 120, args);
    }

    /**
     * Apply a unified-diff hunk (SourceTree-style stage/unstage/discard hunk).
     * action: stage | unstage | discard
     */
    private ObjectNode applyPatch(RepoCtx ctx, JsonNode params) {
        Path root = Path.of(ctx.repo.path);
        String patch = params.path("patch").asText("");
        String action = params.path("action").asText("stage").trim().toLowerCase(Locale.ROOT);
        boolean allowDangerous = params.path("allowDangerous").asBoolean(false);
        if (patch.isBlank()) return fail("Empty patch");
        if (!Set.of("stage", "unstage", "discard").contains(action)) {
            return fail("action must be stage, unstage, or discard");
        }
        if ("discard".equals(action) && !allowDangerous) {
            return denied("Discard hunk requires allowDangerous");
        }
        Path tmp = null;
        try {
            tmp = Files.createTempFile("git-ops-hunk-", ".patch");
            // Ensure trailing newline — git apply is picky.
            String body = patch.endsWith("\n") ? patch : patch + "\n";
            Files.writeString(tmp, body, StandardCharsets.UTF_8);
            List<String> args = new ArrayList<>();
            args.add("apply");
            args.add("--whitespace=nowarn");
            switch (action) {
                case "stage" -> args.add("--cached");
                case "unstage" -> {
                    args.add("--cached");
                    args.add("-R");
                }
                case "discard" -> args.add("-R");
                default -> {
                }
            }
            args.add("--");
            args.add(tmp.toAbsolutePath().toString());
            ObjectNode out = cliResult(ctx, root, 120, args);
            out.put("action", action);
            return out;
        } catch (IOException e) {
            return fail("Failed to write patch: " + e.getMessage());
        } finally {
            if (tmp != null) {
                try {
                    Files.deleteIfExists(tmp);
                } catch (IOException ignored) {
                    // best-effort cleanup
                }
            }
        }
    }

    private ObjectNode discard(RepoCtx ctx, JsonNode params) {
        Path root = Path.of(ctx.repo.path);
        List<String> pathList = paths(params);
        if (pathList.isEmpty()) return fail("No paths provided");
        boolean allowDangerous = params.path("allowDangerous").asBoolean(false);
        if (!allowDangerous) {
            return denied("Discard local changes requires allowDangerous");
        }
        boolean untracked = params.path("untracked").asBoolean(false);
        if (untracked) {
            List<String> args = new ArrayList<>();
            args.add("clean");
            args.add("-f");
            args.add("--");
            args.addAll(pathList);
            return cliResult(ctx, root, 120, args);
        }
        // Drop staged + worktree changes for tracked files.
        List<String> restore = new ArrayList<>();
        restore.add("restore");
        restore.add("--source=HEAD");
        restore.add("--staged");
        restore.add("--worktree");
        restore.add("--");
        restore.addAll(pathList);
        return cliResult(ctx, root, 120, restore);
    }

    private ObjectNode ignore(RepoCtx ctx, List<String> pathList) {
        Path root = Path.of(ctx.repo.path);
        if (pathList.isEmpty()) return fail("No paths provided");
        Path gitignore = root.resolve(".gitignore");
        try {
            String existing = Files.isRegularFile(gitignore)
                    ? Files.readString(gitignore, StandardCharsets.UTF_8)
                    : "";
            StringBuilder sb = new StringBuilder(existing);
            if (!existing.isEmpty() && !existing.endsWith("\n")) {
                sb.append('\n');
            }
            for (String p : pathList) {
                String line = p.replace('\\', '/');
                if (existing.contains(line)) continue;
                sb.append(line).append('\n');
            }
            Files.writeString(gitignore, sb.toString(), StandardCharsets.UTF_8);
            ObjectNode out = mapper().createObjectNode();
            out.put("success", true);
            out.put("message", "Appended to .gitignore");
            out.put("gitignore", gitignore.toString());
            return out;
        } catch (IOException e) {
            return fail("Cannot update .gitignore: " + e.getMessage());
        }
    }

    private ObjectNode commit(RepoCtx ctx, JsonNode params) {
        String message = params.path("message").asText("").trim();
        boolean amend = params.path("amend").asBoolean(false);
        boolean allowDangerous = params.path("allowDangerous").asBoolean(false);
        List<String> args = new ArrayList<>();
        args.add("commit");
        if (amend) {
            if (!allowDangerous) return denied("Amend commit requires allowDangerous");
            args.add("--amend");
            if (message.isBlank()) {
                args.add("--no-edit");
            } else {
                args.add("-m");
                args.add(message);
            }
        } else {
            if (message.isBlank()) return fail("Commit message is required");
            args.add("-m");
            args.add(message);
        }
        return cliResult(ctx, Path.of(ctx.repo.path), 120, args);
    }

    private ObjectNode checkout(RepoCtx ctx, JsonNode params) {
        String ref = params.path("ref").asText("").trim();
        if (ref.isBlank()) return fail("ref is required");
        boolean create = params.path("create").asBoolean(false);
        List<String> args = new ArrayList<>();
        args.add("checkout");
        if (create) args.add("-b");
        args.add(ref);
        return cliResult(ctx, Path.of(ctx.repo.path), 60, args);
    }

    private ObjectNode branchCreate(RepoCtx ctx, JsonNode params) {
        String name = params.path("name").asText("").trim();
        if (name.isBlank()) return fail("branch name is required");
        if (!isSafeRefName(name)) return fail("Invalid branch name: " + name);
        boolean checkout = params.path("checkout").asBoolean(true);
        String startPoint = params.path("startPoint").asText("").trim();
        List<String> args = new ArrayList<>();
        if (checkout) {
            args.add("checkout");
            args.add("-b");
            args.add(name);
            if (!startPoint.isBlank()) args.add(startPoint);
        } else {
            args.add("branch");
            args.add(name);
            if (!startPoint.isBlank()) args.add(startPoint);
        }
        return cliResult(ctx, Path.of(ctx.repo.path), 60, args);
    }

    private ObjectNode branchDelete(RepoCtx ctx, JsonNode params) {
        String name = params.path("name").asText("").trim();
        boolean force = params.path("force").asBoolean(false);
        boolean allowDangerous = params.path("allowDangerous").asBoolean(false);
        if (name.isBlank()) return fail("branch name is required");
        if (force && !allowDangerous) return denied("Force delete branch requires allowDangerous");
        return cliResult(ctx, Path.of(ctx.repo.path), 60, List.of("branch", force ? "-D" : "-d", name));
    }

    private ObjectNode branchRename(RepoCtx ctx, JsonNode params) {
        String oldName = params.path("oldName").asText("").trim();
        String newName = params.path("newName").asText("").trim();
        if (oldName.isBlank() || newName.isBlank()) return fail("oldName and newName are required");
        if (!isSafeRefName(newName)) return fail("Invalid branch name: " + newName);
        return cliResult(ctx, Path.of(ctx.repo.path), 60, List.of("branch", "-m", oldName, newName));
    }

    private ObjectNode merge(RepoCtx ctx, JsonNode params) {
        String ref = params.path("ref").asText("").trim();
        if (ref.isBlank()) return fail("ref is required");
        boolean noFf = params.path("noFf").asBoolean(false);
        List<String> args = new ArrayList<>();
        args.add("merge");
        args.add("--no-edit");
        if (noFf) args.add("--no-ff");
        args.add(ref);
        return cliResult(ctx, Path.of(ctx.repo.path), 300, args);
    }

    private ObjectNode cherryPick(RepoCtx ctx, JsonNode params) {
        String rev = params.path("rev").asText("").trim();
        if (rev.isBlank()) return fail("rev is required");
        return cliResult(ctx, Path.of(ctx.repo.path), 180, List.of("cherry-pick", rev));
    }

    private ObjectNode revert(RepoCtx ctx, JsonNode params) {
        String rev = params.path("rev").asText("").trim();
        if (rev.isBlank()) return fail("rev is required");
        return cliResult(ctx, Path.of(ctx.repo.path), 180, List.of("revert", "--no-edit", rev));
    }

    private ObjectNode abort(RepoCtx ctx, JsonNode params) {
        String kind = params.path("kind").asText("").trim().toLowerCase(Locale.ROOT)
                .replace('_', '-');
        Path root = Path.of(ctx.repo.path);
        return switch (kind) {
            case "merge" -> cliResult(ctx, root, 60, List.of("merge", "--abort"));
            case "rebase" -> cliResult(ctx, root, 120, List.of("rebase", "--abort"));
            case "cherry-pick", "cherrypick" -> cliResult(ctx, root, 60, List.of("cherry-pick", "--abort"));
            default -> fail("kind must be merge, rebase, or cherry-pick");
        };
    }

    /** Resolve a path under the real git dir (works with linked worktrees). */
    private boolean gitPathExists(Workspace ws, Path root, String name) {
        CliResult r = git(ws, root, 10, "rev-parse", "--git-path", name);
        if (r.exitCode != 0) return false;
        String raw = firstLine(r.stdout).trim();
        if (raw.isBlank()) return false;
        Path p = Path.of(raw);
        if (!p.isAbsolute()) p = root.resolve(p).normalize();
        return Files.exists(p);
    }

    private ObjectNode fetch(RepoCtx ctx, JsonNode params) {
        String remote = params.path("remote").asText("").trim();
        List<String> args = new ArrayList<>();
        args.add("fetch");
        args.add("--prune");
        args.add("--progress");
        if (!remote.isBlank()) args.add(remote);
        String label = remote.isBlank() ? "Fetching remotes" : "Fetching " + remote;
        return cliProgressResult(ctx, Path.of(ctx.repo.path), 300, label, args);
    }

    private ObjectNode pull(RepoCtx ctx, JsonNode params) {
        String remote = params.path("remote").asText("").trim();
        String branch = params.path("branch").asText("").trim();
        boolean rebase = params.path("rebase").asBoolean(false);
        List<String> args = new ArrayList<>();
        args.add("pull");
        args.add("--progress");
        if (rebase) args.add("--rebase");
        else args.add("--ff-only");
        if (!remote.isBlank()) {
            args.add(remote);
            if (!branch.isBlank()) args.add(branch);
        }
        String label = rebase ? "Pulling (rebase)" : "Pulling";
        if (!remote.isBlank()) label += " " + remote + (branch.isBlank() ? "" : "/" + branch);
        ObjectNode out = cliProgressResult(ctx, Path.of(ctx.repo.path), 300, label, args);
        out.put("rebase", rebase);
        return out;
    }

    private ObjectNode push(RepoCtx ctx, JsonNode params) {
        boolean force = params.path("force").asBoolean(false);
        boolean allowDangerous = params.path("allowDangerous").asBoolean(false);
        if (force && !allowDangerous) return denied("Force push requires allowDangerous");
        String remote = params.path("remote").asText("origin").trim();
        if (remote.isBlank()) remote = "origin";
        String branch = params.path("branch").asText("").trim();
        List<String> args = new ArrayList<>();
        args.add("push");
        args.add("--progress");
        if (force) args.add("--force-with-lease");
        args.add(remote);
        if (!branch.isBlank()) args.add(branch);
        String label = (force ? "Force pushing → " : "Pushing → ") + remote
                + (branch.isBlank() ? "" : "/" + branch);
        ObjectNode out = cliProgressResult(ctx, Path.of(ctx.repo.path), 300, label, args);
        out.put("force", force);
        return out;
    }

    private ObjectNode reset(RepoCtx ctx, JsonNode params) {
        String mode = params.path("mode").asText("mixed").trim().toLowerCase(Locale.ROOT);
        String rev = params.path("rev").asText("HEAD").trim();
        boolean allowDangerous = params.path("allowDangerous").asBoolean(false);
        if (!Set.of("soft", "mixed", "hard").contains(mode)) {
            return fail("mode must be soft, mixed, or hard");
        }
        if ("hard".equals(mode) && !allowDangerous) {
            return denied("git reset --hard requires allowDangerous");
        }
        return cliResult(ctx, Path.of(ctx.repo.path), 120, List.of("reset", "--" + mode, rev));
    }

    private ObjectNode stash(RepoCtx ctx, JsonNode params) {
        Path root = Path.of(ctx.repo.path);
        String action = params.path("action").asText("list").trim().toLowerCase(Locale.ROOT);
        return switch (action) {
            case "list" -> {
                CliResult r = git(ctx.ws, root, 30, "stash", "list");
                ObjectNode out = mapper().createObjectNode();
                out.put("success", r.exitCode == 0);
                out.put("output", r.stdout);
                ArrayNode items = out.putArray("items");
                for (String line : r.stdout.split("\n")) {
                    if (!line.isBlank()) items.add(line.trim());
                }
                yield out;
            }
            case "push" -> cliResult(ctx, root, 60, List.of("stash", "push", "-u", "-m",
                    params.path("message").asText("git-ops stash")));
            case "pop", "apply", "drop" -> {
                String ref = params.path("ref").asText("").trim();
                if ("drop".equals(action) && !params.path("allowDangerous").asBoolean(false)) {
                    yield denied("stash drop requires allowDangerous");
                }
                List<String> args = new ArrayList<>();
                args.add("stash");
                args.add(action);
                if (!ref.isBlank()) args.add(ref);
                yield cliResult(ctx, root, 60, args);
            }
            default -> fail("Unknown stash action: " + action);
        };
    }

    private ObjectNode cliProgressResult(RepoCtx ctx, Path root, int timeoutSec, String label, List<String> gitArgs) {
        CliResult r = gitProgress(ctx.ws, root, timeoutSec, gitArgs.get(0), label,
                gitArgs.toArray(String[]::new));
        ObjectNode out = mapper().createObjectNode();
        out.put("success", r.exitCode == 0);
        out.put("exitCode", r.exitCode);
        out.put("command", "git " + String.join(" ", gitArgs));
        String cleaned = stripGitProgressNoise(r.stderr.isBlank() ? r.stdout : r.stderr);
        out.put("stdout", r.stdout);
        out.put("stderr", cleaned);
        if (r.exitCode != 0) {
            out.put("message", usefulGitError(cleaned, r.exitCode));
        }
        return out;
    }

    private ObjectNode cliResult(RepoCtx ctx, Path root, int timeoutSec, List<String> gitArgs) {
        CliResult r = git(ctx.ws, root, timeoutSec, gitArgs.toArray(String[]::new));
        ObjectNode out = mapper().createObjectNode();
        out.put("success", r.exitCode == 0);
        out.put("exitCode", r.exitCode);
        out.put("command", "git " + String.join(" ", gitArgs));
        out.put("stdout", r.stdout);
        out.put("stderr", r.stderr);
        if (r.exitCode != 0) {
            out.put("message", firstLine(r.stderr.isBlank() ? r.stdout : r.stderr));
        }
        return out;
    }

    private Path inventoryFile(Workspace ws) {
        Path base = pluginDataDir != null
                ? pluginDataDir
                : Path.of(System.getProperty("java.io.tmpdir"), "datawise-git-ops");
        return base.resolve("workspaces").resolve(safeFile(ws.id)).resolve("repos.json");
    }

    private void loadInventory(Workspace ws) {
        Path file = inventoryFile(ws);
        if (!Files.isRegularFile(file)) return;
        try {
            JsonNode root = mapper().readTree(file.toFile());
            ws.activeRepoId = root.path("activeRepoId").asText(null);
            if (ws.activeRepoId != null && ws.activeRepoId.isBlank()) ws.activeRepoId = null;
            JsonNode arr = root.path("repos");
            if (!arr.isArray()) return;
            for (JsonNode n : arr) {
                String id = n.path("id").asText("");
                String name = n.path("name").asText("");
                String path = n.path("path").asText("");
                if (id.isBlank() || path.isBlank()) continue;
                if (name.isBlank()) name = Path.of(path).getFileName().toString();
                ws.repos.put(id, new Repo(id, name, path));
            }
            if (ws.activeRepoId != null && !ws.repos.containsKey(ws.activeRepoId)) {
                ws.activeRepoId = ws.repos.isEmpty() ? null : ws.repos.keySet().iterator().next();
            }
        } catch (IOException ignored) {
            // start empty
        }
    }

    private void saveInventory(Workspace ws) {
        Path file = inventoryFile(ws);
        try {
            Files.createDirectories(file.getParent());
            ObjectNode root = mapper().createObjectNode();
            root.put("activeRepoId", ws.activeRepoId == null ? "" : ws.activeRepoId);
            ArrayNode arr = root.putArray("repos");
            for (Repo r : ws.repos.values()) {
                ObjectNode n = arr.addObject();
                n.put("id", r.id);
                n.put("name", r.name);
                n.put("path", r.path);
            }
            mapper().writerWithDefaultPrettyPrinter().writeValue(file.toFile(), root);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot save repo inventory: " + e.getMessage(), e);
        }
    }

    private Path demoRepoDir(Workspace ws) {
        Path base = pluginDataDir != null
                ? pluginDataDir
                : Path.of(System.getProperty("java.io.tmpdir"), "datawise-git-ops");
        return base.resolve("demo-repo").toAbsolutePath().normalize();
    }

    private Path ensureDemoRepo(Workspace ws) {
        Path demo = demoRepoDir(ws);
        try {
            Files.createDirectories(demo);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot create demo dir: " + demo, e);
        }
        CliResult inside = git(ws, demo, 30, "rev-parse", "--is-inside-work-tree");
        if (inside.exitCode == 0 && "true".equalsIgnoreCase(firstLine(inside.stdout))) {
            return demo;
        }
        CliResult init = git(ws, demo, 60, "init", "-b", "main");
        if (init.exitCode != 0) {
            throw new IllegalStateException("git init failed: " + firstLine(init.stderr));
        }
        try {
            Files.writeString(demo.resolve("README.md"), """
                    # Git Ops demo

                    Sample repository created by the DataWise Git Ops plugin.
                    """, StandardCharsets.UTF_8);
            Path note = demo.resolve("notes").resolve("hello.txt");
            Files.createDirectories(note.getParent());
            Files.writeString(note, "hello from git-ops\n", StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot write demo files", e);
        }
        git(ws, demo, 30, "config", "user.email", "git-ops-demo@datawise.local");
        git(ws, demo, 30, "config", "user.name", "Git Ops Demo");
        git(ws, demo, 60, "add", ".");
        CliResult commit = git(ws, demo, 60, "commit", "-m", "Initial commit from Git Ops demo");
        if (commit.exitCode != 0) {
            throw new IllegalStateException("demo commit failed: " + firstLine(commit.stderr));
        }
        return demo;
    }

    private static final Pattern GIT_PCT = Pattern.compile(
            "(?i)(Counting|Compressing|Writing|Receiving|Resolving)\\s+[\\w ]+:\\s*(\\d+)%");

    private CliResult git(Workspace ws, Path cwd, int timeoutSec, String... gitArgs) {
        return gitInternal(ws, cwd, timeoutSec, null, gitArgs);
    }

    private CliResult gitProgress(Workspace ws, Path cwd, int timeoutSec, String op, String label, String... gitArgs) {
        emitGitProgress(op, label, null, "start", null);
        final int[] lastPct = { -1 };
        final long[] lastEmit = { 0L };
        try {
            return gitInternal(ws, cwd, timeoutSec, line -> {
                ParsedProgress parsed = parseGitProgress(line);
                long now = System.currentTimeMillis();
                if (parsed != null) {
                    boolean pctChanged = parsed.percent != lastPct[0];
                    boolean due = now - lastEmit[0] >= 120;
                    if (pctChanged || due) {
                        lastPct[0] = parsed.percent;
                        lastEmit[0] = now;
                        emitGitProgress(op, parsed.message, parsed.percent, "running", line.trim());
                    }
                } else {
                    String trimmed = line.trim();
                    if (!trimmed.isBlank() && trimmed.length() < 180 && now - lastEmit[0] >= 250) {
                        lastEmit[0] = now;
                        emitGitProgress(op, label, lastPct[0] >= 0 ? lastPct[0] : null, "running", trimmed);
                    }
                }
            }, gitArgs);
        } finally {
            emitGitProgress(op, label, 100, "done", null);
        }
    }

    private void emitGitProgress(String op, String message, Integer percent, String phase, String detail) {
        ObjectNode params = mapper().createObjectNode();
        params.put("op", op == null ? "" : op);
        params.put("phase", phase == null ? "running" : phase);
        if (message != null && !message.isBlank()) params.put("message", message);
        if (detail != null && !detail.isBlank()) params.put("detail", detail);
        if (percent != null) params.put("percent", Math.max(0, Math.min(100, percent)));
        emitEvent("git/progress", params);
    }

    private record ParsedProgress(String message, int percent) {}

    private static ParsedProgress parseGitProgress(String line) {
        if (line == null || line.isBlank()) return null;
        String cleaned = line.replace("\r", " ").trim();
        // Strip optional "remote: " prefix from server-side progress.
        if (cleaned.regionMatches(true, 0, "remote:", 0, 7)) {
            cleaned = cleaned.substring(7).trim();
        }
        Matcher m = GIT_PCT.matcher(cleaned);
        if (!m.find()) return null;
        String phase = m.group(1);
        int pct;
        try {
            pct = Integer.parseInt(m.group(2));
        } catch (NumberFormatException e) {
            return null;
        }
        String msg = cleaned.length() > 120 ? cleaned.substring(0, 117) + "…" : cleaned;
        if (phase != null && !phase.isBlank()) {
            // Keep a short human label; detail carries the raw line.
            msg = phase + "… " + pct + "%";
        }
        return new ParsedProgress(msg, pct);
    }

    private CliResult gitInternal(Workspace ws, Path cwd, int timeoutSec, Consumer<String> onStderrLine, String... gitArgs) {
        List<String> command = new ArrayList<>();
        command.add(ws.gitBinary);
        command.addAll(Arrays.asList(gitArgs));
        ProcessBuilder pb = new ProcessBuilder(command);
        if (Files.isDirectory(cwd)) {
            pb.directory(cwd.toFile());
        }
        pb.redirectErrorStream(false);
        Map<String, String> env = pb.environment();
        env.put("GIT_TERMINAL_PROMPT", "0");
        env.put("GIT_OPTIONAL_LOCKS", "0");
        // Flush progress lines promptly (SourceTree-style live bar).
        env.put("GIT_PROGRESS_DELAY", "0");
        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();
        try {
            Process p = pb.start();
            Thread tOut = drain(p.getInputStream(), stdout, null);
            Thread tErr = drain(p.getErrorStream(), stderr, onStderrLine);
            boolean finished = p.waitFor(timeoutSec, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                return new CliResult(124, stdout.toString(), stderr + "\n(timeout after " + timeoutSec + "s)");
            }
            tOut.join(2000);
            tErr.join(2000);
            return new CliResult(p.exitValue(), stdout.toString(), stderr.toString());
        } catch (Exception e) {
            return new CliResult(1, stdout.toString(), e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }

    private static Thread drain(java.io.InputStream in, StringBuilder into, Consumer<String> onLine) {
        Thread t = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                // Git progress often uses CR updates on one "line"; read char-by-char for CR/LF.
                StringBuilder buf = new StringBuilder();
                int ch;
                while ((ch = r.read()) != -1) {
                    if (ch == '\r' || ch == '\n') {
                        if (buf.length() > 0) {
                            String line = buf.toString();
                            into.append(line).append('\n');
                            if (onLine != null) {
                                try { onLine.accept(line); } catch (Exception ignored) { }
                            }
                            buf.setLength(0);
                        }
                    } else {
                        buf.append((char) ch);
                    }
                }
                if (buf.length() > 0) {
                    String line = buf.toString();
                    into.append(line).append('\n');
                    if (onLine != null) {
                        try { onLine.accept(line); } catch (Exception ignored) { }
                    }
                }
            } catch (IOException ignored) {
                // process closed
            }
        }, "git-ops-drain");
        t.setDaemon(true);
        t.start();
        return t;
    }

    private static List<String> paths(JsonNode params) {
        List<String> out = new ArrayList<>();
        JsonNode arr = params.path("paths");
        if (arr.isArray()) {
            for (JsonNode n : arr) {
                String p = n.asText("").trim();
                if (!p.isBlank()) out.add(p);
            }
        }
        String single = params.path("path").asText("").trim();
        if (!single.isBlank()) out.add(single);
        return out;
    }

    private static boolean isSafeRefName(String name) {
        if (name == null || name.isBlank()) return false;
        if (name.startsWith("-") || name.contains("..") || name.contains(" ") || name.contains("\\")) {
            return false;
        }
        return name.matches("[A-Za-z0-9._/-]+");
    }

    private static String safeFile(String id) {
        return id.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private static int parseIntSafe(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private static String firstLine(String text) {
        if (text == null || text.isBlank()) return "";
        int nl = text.indexOf('\n');
        return (nl < 0 ? text : text.substring(0, nl)).trim();
    }

    /** Drop CR progress spam (Counting objects: 1% …) so errors stay readable. */
    private static String stripGitProgressNoise(String text) {
        if (text == null || text.isBlank()) return "";
        String normalized = text.replace('\r', '\n');
        StringBuilder out = new StringBuilder();
        for (String line : normalized.split("\n")) {
            String t = line.trim();
            if (t.isEmpty()) continue;
            if (GIT_PCT.matcher(t).find()) continue;
            if (t.regionMatches(true, 0, "remote:", 0, 7)) {
                String rest = t.substring(7).trim();
                if (rest.isEmpty() || GIT_PCT.matcher(rest).find()) continue;
            }
            if (out.length() > 0) out.append('\n');
            out.append(t);
        }
        return out.toString();
    }

    private static String usefulGitError(String cleaned, int exitCode) {
        if (cleaned != null && !cleaned.isBlank()) {
            String first = firstLine(cleaned);
            if (!first.isBlank()) return first;
        }
        return "git exited with code " + exitCode;
    }

    private ObjectNode ok(Object... kv) {
        ObjectNode n = mapper().createObjectNode();
        n.put("ok", true);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            Object key = kv[i];
            Object val = kv[i + 1];
            if (val instanceof Boolean b) n.put(String.valueOf(key), b);
            else if (val instanceof Integer num) n.put(String.valueOf(key), num);
            else n.put(String.valueOf(key), String.valueOf(val));
        }
        return n;
    }

    private ObjectNode fail(String message) {
        ObjectNode n = mapper().createObjectNode();
        n.put("success", false);
        n.put("message", message);
        return n;
    }

    private ObjectNode denied(String message) {
        ObjectNode n = fail(message);
        n.put("denied", true);
        return n;
    }

    private record CliResult(int exitCode, String stdout, String stderr) {}

    private record RepoCtx(Workspace ws, Repo repo) {}

    private static final class Repo {
        final String id;
        final String name;
        final String path;

        Repo(String id, String name, String path) {
            this.id = id;
            this.name = name;
            this.path = path;
        }
    }

    private static final class Workspace {
        final String id;
        final String gitBinary;
        final Map<String, Repo> repos = new LinkedHashMap<>();
        String activeRepoId;

        Workspace(String id, String gitBinary) {
            this.id = id;
            this.gitBinary = gitBinary;
        }

        static Workspace fromConnection(JsonNode connection) {
            JsonNode cfg = connection.path("external_config");
            if (cfg.isMissingNode() || cfg.isNull()) {
                cfg = connection.path("config");
            }
            String id = connection.path("id").asText("anon");
            String gitBinary = cfg.path("gitBinary").asText("git");
            if (gitBinary.isBlank()) gitBinary = "git";
            return new Workspace(id, gitBinary);
        }
    }
}
