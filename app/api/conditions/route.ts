import {NextRequest, NextResponse} from 'next/server'
export async function GET(request:NextRequest) {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const distance = searchParams.get('distance')
    if (!address || !startDate || !endDate || !distance) {
        return NextResponse.json({error: 'Missing address or startDate or endDate or distance'}, {status:400})
    }

// Add geocoding and fetch latitude and longitude with fallback queries.
const queryVariants = [
    address,
    // Drop ZIP for better matching on POIs/park roads.
    address.replace(/\s+\d{5}(?:-\d{4})?$/, "").trim(),
    // Keep only the last 3 comma-separated segments (often place, state, ZIP).
    address.split(",").map((part) => part.trim()).slice(-3).join(", "),
    // Keep only the last 2 comma-separated segments (often city/state).
    address.split(",").map((part) => part.trim()).slice(-2).join(", "),
]
const uniqueQueries = Array.from(new Set(queryVariants.filter(Boolean)))

let geocodeMatch: { lat: string; lon: string } | null = null
let geocodeUrl = ''
for (const query of uniqueQueries) {
    geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=us`
    const geoRes = await fetch(
        geocodeUrl,
        {headers: {'User-Agent': 'scout-app'}}
    )
    if (!geoRes.ok) {
        continue
    }
    const geoData = await geoRes.json()
    if (Array.isArray(geoData) && geoData.length > 0) {
        geocodeMatch = geoData[0]
        break
    }
}

if (!geocodeMatch) {
    return NextResponse.json({error: 'Address not found. Try a more specific address, nearby landmark, or city/state.'}, {status:404})
}

const lat = parseFloat(geocodeMatch.lat)
const lon = parseFloat(geocodeMatch.lon)
let elevation: number | null = null
const elevationUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`
const elevationRes = await fetch(
    elevationUrl
)
if (elevationRes.ok) {
    const elevationData = await elevationRes.json()
    const value = elevationData?.elevation?.[0]
    elevation = typeof value === "number" ? value : null
}
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

// Fetch weather
const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weathercode,precipitation_sum,windspeed_10m_max,temperature_2m_max` +
    `&temperature_unit=fahrenheit&timezone=auto&start_date=${formattedStart}&end_date=${formattedEnd}`
const airQualityUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=us_aqi&timezone=auto&start_date=${formattedStart}&end_date=${formattedEnd}`
const distanceNum = parseInt(distance) || 10
// Fetch fire data from NIFC ArcGIS (current incident locations)
// Pad fire search so incidents just outside the chosen radius still count as nearby.
const fireSearchRadiusKm = Math.max(distanceNum * 1.4, 25)
// Calculate bbox: approximate square around lat,lon with side 2*fireSearchRadiusKm
const latOffset = fireSearchRadiusKm / 111.32; // 1 degree lat ~ 111.32 km
const lonOffset = fireSearchRadiusKm / (111.32 * Math.cos(lat * Math.PI / 180)); // adjust for longitude
const minLat = lat - latOffset;
const maxLat = lat + latOffset;
const minLon = lon - lonOffset;
const maxLon = lon + lonOffset;
const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
const fireParams = new URLSearchParams({
    f: 'json',
    where: '1=1',
    geometry: bbox,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
})
const fireUrl =
    `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/` +
    `WFIGS_Incident_Locations_Current/FeatureServer/0/query?${fireParams.toString()}`
// Run independent upstream data fetches in parallel for faster response times.
const [weatherRes, airRes, fireRes] = await Promise.all([
    fetch(weatherUrl),
    fetch(airQualityUrl),
    fetch(fireUrl, {
        headers: {
            'User-Agent': 'scout-app',
            Accept: 'application/json',
        }
    }),
])

if (!weatherRes.ok) {
    return NextResponse.json({ error: `Weather fetch failed (${weatherRes.status})` }, { status: 502 })
}
const weatherData = await weatherRes.json()

const airQualityUnavailable = !airRes.ok
const airData = airRes.ok ? await airRes.json() : { hourly: { us_aqi: [] } }

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
            const lat = feature?.geometry?.y
            const lon = feature?.geometry?.x
            if (typeof lat !== 'number' || typeof lon !== 'number') {
                return null
            }
            return {
                lat,
                lon,
                incidentName: feature.attributes?.IncidentName ?? null,
                incidentSize: feature.attributes?.IncidentSize ?? null,
                dailyAcres: feature.attributes?.DailyAcres ?? null,
                state: feature.attributes?.POOState ?? null,
                discoveryDateTime: feature.attributes?.FireDiscoveryDateTime ?? null,
            }
        })
        .filter((row: Record<string, unknown> | null): row is Record<string, unknown> => row !== null)
}

return NextResponse.json({
    location: {lat, lon, elevation},
    weather: weatherData,
    airQuality: airData,
    airQualityUnavailable,
    fire: fireData,
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