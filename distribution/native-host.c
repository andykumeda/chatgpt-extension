// Stable native-messaging launcher. Its bundle-relative runtime travels with app updates.
#include <mach-o/dyld.h>
#include <limits.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
    char executable[PATH_MAX], resolved[PATH_MAX], node[PATH_MAX], host[PATH_MAX], config[PATH_MAX];
    uint32_t size = sizeof(executable);
    if (_NSGetExecutablePath(executable, &size) != 0 || realpath(executable, resolved) == NULL) return 1;
    char *end = strrchr(resolved, '/'); if (!end) return 1; *end = '\0';
    end = strrchr(resolved, '/'); if (!end) return 1; *end = '\0';
    const char *home = getenv("HOME");
    if (!home || home[0] != '/') return 1;
    if (snprintf(node, sizeof(node), "%s/Resources/runtime/node", resolved) >= sizeof(node)
        || snprintf(host, sizeof(host), "%s/Resources/bridge/host.mjs", resolved) >= sizeof(host)
        || snprintf(config, sizeof(config), "%s/Library/Application Support/Local Codex/host-config.json", home) >= sizeof(config)) return 1;
    if (setenv("LOCAL_CODEX_CONFIG", config, 1) != 0) return 1;
    char **child = calloc((size_t)argc + 2, sizeof(char *));
    if (!child) return 1;
    child[0] = node; child[1] = host;
    for (int index = 1; index < argc; index++) child[index + 1] = argv[index];
    execv(node, child);
    fputs("Local Codex bundled runtime could not start. Reinstall the companion app.\n", stderr);
    free(child); return 1;
}
