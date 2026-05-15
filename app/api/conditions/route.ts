import { NextRequest, NextResponse } from 'next/server'

// ── NIFC NFDRS: ERC percentile for the campsite's Predictive Service Area ──────
// Returns the higher of current and forecasted ERC percentile (0-100), or null.
async function getNFDRSErcPercentile(lat: number, lon: number): Promise<number | null> {
  try {
    const psaParams = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'PSANationalCode',
      returnGeometry: 'false',
      f: 'json',
    })
    const psaUrl =
      `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/` +
      `NFDRS_ERC_and_BI_Percentiles_and_Trends/FeatureServer/1/query?${psaParams.toString()}`
    const psaRes = await fetch(psaUrl, { signal: AbortSignal.timeout(6000) })
    if (!psaRes.ok) return null
    const psaData = await psaRes.json()
    const psaCode = psaData?.features?.[0]?.attributes?.PSANationalCode
    if (!psaCode) return null

    const ercParams = new URLSearchParams({
      where: `PSANationalCode='${psaCode}'`,
      outFields: 'avg_erc_percentile,avg_erc_fcast_percentile',
      f: 'json',
    })
    const ercUrl =
      `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/` +
      `NFDRS_ERC_and_BI_Percentiles_and_Trends/FeatureServer/5/query?${ercParams.toString()}`
    const ercRes = await fetch(ercUrl, { signal: AbortSignal.timeout(6000) })
    if (!ercRes.ok) return null
    const ercData = await ercRes.json()
    const attrs = ercData?.features?.[0]?.attributes
    if (!attrs) return null
    const current = typeof attrs.avg_erc_percentile === 'number' ? attrs.avg_erc_percentile : 0
    const forecast = typeof attrs.avg_erc_fcast_percentile === 'number' ? attrs.avg_erc_fcast_percentile : 0
    return Math.max(current, forecast)
  } catch {
    return null
  }
}

// ── USGS stream gauges: find nearby sites then get current stage ratio ─────────
async function getStreamStageRatio(
  minLon: number, minLat: number, maxLon: number, maxLat: number
): Promise<number | null> {
  try {
    const bbox = `${minLon.toFixed(4)},${minLat.toFixed(4)},${maxLon.toFixed(4)},${maxLat.toFixed(4)}`

    // Try direct IV query with bbox first (faster, works for many regions)
    const ivDirectUrl =
      `https://waterservices.usgs.gov/nwis/iv/?format=json` +
      `&bBox=${bbox}&parameterCd=00065&period=P1D&siteType=ST`
    const ivRes = await fetch(ivDirectUrl, { signal: AbortSignal.timeout(6000) })
    if (ivRes.ok) {
      const ivData = await ivRes.json()
      const ratio = extractMaxStageRatio(ivData)
      if (ratio !== null) return ratio
    }
    return null
  } catch {
    return null
  }
}

