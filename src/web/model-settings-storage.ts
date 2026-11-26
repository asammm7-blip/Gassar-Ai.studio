import { storage } from './storage';
import { DEFAULT_MODEL_SETTINGS, modelSettingsSchema, type ModelSettings } from './chat-data';

const keyFor = (id: string, namespace: string) => `gassar_model_settings_v2:${namespace}:${encodeURIComponent(id)}`;

export async function saveModelSettings(modelId: string, settings: ModelSettings, namespace = 'guest'): Promise<void> {
  const value = JSON.stringify(modelSettingsSchema.parse(settings));
  await storage.setItem(keyFor(modelId, namespace), value);
}

export async function getModelSettings(modelId: string, namespace = 'guest'): Promise<ModelSettings> {
  const current = await storage.getItem(keyFor(modelId, namespace));
  if (current) return modelSettingsSchema.parse(JSON.parse(current));
  return getDefaultSettings();
}

export function getDefaultSettings(): ModelSettings {
  return { ...DEFAULT_MODEL_SETTINGS };
}
