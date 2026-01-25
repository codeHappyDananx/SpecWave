import { installMcpFromJson } from './mcp';
import { probeCodexCapabilities, probeMcpServers, probeSkills } from './probe';
import { installSkill } from './skills';

export type CodexCapabilitiesProbeArgs = { includeConnectivityProbe: boolean; projectRoot: string | null };

export async function codexCapabilitiesProbe(args: CodexCapabilitiesProbeArgs) {
  return await probeCodexCapabilities(args);
}

export async function codexMcpProbe(args: CodexCapabilitiesProbeArgs) {
  return await probeMcpServers(args);
}

export async function codexSkillsProbe(args: { projectRoot: string | null }) {
  return await probeSkills(args);
}

export async function codexMcpInstallFromJson(args: { rawJson: string; overwrite: boolean }) {
  return await installMcpFromJson(args);
}

export async function codexSkillInstall(args: {
  source: { kind: 'zip' | 'md' | 'dir'; path: string };
  targetScope: 'user' | 'project';
  projectRoot: string | null;
  overwrite: boolean;
}) {
  return await installSkill(args);
}
