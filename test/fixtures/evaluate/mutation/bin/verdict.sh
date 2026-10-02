#!/bin/sh
# A shell target for the confinement's audit (Story 1.60): VERDICT_SH names what its own shell processes do before it hands
# the request to verdict.js, which answers as it always does, so a run of it scores like any other. Every act names the file
# VERDICT_TOUCH holds, outside the workspace.
#
#   read      cat the file: an ungranted read by a process that is not Node
#   clean     what a well-behaved script does: system files, a listing of /, the date, its own home and workspace, a file
#             that does not exist and a metadata probe of the ungranted file
#   cleared   read the file from `cat` and the file beside it (its name and `.node`) from Node, each in a process started with an
#             empty environment
#   write     redirect output into the file, which the confinement refuses
#   withheld  cat a file of the evaluation folder
here=$(cd "$(dirname "$0")" && pwd)
case "${VERDICT_SH:-}" in
  read | withheld)
    cat "$VERDICT_TOUCH" >/dev/null 2>&1
    ;;
  clean)
    cat /etc/hosts >/dev/null 2>&1
    ls / >/dev/null
    date >/dev/null
    echo note >"$HOME/note"
    cat "$HOME/note" >/dev/null
    cat "$here/../rules/policy.txt" >/dev/null
    cat "$VERDICT_TOUCH.missing" 2>/dev/null
    stat "$VERDICT_TOUCH" >/dev/null 2>&1
    ;;
  cleared)
    node_binary=$(command -v node)
    env -i /bin/cat "$VERDICT_TOUCH" >/dev/null 2>&1
    env -i "$node_binary" -e 'require("node:fs").readFileSync(process.argv[1])' "$VERDICT_TOUCH.node" >/dev/null 2>&1
    ;;
  write)
    echo x >"$VERDICT_TOUCH" 2>/dev/null
    ;;
esac
exec node "$here/verdict.js" "$@"
