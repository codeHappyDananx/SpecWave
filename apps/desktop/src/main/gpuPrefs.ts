import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type GpuPrefs = {
  angle?: string;
  useGl?: string;
  disableGpu?: boolean;
  fallbackStage?: number;
  updatedAt?: number;
};

const GPU_PREFS_FILE_NAME = 'gpu-preferences.json';

function gpuPrefsFilePath() {
  return path.join(app.getPath('userData'), GPU_PREFS_FILE_NAME);
}

export function loadGpuPrefsSync(): GpuPrefs | null {
  try {
    const raw = JSON.parse(fs.readFileSync(gpuPrefsFilePath(), 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Partial<GpuPrefs>;
    const prefs: GpuPrefs = {};

    if (typeof obj.angle === 'string') prefs.angle = obj.angle;
    if (typeof obj.useGl === 'string') prefs.useGl = obj.useGl;
    if (typeof obj.disableGpu === 'boolean') prefs.disableGpu = obj.disableGpu;
    if (typeof obj.fallbackStage === 'number' && Number.isFinite(obj.fallbackStage)) prefs.fallbackStage = obj.fallbackStage;
    if (typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt)) prefs.updatedAt = obj.updatedAt;

    return prefs;
  } catch {
    return null;
  }
}

export function saveGpuPrefsSync(prefs: GpuPrefs) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(gpuPrefsFilePath(), JSON.stringify(prefs, null, 2), 'utf8');
  } catch (err) {
    console.error(`[SpecWave] 保存 GPU 配置失败：${gpuPrefsFilePath()}`);
    console.error(err);
  }
}

export function clearGpuPrefsSync() {
  try {
    fs.unlinkSync(gpuPrefsFilePath());
  } catch {
    // ignore
  }
}

