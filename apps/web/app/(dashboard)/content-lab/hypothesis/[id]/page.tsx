import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { HypothesisEditor } from '@/features/content-lab/HypothesisEditor'
import type { ContentRecommendation, ContentRecommendationType } from '@creator-hub/types'
import { PageHeader } from '@/components/ui/page-header'

export default async function HypothesisPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: rec } = await supabase
    .from('content_recommendations')
    .select('id, post_id, type, reason, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!rec) notFound()

  let post: ContentRecommendation['post'] | undefined
  if (rec.post_id) {
    const { data } = await supabase
      .from('posts')
      .select('caption, media_type, permalink')
      .eq('id', rec.post_id)
      .maybeSingle()
    if (data) {
      post = {
        caption:   data.caption,
        mediaType: data.media_type,
        permalink: data.permalink,
      }
    }
  }

  const recommendation: ContentRecommendation = {
    id:        rec.id,
    postId:    rec.post_id,
    type:      rec.type as ContentRecommendationType,
    reason:    rec.reason,
    createdAt: rec.created_at,
    post,
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <Link
            href="/content-lab"
            className="transition-colors hover:text-foreground"
          >
            ← Content Lab
          </Link>
        }
        title="Hypothèse éditoriale"
      />

      <HypothesisEditor recommendation={recommendation} />
    </div>
  )
}
