import { memo, useCallback, useMemo, type ReactNode } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatNodeViewProps, TurnTailOwnerProps } from '../contract/slots.ts'
import type { EmbedTextSegment } from './embed-refs.ts'
import { markdownLabels } from '../markdown-labels.ts'
import { AssistantMarkdown } from './AssistantMarkdown.tsx'

/** The assistant renderer's full props: the node view share plus its declared embed child slot. */
type AssistantNodeViewProps = ChatNodeViewProps<'assistant-step'> & PropsRenderSlots<'conversation.chat.embed'>

/** Streaming, settled, and interrupted Assistant states share one keyed renderer instance. */
export const AssistantNodeView = memo(function AssistantNodeView({
  node, useTurnData, turnProcess, openFile, renderMessageImages, fileMentions, renderSlot, t,
}: AssistantNodeViewProps) {
  const data = node.data
  const turn = node.location.kind === 'turn' || node.location.kind === 'step'
    ? node.location.turn
    : undefined
  const tail = useTurnData('turn-tail')
  const owner = useMemo<TurnTailOwnerProps | undefined>(() => {
    if (turn?.status !== 'closed' || data.finalNode === undefined) return undefined
    if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return undefined
    return { turn, seq: data.finalNode.seq, openFile }
  }, [data.finalNode, openFile, tail, turn])
  const mentions = useMemo(
    () => owner === undefined ? undefined : fileMentions(owner),
    [fileMentions, owner],
  )
  const reasoningHidden = turnProcess !== undefined
    && turnProcess.foldable
    && turnProcess.spec.answerStep === data.step
    && turnProcess.spec.inlineReasoning
    && !turnProcess.open
  const revealProcess = useCallback(() => { turnProcess?.setOpen(true) }, [turnProcess])
  const labels = useMemo(() => markdownLabels(t), [t])
  // Embed dispatch: the scheme keys the registered renderer; an unclaimed
  // scheme falls back to ordinary markdown (the line degrades to alt text).
  const renderEmbed = useCallback(
    (segment: Extract<EmbedTextSegment, { kind: 'embed' }>): ReactNode =>
      renderSlot('conversation.chat.embed', {
        scheme: segment.scheme,
        id: segment.id,
        alt: segment.alt,
        raw: segment.raw,
      }, {
        entryKey: segment.scheme,
        fallback: <MarkdownText text={segment.raw} labels={labels} />,
      }),
    [labels, renderSlot],
  )
  return (
    <AssistantMarkdown
      blocks={data.blocks}
      streaming={data.status === 'running'}
      interrupted={data.status === 'interrupted'}
      renderMessageImages={renderMessageImages}
      reasoningHidden={reasoningHidden}
      revealProcess={revealProcess}
      mentions={mentions}
      renderEmbed={renderEmbed}
      t={t}
    />
  )
})
