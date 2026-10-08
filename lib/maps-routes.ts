export const MAX_MOBILE_MAP_WAYPOINTS = 3
const MAX_PLACES_PER_ROUTE = MAX_MOBILE_MAP_WAYPOINTS + 2

export interface MapsRouteSegment {
  url: string
  placeCount: number
}

export function createMapsRouteSegments(placeNames: string[]): MapsRouteSegment[] {
  if (placeNames.length < 2) return []
  const segments: MapsRouteSegment[] = []
  let start = 0

  while (start < placeNames.length - 1) {
    const end = Math.min(start + MAX_PLACES_PER_ROUTE - 1, placeNames.length - 1)
    const segment = placeNames.slice(start, end + 1)
    const url = new URL('https://www.google.com/maps/dir/')
    url.searchParams.set('api', '1')
    url.searchParams.set('origin', `${segment[0]}, São Paulo, Brasil`)
    url.searchParams.set('destination', `${segment.at(-1)}, São Paulo, Brasil`)
    if (segment.length > 2) {
      url.searchParams.set('waypoints', segment.slice(1, -1).map((name) => `${name}, São Paulo, Brasil`).join('|'))
    }
    url.searchParams.set('travelmode', 'transit')
    segments.push({ url: url.toString(), placeCount: segment.length })
    start = end
  }

  return segments
}
