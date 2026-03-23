"""
Hook: dangerous_command_blocker
Event: PreToolUse on Bash
Purpose: Block destructive or unsafe commands before they execute.
"""

import json
import re
import sys

BLOCKED_PATTERNS = [
    (r"\bgit\s+push\b", "git push must be done manually"),
    (r"\bgit\s+merge\b", "git merge must be done manually"),
    (r"\bcurl\b", "curl is blocked — no arbitrary network calls"),
    (r"\bwget\b", "wget is blocked — no arbitrary network calls"),
    (r"\bgit\s+checkout\s+--\s", "git checkout -- <file> discards changes — do this manually"),
    (r"\bgit\s+reset\s+--hard\b", "git reset --hard is blocked — destructive"),
    (r"\bgit\s+clean\b", "git clean is blocked — destructive"),
    (r"\bgit\s+force-push\b", "force-push is blocked"),
    (r"\bgit\s+push\s+.*--force\b", "force-push is blocked"),
    (
        r"\brm\s+(-[a-zA-Z]*r|-[a-zA-Z]*f[a-zA-Z]*r|--recursive)\b",
        "recursive rm is blocked — delete files individually or do this manually",
    ),
    (r"\bdocker\b", "docker commands are blocked from agent context"),
    (r"\bkubectl\b", "kubectl commands are blocked from agent context"),
    (
        r"\bproduction\b.*\b(deploy|migrate|seed|reset)\b",
        "production mutations are blocked",
    ),
    (
        r"\b(deploy|migrate|seed|reset)\b.*\bproduction\b",
        "production mutations are blocked",
    ),
]


def main() -> None:
    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        print(json.dumps({"decision": "approve"}))
        return

    tool_name = event.get("tool_name", "")
    tool_input = event.get("tool_input", {})
    if tool_name != "Bash":
        print(json.dumps({"decision": "approve"}))
        return

    command = tool_input.get("command", "")
    for pattern, reason in BLOCKED_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            print(
                json.dumps(
                    {"decision": "block", "reason": f"BLOCKED: {reason}\nCommand: {command}"}
                )
            )
            return

    print(json.dumps({"decision": "approve"}))


if __name__ == "__main__":
    main()
