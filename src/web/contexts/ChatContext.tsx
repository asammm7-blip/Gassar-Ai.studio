import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { storage } from '../storage';
import { localModelManager, type LocalModel } from '../local-model-manager';
import { cloudModelService } from '../cloud-model-service';
import { getModelSettings, saveModelSettings } from '../model-settings-storage';
import { clearChatDrafts } from '../chat-drafts';
import { ChatRepository } from '../chat-repository';
import { ChatController } from '../chat-controller';
import { selectConversations } from '../chat-data';
import { exportBackup, parseBackup, previewBackup } from '../backup';
import type { ConnectionMode } from '../connection-mode';
import { formatWebContext, searchWeb } from '../web-search-service';

export type { Message, Conversation, ModelSettings } from '../chat-data';
export type { SendResult } from '../chat-controller';

function makeController() {
  const repository = new ChatRepository(storage);
  const controller = new ChatController({
    repository,
    uuid: () => crypto.randomUUID(),
    activate: (model) => localModelManager.activateModel(model.id),
    cancelLocal: () => localModelManager.stopGeneration(),
    readSettings: (id, namespace) => getModelSettings(id, namespace),
    saveSettings: (id, settings, namespace) => saveModelSettings(id, settings, namespace),
    generate: async (request, signal) => {
      if (signal.aborted) throw new Error('cancelled');
      const s = request.settings;
      const webContext = request.features.web ? formatWebContext(await searchWeb(request.prompt)) : '';
      const promptWithWeb = request.prompt + webContext;
      if (request.route === 'local') {
        return localModelManager.generateResponseWithModelDetailed();
      }
      return cloudModelService.generateResponse({
        provider: request.model.provider!,
        model: request.model.remoteModel!,
        userMessage: promptWithWeb,
        systemPrompt: s.systemInstructions,
        history: request.history,
        attachments: request.attachments,
        temperature: s.temperature,
        topP: s.topP,
        maxOutputTokens: s.nPredict,
        thinking: request.features.thinking,
        signal,
      });
    },
  });
  return controller;
}

function useChatValue(controller: ChatController) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const api = useMemo(
    () => ({
      selectModel: async (model: LocalModel) => {
        await controller.selectModel(model);
        await storage.setItem('activeModel', JSON.stringify(model));
      },
      sendMessage: controller.sendMessage.bind(controller),
      createNewConversation: controller.createNewConversation.bind(controller),
      selectConversation: controller.selectConversation.bind(controller),
      deleteConversation: controller.deleteConversation.bind(controller),
      clearConversations: controller.clearConversations.bind(controller),
      updateModelSettings: controller.updateModelSettings.bind(controller),
      showUserMessage: controller.showUserMessage.bind(controller),
      setConnectionMode: async (mode: ConnectionMode) => {
        await storage.setItem('connectionMode', mode);
        controller.setConnectionMode(mode);
      },
      updateMessage: controller.updateMessage.bind(controller),
      regenerateResponse: controller.regenerateResponse.bind(controller),
      retryMessage: controller.retryMessage.bind(controller),
      editUserMessage: controller.editUserMessage.bind(controller),
      cancelGeneration: controller.cancelGeneration.bind(controller),
      restoreBranch: controller.restoreBranch.bind(controller),
      setSaveHistory: controller.setSaveHistory.bind(controller),
      switchIdentity: controller.switchIdentity.bind(controller),
      updateConversation: controller.updateConversation.bind(controller),
      renameConversation: async (id: string, title: string) => {
        const clean = title.trim().replace(/\s+/g, ' ').slice(0, 80);
        if (clean) await controller.updateConversation(id, { title: clean });
      },
      toggleConversationPinned: async (id: string) => {
        const c = controller.getSnapshot().store.byId[id];
        if (c) await controller.updateConversation(id, { pinned: !c.pinned });
      },
      toggleConversationFavorite: async (id: string) => {
        const c = controller.getSnapshot().store.byId[id];
        if (c) await controller.updateConversation(id, { favorite: !c.favorite });
      },
      toggleConversationArchived: async (id: string) => {
        const c = controller.getSnapshot().store.byId[id];
        if (c) await controller.updateConversation(id, { archived: !c.archived });
      },
      exportBackup: () => exportBackup(controller.exportData()),
      previewBackup,
      importBackup: async (text: string, mode: 'merge' | 'replace') => {
        await controller.importData(parseBackup(text).data, mode);
      },
    }),
    [controller],
  );

  return {
    ...api,
    state: {
      ...snapshot,
      conversationsById: snapshot.store.byId,
      currentId: snapshot.store.currentId,
      conversations: Object.values(snapshot.store.byId),
      currentConversation: snapshot.store.currentId ? snapshot.store.byId[snapshot.store.currentId] : null,
      isLoading: snapshot.pending !== null,
    },
    listConversations: (options: Parameters<typeof selectConversations>[1] = {}) => selectConversations(snapshot.store, options),
  };
}

const ChatContext = createContext<ReturnType<typeof useChatValue> | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [controller] = useState(makeController);
  const value = useChatValue(controller);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      clearChatDrafts();
      await controller.switchIdentity({ kind: 'guest' });
      if (!mounted) return;
      const [mode, savedModelJson, providers] = await Promise.all([
        storage.getItem('connectionMode'),
        storage.getItem('activeModel'),
        cloudModelService.getConfiguredProviders(),
      ]);
      if (!mounted) return;
      let restoredModel: LocalModel | null = null;
      if (savedModelJson) {
        try {
          const parsed = JSON.parse(savedModelJson) as LocalModel;
          if (parsed && parsed.source === 'cloud') restoredModel = parsed;
        } catch {
          restoredModel = null;
        }
      }
      if (!restoredModel) {
        const firstConfigured = cloudModelService
          .getAvailableModels()
          .find((m) => providers[m.provider]);
        if (firstConfigured) {
          restoredModel = {
            id: firstConfigured.id,
            name: firstConfigured.name,
            path: '',
            size: 0,
            type: 'language',
            isLoaded: false,
            isActive: true,
            version: 'cloud',
            description: firstConfigured.description,
            source: 'cloud',
            provider: firstConfigured.provider,
            remoteModel: firstConfigured.model,
            capabilities: firstConfigured.capabilities,
          };
        }
      }
      controller.restoreModel(restoredModel, mode === 'offline' || mode === 'online' ? mode : 'auto');
    })().catch(() => controller.showUserMessage('تعذر استعادة النموذج/الإعدادات؛ اختر النموذج مرة أخرى.'));

    return () => {
      mounted = false;
      void controller.cancelGeneration().catch(() => undefined);
    };
  }, [controller]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChatContext must be used inside ChatProvider');
  return context;
}
