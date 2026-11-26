export type ConnectionMode = 'online' | 'offline' | 'auto';

export function requiresLocalModel(mode: ConnectionMode): boolean {
  return mode === 'offline';
}

export function canSendMessage(mode: ConnectionMode, hasActiveModel: boolean): boolean {
  return mode !== 'offline' || hasActiveModel;
}
