import { ActivepiecesError, AIProviderName, ErrorCode, isNil } from '@activepieces/core-utils'
import { ACTIVEPIECES_CHAT_TIERS, AIProviderModelType, ChatConversationStatus, DEFAULT_CHAT_TIER_ID, GetProviderConfigResponse, OpenAICompatibleProviderConfig, Project, ProjectType, ProviderModelConfig } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { aiProviderService } from '../../ai/ai-provider-service'
import { repoFactory } from '../../core/db/repo-factory'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'
import { ChatConversationEntity } from './chat-conversation-entity'

const STREAMING_STALENESS_TIMEOUT_MS = 2 * 60 * 1_000
const FAST_TIER_ID = 'fast'

// Interactive-eval conversations carry this id prefix (within the 21-char id column) so both the
// eval endpoints and the regular chat path can tell them apart from real user conversations.
export const EVAL_CONVERSATION_ID_PREFIX = 'evalconv'

export function isEvalConversationId(id: string): boolean {
    return id.startsWith(EVAL_CONVERSATION_ID_PREFIX)
}

const conversationRepo = repoFactory(ChatConversationEntity)

async function getConversationOrThrow({ id, platformId, userId, log }: { id: string, platformId: string, userId: string, log?: FastifyBaseLogger }) {
    const conversation = await conversationRepo().findOneBy({ id, platformId, userId })
    if (isNil(conversation)) {
        throw new ActivepiecesError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityId: id, entityType: 'ChatConversation' },
        })
    }
    if (conversation.status === ChatConversationStatus.STREAMING) {
        const msSinceUpdate = Date.now() - new Date(conversation.updated).getTime()
        if (msSinceUpdate > STREAMING_STALENESS_TIMEOUT_MS) {
            await conversationRepo().update(id, { status: ChatConversationStatus.IDLE })
            conversation.status = ChatConversationStatus.IDLE
            log?.warn({ conversation: { id }, stuckForMs: msSinceUpdate }, '[chatHelpers] Recovered stale STREAMING conversation to IDLE')
        }
    }
    return conversation
}

async function getUserProjects({ platformId, userId, log }: { platformId: string, userId: string, log: FastifyBaseLogger }): Promise<Project[]> {
    const users = userService(log)
    const user = await users.getOneOrFail({ id: userId })
    const allProjects = await projectService(log).getAllForUser({
        platformId,
        userId,
        isPrivileged: users.isUserPrivileged(user),
    })
    return allProjects.filter((p) => p.type !== ProjectType.PERSONAL || p.ownerId === userId)
}

async function resolveChatProvider({ platformId, log }: { platformId: string, log: FastifyBaseLogger }): Promise<GetProviderConfigResponse> {
    const chatProvider = await aiProviderService(log).getChatProvider({ platformId })
    if (isNil(chatProvider)) {
        throw new ActivepiecesError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityId: platformId, entityType: 'ChatAiProvider' },
        })
    }
    return chatProvider
}

function resolveTier({ tierId }: { tierId: string | null }) {
    if (tierId) {
        const tier = ACTIVEPIECES_CHAT_TIERS.find((t) => t.id === tierId)
        if (tier) return tier
    }
    const defaultTier = ACTIVEPIECES_CHAT_TIERS.find((t) => t.id === DEFAULT_CHAT_TIER_ID)
    return defaultTier ?? ACTIVEPIECES_CHAT_TIERS[0]
}

function resolveModelIdForProvider({ tier, provider }: { tier: { modelId: string }, provider: AIProviderName }): string {
    const openrouterModelId = tier.modelId
    if (provider === AIProviderName.ACTIVEPIECES || provider === AIProviderName.OPENROUTER) {
        return openrouterModelId
    }
    return openrouterModelId.replace(/^[^/]+\//, '').replace(/\./g, '-')
}

// У CUSTOM-провайдера чат работает со списком моделей из его конфига, а не с зашитыми
// облачными тирами: пользователь селф-хоста сам решает, какие модели отдаёт его эндпоинт.
function customChatModels({ provider, config }: { provider: AIProviderName, config: unknown }): ProviderModelConfig[] | null {
    if (provider !== AIProviderName.CUSTOM) {
        return null
    }
    const parsed = OpenAICompatibleProviderConfig.safeParse(config)
    if (!parsed.success) {
        return null
    }
    const textModels = parsed.data.models.filter((m) => m.modelType === AIProviderModelType.TEXT)
    return textModels.length > 0 ? textModels : null
}

// requestedModelId — это либо id модели CUSTOM-провайдера (новый путь), либо id тира
// ('fast'/'smart'/'premium') из старых разговоров и облачных провайдеров — оба резолвятся тут.
function resolveChatModelId({ requestedModelId, provider, config }: { requestedModelId: string | null, provider: AIProviderName, config: unknown }): string {
    const models = customChatModels({ provider, config })
    if (models) {
        return models.find((m) => m.modelId === requestedModelId)?.modelId ?? models[0].modelId
    }
    const tier = resolveTier({ tierId: requestedModelId })
    return resolveModelIdForProvider({ tier, provider })
}

// Round one of the chat turn runs on the fastest tier so its first token streams in ~400ms
// (the opener + first discovery) — fast enough to replace the bare "Thinking…" gap —
// regardless of which tier the user picked for the main turn.
// Для CUSTOM-провайдера «быстрая» — первая модель его списка (кладите дешёвую первой).
function resolveFastModelId({ provider, config }: { provider: AIProviderName, config?: unknown }): string {
    const models = customChatModels({ provider, config })
    if (models) {
        return models[0].modelId
    }
    return resolveModelIdForProvider({ tier: resolveTier({ tierId: FAST_TIER_ID }), provider })
}

export const chatHelpers = {
    getConversationOrThrow,
    getUserProjects,
    resolveChatProvider,
    resolveTier,
    resolveModelIdForProvider,
    resolveChatModelId,
    resolveFastModelId,
    conversationRepo,
}
