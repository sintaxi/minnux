import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";

export default function (pi: ExtensionAPI) {
  const session = process.env.MINNX_SESSION;
  if (!session) return;

  // Window switcher handler
  const windowHandler = async (args: string, ctx: any) => {
    if (!args) {
      const windows = listWindows();
      if (!windows.length) {
        ctx.ui.notify("No tmux windows found", "error");
        return;
      }
      const choice = await ctx.ui.select("Switch to:", windows);
      if (choice !== undefined) {
        selectWindow(choice);
      }
      return;
    }
    try {
      selectWindow(args.trim());
    } catch (e) {
      ctx.ui.notify(`Window "${args.trim()}" not found`, "error");
    }
  };

  // /w and /window — switch to a tmux window
  pi.registerCommand("w", {
    description: "Switch to a tmux window by name",
    handler: windowHandler,
  });

  pi.registerCommand("window", {
    description: "Switch to a tmux window by name",
    handler: windowHandler,
  });

  // Detach handler
  const detachHandler = async () => {
    try {
      execSync(`tmux detach-client`, { stdio: "pipe" });
    } catch (e) {}
  };

  // /detach and /d — detach from the tmux session
  pi.registerCommand("detach", {
    description: "Detach from the tmux session",
    handler: detachHandler,
  });

  pi.registerCommand("d", {
    description: "Detach from the tmux session",
    handler: detachHandler,
  });

  // F1 — previous tmux window
  pi.registerShortcut("f1", {
    description: "Previous tmux window",
    handler: async () => {
      try {
        execSync(`tmux previous-window -t ${quote(session)}`, { stdio: "pipe" });
      } catch (e) {}
    },
  });

  // F2 — next tmux window
  pi.registerShortcut("f2", {
    description: "Next tmux window",
    handler: async () => {
      try {
        execSync(`tmux next-window -t ${quote(session)}`, { stdio: "pipe" });
      } catch (e) {}
    },
  });

  function listWindows(): string[] {
    try {
      const out = execSync(
        `tmux list-windows -t ${quote(session)} -F "#{window_name}"`,
        { stdio: "pipe" }
      );
      return out.toString().trim().split("\n").filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function selectWindow(name: string) {
    execSync(`tmux select-window -t ${quote(session + ":" + name)}`, { stdio: "pipe" });
  }

  function quote(s: string): string {
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }
}