function extractMaxStageRatio(ivData: unknown): number | null {
  const timeSeries: unknown[] =
    (ivData as { value?: { timeSeries?: unknown[] } })?.value?.timeSeries ?? []
  if (timeSeries.length === 0) return null
  let maxStage = 0
  for (const ts of timeSeries) {
    const raw = (ts as {
      values?: { value?: { value?: string }[] }[]
    })?.values?.[0]?.value?.[0]?.value
    const stage = raw != null ? parseFloat(raw) : NaN
    if (Number.isFinite(stage) && stage > maxStage) maxStage = stage
  }
  // 30 ft is a typical high-water benchmark across most gauged US streams
  return Math.min(1, maxStage / 30)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const distance = searchParams.get('distance')
  if (!address || !startDate || !endDate || !distance) {
    return NextResponse.json(
      { error: 'Missing address or startDate or endDate or distance' },
      { status: 400 }
    )
  }

  // ── Geocoding with fallback query variants ─────────────────────────────────
  const queryVariants = [
    address,
    address.replace(/\s+\d{5}(?:-\d{4})?$/, '').trim(),
    address.split(',').map((part) => part.trim()).slice(-3).join(', '),
    address.split(',').map((part) => part.trim()).slice(-2).join(', '),
  ]
  const uniqueQueries = Array.from(new Set(queryVariants.filter(Boolean)))

  let geocodeMatch: { lat: string; lon: string } | null = null
  for (const query of uniqueQueries) {
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=us`
    const geoRes = await fetch(geocodeUrl, { headers: { 'User-Agent': 'scout-app' } })
    if (!geoRes.ok) continue
    const geoData = await geoRes.json()
    if (Array.isArray(geoData) && geoData.length > 0) {
      geocodeMatch = geoData[0]
      break
    }
  }

  if (!geocodeMatch) {
    return NextResponse.json(
      { error: 'Address not found. Try a more specific address, nearby landmark, or city/state.' },
      { status: 404 }
    )
  }

  const lat = parseFloat(geocodeMatch.lat)
  const lon = parseFloat(geocodeMatch.lon)

  // ── Date clamping ──────────────────────────────────────────────────────────
  const startDateObj = new Date(startDate)
  const endDateObj = new Date(endDate)
  if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }
  const maxForecastDate = new Date()
  maxForecastDate.setDate(maxForecastDate.getDate() + 16)
  const clampedStart = startDateObj > maxForecastDate ? maxForecastDate : startDateObj
  const clampedEndCandidate = endDateObj > maxForecastDate ? maxForecastDate : endDateObj
  const clampedEnd = clampedEndCandidate < clampedStart ? clampedStart : clampedEndCandidate
  const formattedStart = clampedStart.toISOString().split('T')[0]
  const formattedEnd = clampedEnd.toISOString().split('T')[0]
  const forecastDateClamped =
    startDateObj > maxForecastDate || endDateObj > maxForecastDate

  // ── Bounding boxes ─────────────────────────────────────────────────────────
  /* The above code is written in TypeScript and it is setting a value for the variable
  `fireSearchRadiusKm`. */
  const distanceNum = parseInt(distance) || 10
  const fireSearchRadius = Math.max(distanceNum, 50)
  const fireSearchRadiusKm = Math.max(distanceNum*1.4, 25)
  const latOffset = fireSearchRadiusKm / 111.32
  const lonOffset = fireSearchRadiusKm / (111.32 * Math.cos(lat * Math.PI / 180))
  const minLat = lat - latOffset
  const maxLat = lat + latOffset
  const minLon = lon - lonOffset
  const maxLon = lon + lonOffset

  // ── URL construction ───────────────────────────────────────────────────────

  // Weather: add uv_index_max to existing daily params
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weathercode,precipitation_sum,precipitation_probability_max,windspeed_10m_max,temperature_2m_max,uv_index_max` +
    `&temperature_unit=fahrenheit&timezone=auto&start_date=${formattedStart}&end_date=${formattedEnd}`

  const airQualityUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=us_aqi` +
    `&timezone=auto&start_date=${formattedStart}&end_date=${formattedEnd}`

  const fireParams = new URLSearchParams({
    f: 'json',
    where: '1=1',
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(fireSearchRadius),
    units: 'esriSRUnit_StatuteMile',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
  })
  const fireUrl =
    `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/` +
    `WFIGS_Incident_Locations_Current/FeatureServer/0/query?${fireParams.toString()}`

  // Point elevation (kept separate for the single elevation value used in bear risk)
  const elevationUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`

  // Terrain roughness: 3×3 grid of 9 points at ~1 km spacing around the campsite
  const step = 0.009 // ~1 km
  const gridPoints: { lat: number; lon: number }[] = []
  for (const dLat of [-step, 0, step]) {
    for (const dLon of [-step, 0, step]) {
      gridPoints.push({ lat: lat + dLat, lon: lon + dLon })
    }
  }
  const terrainUrl =
    `https://api.open-meteo.com/v1/elevation` +
    `?latitude=${gridPoints.map((p) => p.lat).join(',')}` +
    `&longitude=${gridPoints.map((p) => p.lon).join(',')}`

  // NWS active alerts for the campsite point
  const nwsAlertsUrl =
    `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`

  // US Drought Monitor — current drought category at this location
  const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const droughtUrl =
    `https://usdm.climate.gov/api/getAoiSeriesData?AOI=${lat},${lon}` +
    `&startdate=${todayStr}&enddate=${todayStr}&statisticsType=1`

  // FEMA flood zone — same ArcGIS REST pattern as fire data
  const femaParams = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'FLD_ZONE,ZONE_SUBTY',
    returnGeometry: 'false',
    f: 'json',
  })
  const femaUrl =
    `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query?${femaParams.toString()}`

  // iNaturalist bear observations within 100 km, past 90 days
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const inatD1 = ninetyDaysAgo.toISOString().split('T')[0]
  const inatUrl =
    `https://api.inaturalist.org/v1/observations?taxon_id=41944` +
    `&lat=${lat}&lng=${lon}&radius=100&quality_grade=research` +
    `&d1=${inatD1}&per_page=50&order_by=observed_on`

  // GBIF bear occurrences within the bounding box, last 2 years — broader population signal
  const currentYear = new Date().getFullYear()
  const gbifBearUrl =
    `https://api.gbif.org/v1/occurrence/search?genus=Ursus` +
    `&decimalLatitude=${minLat.toFixed(3)},${maxLat.toFixed(3)}` +
    `&decimalLongitude=${minLon.toFixed(3)},${maxLon.toFixed(3)}` +
    `&hasCoordinate=true&year=${currentYear - 2},${currentYear}&limit=0`

  // ── All independent fetches in parallel ────────────────────────────────────
  const [
    weatherRes,
    airRes,
    fireRes,
    elevationRes,
    terrainRes,
    nwsRes,
    droughtRes,
    femaRes,
    inatRes,
    gbifRes,
    streamStageRatio,
    nfdrsErcPercentile,
  ] = await Promise.all([
    fetch(weatherUrl),
    fetch(airQualityUrl),
    fetch(fireUrl, { headers: { 'User-Agent': 'scout-app', Accept: 'application/json' } }),
    fetch(elevationUrl),
    fetch(terrainUrl),
    fetch(nwsAlertsUrl, {
      headers: { Accept: 'application/geo+json', 'User-Agent': 'scout-app' },
    }).catch(() => null),
    fetch(droughtUrl, { signal: AbortSignal.timeout(6000) }).catch(() => null),
    fetch(femaUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null),
    fetch(inatUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null),
    fetch(gbifBearUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null),
    getStreamStageRatio(minLon, minLat, maxLon, maxLat),
    getNFDRSErcPercentile(lat, lon),
  ])

  if (!weatherRes.ok) {
    return NextResponse.json(
      {
        error:
          'Unable to fetch weather forecast right now. Please try again, and keep trip dates within 15 days from today for best forecast coverage.',
      },
      { status: 502 }
    )
  }

  const weatherData = await weatherRes.json()
  const airQualityUnavailable = !airRes.ok
  const airData = airRes.ok ? await airRes.json() : { hourly: { us_aqi: [] } }

  // ── Point elevation ────────────────────────────────────────────────────────
  let elevation: number | null = null
  if (elevationRes.ok) {
    const elevData = await elevationRes.json()
    const value = elevData?.elevation?.[0]
    elevation = typeof value === 'number' ? value : null
  }

  // ── Terrain roughness grid ─────────────────────────────────────────────────
  let terrainElevations: number[] = []
  if (terrainRes.ok) {
    const terrainData = await terrainRes.json()
    const raw: unknown[] = terrainData?.elevation ?? []
    terrainElevations = raw.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v)
    )
  }

  // ── Fire incidents ─────────────────────────────────────────────────────────
  let fireData: Array<Record<string, unknown>> = []
  if (fireRes.ok) {
    const fireJson = await fireRes.json()
    const features = Array.isArray(fireJson?.features) ? fireJson.features : []
    fireData = features
      .filter((feature: { attributes?: Record<string, unknown> }) => {
        const category = String(feature?.attributes?.IncidentTypeCategory ?? '').toUpperCase()
        return category === 'WF'
      })
      .map((feature: { geometry?: { x?: number; y?: number }; attributes?: Record<string, unknown> }) => {
        const fLat = feature?.geometry?.y
        const fLon = feature?.geometry?.x
        if (typeof fLat !== 'number' || typeof fLon !== 'number') return null
        return {
          lat: fLat,
          lon: fLon,
          incidentName: feature.attributes?.IncidentName ?? null,
          incidentSize: feature.attributes?.IncidentSize ?? null,
          dailyAcres: feature.attributes?.DailyAcres ?? null,
          state: feature.attributes?.POOState ?? null,
          discoveryDateTime: feature.attributes?.FireDiscoveryDateTime ?? null,
        }
      })
      .filter((row: Record<string, unknown> | null): row is Record<string, unknown> => row !== null)
  }

  // ── NWS active alerts ─────────────────────────────────────────────────────
  const nwsAlertEvents: string[] = []
  if (nwsRes && nwsRes.ok) {
    try {
      const nwsData = await nwsRes.json()
      const features: unknown[] = nwsData?.features ?? []
      for (const feat of features) {
        const event = (feat as { properties?: { event?: string } })?.properties?.event
        if (typeof event === 'string' && event.length > 0) nwsAlertEvents.push(event)
      }
    } catch { /* ignore parse errors */ }
  }

  // ── Drought category ──────────────────────────────────────────────────────
  let droughtCategory = 0
  if (droughtRes && droughtRes.ok) {
    try {
      const droughtData = await droughtRes.json()
      const records: unknown[] = Array.isArray(droughtData)
        ? droughtData
        : (droughtData?.data ?? [])
      const latest = records[records.length - 1] as Record<string, unknown> | undefined
      if (latest) {
        for (let d = 4; d >= 0; d--) {
          const val = latest[`D${d}`]
          if (typeof val === 'number' && val > 0) {
            droughtCategory = d
            break
          }
        }
      }
    } catch { /* fall through: droughtCategory stays 0 */ }
  }

  // ── FEMA flood zone ───────────────────────────────────────────────────────
  let floodZone: string | null = null
  if (femaRes && femaRes.ok) {
    try {
      const femaData = await femaRes.json()
      const attrs = femaData?.features?.[0]?.attributes
      if (attrs?.FLD_ZONE) floodZone = String(attrs.FLD_ZONE)
    } catch { /* ignore */ }
  }


  // ── iNaturalist bear sightings ────────────────────────────────────────────
  let bearObservationCount = 0
  const bearSightingDetails: { distanceKm: number; taxon: string; observedOn: string }[] = []
  if (inatRes && inatRes.ok) {
    try {
      const inatData = await inatRes.json()
      const results: unknown[] = inatData?.results ?? []
      for (const obs of results) {
        const o = obs as {
          location?: string
          taxon?: { name?: string }
          observed_on?: string
        }
        if (!o.location) continue
        const taxonName = o.taxon?.name ?? ''
        const BEAR_TAXA = ['Ursus americanus', 'Ursus arctos', 'Ursus maritimus']
        if (!BEAR_TAXA.some((t) => taxonName.startsWith(t))) continue
        const [obsLatStr, obsLonStr] = o.location.split(',')
        const obsLat = parseFloat(obsLatStr)
        const obsLon = parseFloat(obsLonStr)
        if (!Number.isFinite(obsLat) || !Number.isFinite(obsLon)) continue
        const dLat = (obsLat - lat) * Math.PI / 180
        const dLon = (obsLon - lon) * Math.PI / 180
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(lat * Math.PI / 180) *
          Math.cos(obsLat * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2
        const distKm = Math.round(2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
        bearObservationCount++
        bearSightingDetails.push({
          distanceKm: distKm,
          taxon: o.taxon?.name ?? 'Ursus',
          observedOn: o.observed_on ?? '',
        })
      }
    } catch { /* ignore */ }
  }

  // ── GBIF bear occurrence count (broader historical population signal) ─────
  let gbifBearCount = 0
  if (gbifRes && gbifRes.ok) {
    try {
      const gbifData = await gbifRes.json()
      gbifBearCount = typeof gbifData?.count === 'number' ? gbifData.count : 0
    } catch { /* ignore */ }
  }
  // Weight GBIF at ~10% of iNat: 10 GBIF records ≈ 1 iNat observation, capped at 5
  const totalBearObservations = bearObservationCount + Math.min(5, Math.floor(gbifBearCount / 10))

  return NextResponse.json({
    location: { lat, lon, elevation, terrainElevations },
    weather: weatherData,
    airQuality: airData,
    airQualityUnavailable,
    fire: fireData,
    nwsAlertEvents,
    droughtCategory,
    floodZone,
    nfdrsErcPercentile,
    bearObservationCount: totalBearObservations,
    bearSightingDetails: bearSightingDetails.slice(0, 5),
    streamStageRatio,
    ...(forecastDateClamped
      ? {
          forecastNotice:
            'Forecast inputs were capped to the latest available weather window (up to 16 days ahead).',
          forecastWindowUsed: {
            startDate: formattedStart,
            endDate: formattedEnd,
          },
        }
      : {}),
  })
}
