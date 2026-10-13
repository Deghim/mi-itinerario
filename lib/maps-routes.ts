export const MAX_MOBILE_MAP_WAYPOINTS = 3
const MAX_PLACES_PER_ROUTE = MAX_MOBILE_MAP_WAYPOINTS + 2

function withCityContext(label: string) {
  const place = label.trim()
  return /\bSão Paulo\b/i.test(place) ? place : `${place}, São Paulo, Brasil`
}

export interface MapsRouteSegment {
  url: string
  placeCount: number
  mode: MapsTravelMode
}

export type MapsTravelMode = 'walking' | 'transit' | 'driving'
export type RouteStop = { label: string; coordinates?: { lat: number; lon: number } }

export function createDirectMapsRouteUrl(origin: string, destination: string, mode: MapsTravelMode): string {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', origin)
  url.searchParams.set('destination', destination)
  url.searchParams.set('travelmode', mode)
  return url.toString()
}

export function createMapsRouteSegments(placeNames: string[], mode: MapsTravelMode = 'transit'): MapsRouteSegment[] {
  if (placeNames.length < 2) return []
  const segments: MapsRouteSegment[] = []
  let start = 0

  while (start < placeNames.length - 1) {
    const end = Math.min(start + MAX_PLACES_PER_ROUTE - 1, placeNames.length - 1)
    const segment = placeNames.slice(start, end + 1)
    const url = new URL('https://www.google.com/maps/dir/')
    url.searchParams.set('api', '1')
    url.searchParams.set('origin', withCityContext(segment[0]))
    url.searchParams.set('destination', withCityContext(segment.at(-1)!))
    if (segment.length > 2) {
      url.searchParams.set('waypoints', segment.slice(1, -1).map(withCityContext).join('|'))
    }
    url.searchParams.set('travelmode', mode)
    segments.push({ url: url.toString(), placeCount: segment.length, mode })
    start = end
  }

  return segments
}

export function createMapsRouteUrl(stops: RouteStop[], mode: MapsTravelMode): string | null {
  if (stops.length < 2) return null
  const destination = stops.at(-1)!
  const origin = stops[0]
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', withCityContext(origin.label))
  url.searchParams.set('destination', withCityContext(destination.label))
  const waypoints = stops.slice(1, -1)
  if (waypoints.length) url.searchParams.set('waypoints', waypoints.map((stop) => withCityContext(stop.label)).join('|'))
  url.searchParams.set('travelmode', mode)
  return url.toString()
}

export function splitMapsRouteSegments(stops: RouteStop[], mode: MapsTravelMode): MapsRouteSegment[] {
  if (stops.length < 2) return []
  const segments: MapsRouteSegment[] = []
  let start = 0
  while (start < stops.length - 1) {
    const end = Math.min(start + MAX_PLACES_PER_ROUTE - 1, stops.length - 1)
    const url = createMapsRouteUrl(stops.slice(start, end + 1), mode)
    if (url) segments.push({ url, placeCount: end - start + 1, mode })
    start = end
  }
  return segments
}
