import type { TAnalyticsOverview, TChartDataPoint, TMediaType, TPostPerformance, TPeriod } from '@creator-hub/types'

const MEDIA_TYPES: TMediaType[] = ['REEL', 'CAROUSEL_ALBUM', 'IMAGE']

const CAPTIONS = [
  'Comment j\'ai 3x mes saves en changeant ma structure de carousel',
  'La marque m\'a dit non. Voilà pourquoi c\'était la bonne réponse',
  'Mon workflow créateur en 2026 (sans burn out)',
  'Ce reel a touché 40k personnes. Voilà la formule exacte',
  'Négocier son tarif : le script qui m\'a rapporté +30%',
  'Pourquoi je poste moins et gagne plus',
  '5 signaux qu\'une marque est prête à signer',
  'Ma méthode pour valider un concept en 48h',
  'Ce que les stats ne te disent pas sur ton audience',
  'Les 3 formats qui marchent encore en 2026',
  'Comment j\'ai refusé une collab à 5k et bien fait',
  'Mon deck créateur version 2026',
  'Pourquoi les carousels information battent les reels divertissement',
  'J\'ai testé 3 accroches différentes. Résultats surprenants',
  'Les marques qui ont le meilleur ROI créateur en ce moment',
]

function seedRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function generateChartData(days: number): TChartDataPoint[] {
  const rand = seedRandom(42)
  const data: TChartDataPoint[] = []
  const now = new Date('2026-04-20')

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)

    const trendFactor = 1 + (days - i) / days * 0.3
    const weekday = date.getDay()
    const weekendBoost = weekday === 0 || weekday === 6 ? 1.2 : 1

    data.push({
      date: date.toISOString().slice(0, 10),
      reach: Math.round((3000 + rand() * 8000) * trendFactor * weekendBoost),
      saves: Math.round((80 + rand() * 300) * trendFactor),
      shares: Math.round((30 + rand() * 150) * trendFactor),
    })
  }

  return data
}

function generatePosts(count = 15): TPostPerformance[] {
  const rand = seedRandom(99)
  const posts: TPostPerformance[] = []
  const now = new Date('2026-04-20')

  for (let i = 0; i < count; i++) {
    const daysAgo = Math.round(rand() * 88) + 1
    const postedAt = new Date(now)
    postedAt.setDate(postedAt.getDate() - daysAgo)

    const mediaType = MEDIA_TYPES[Math.floor(rand() * MEDIA_TYPES.length)]
    const reach = Math.round(2000 + rand() * 40000)
    const baselineReach = Math.round(5000 + rand() * 10000)
    const saves = Math.round(reach * (0.01 + rand() * 0.04))
    const shares = Math.round(reach * (0.004 + rand() * 0.02))
    const likes = Math.round(reach * (0.03 + rand() * 0.08))
    const comments = Math.round(reach * (0.002 + rand() * 0.01))

    const WEIGHTS = { saves: 0.35, shares: 0.30, comments: 0.15, likes: 0.10, profileVisits: 0.10 }
    const normalizedSaves = Math.min(saves / (baselineReach * 0.03), 1)
    const normalizedShares = Math.min(shares / (baselineReach * 0.015), 1)
    const normalizedComments = Math.min(comments / (baselineReach * 0.008), 1)
    const normalizedLikes = Math.min(likes / (baselineReach * 0.06), 1)
    const score = Math.round(
      (normalizedSaves * WEIGHTS.saves +
        normalizedShares * WEIGHTS.shares +
        normalizedComments * WEIGHTS.comments +
        normalizedLikes * WEIGHTS.likes +
        0.5 * WEIGHTS.profileVisits) * 100,
    )

    posts.push({
      post_id: `post_${i + 1}`,
      media_type: mediaType,
      caption: CAPTIONS[i % CAPTIONS.length],
      permalink: `https://www.instagram.com/p/mock${i + 1}/`,
      posted_at: postedAt.toISOString(),
      score: Math.min(score, 100),
      reach,
      saves,
      shares,
      likes,
      comments,
      baseline_reach: baselineReach,
      reach_delta_pct: Math.round(((reach - baselineReach) / baselineReach) * 100),
    })
  }

  return posts.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
}

function computeTotals(chartData: TChartDataPoint[], halfLen: number) {
  const recent = chartData.slice(halfLen)
  const previous = chartData.slice(0, halfLen)

  const sum = (arr: TChartDataPoint[], key: keyof TChartDataPoint) =>
    arr.reduce((acc, d) => acc + (d[key] as number), 0)

  const reachNow = sum(recent, 'reach')
  const reachPrev = sum(previous, 'reach') || 1
  const savesNow = sum(recent, 'saves')
  const savesPrev = sum(previous, 'saves') || 1
  const sharesNow = sum(recent, 'shares')
  const sharesPrev = sum(previous, 'shares') || 1

  return {
    reach: reachNow,
    saves: savesNow,
    shares: sharesNow,
    reach_delta_pct: Math.round(((reachNow - reachPrev) / reachPrev) * 100),
    saves_delta_pct: Math.round(((savesNow - savesPrev) / savesPrev) * 100),
    shares_delta_pct: Math.round(((sharesNow - sharesPrev) / sharesPrev) * 100),
  }
}

export function getMockAnalyticsOverview(period: TPeriod): TAnalyticsOverview {
  const allChart = generateChartData(90)
  const chartData = allChart.slice(allChart.length - period)
  const allPosts = generatePosts(15)

  const cutoff = new Date('2026-04-20')
  cutoff.setDate(cutoff.getDate() - period)
  const posts = allPosts.filter(p => new Date(p.posted_at) >= cutoff)

  const halfLen = Math.floor(chartData.length / 2)
  const totals = computeTotals(chartData, halfLen)

  return { chart_data: chartData, posts, totals }
}
