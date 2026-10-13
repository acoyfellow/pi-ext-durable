import { execFileSync } from "node:child_process";
import { hostname, platform, release } from "node:os";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const run = (command: string, args: string[], cwd: string) => {
	try {
		return execFileSync(command, args, { cwd, encoding: "utf8", timeout: 10_000 }).trim();
	} catch (error) {
		return `(${command} failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)})`;
	}
};

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "machine_report",
		label: "Machine report",
		description: "Report facts that only a real machine can answer: kernel, hostname, files in the working directory, and the last git commit.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const report = {
				platform: platform(),
				kernel: release(),
				hostname: hostname(),
				uname: run("uname", ["-sm"], ctx.cwd),
				files: run("ls", ["-1"], ctx.cwd).split("\n").slice(0, 20),
				lastCommit: run("git", ["log", "--oneline", "-1"], ctx.cwd),
			};

			return {
				content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
				details: report,
			};
		},
	});
}
