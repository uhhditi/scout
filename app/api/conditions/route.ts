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
for (const query of uniqueQueries) {
    const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=us`,
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
const elevationRes = await fetch(
    `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`
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
if (startDateObj > maxForecastDate) {
    return NextResponse.json(
        { error: 'Start date is too far in the future. Weather forecasts are only available up to 16 days ahead.' },
        { status: 400 }
    )
}
const clampedEnd = endDateObj > maxForecastDate ? maxForecastDate : endDateObj

const formattedStart = startDateObj.toISOString().split('T')[0]
const formattedEnd = clampedEnd.toISOString().split('T')[0]

// Fetch weather
const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weathercode,precipitation_sum,windspeed_10m_max,temperature_2m_max` +
    `&temperature_unit=fahrenheit&timezone=auto&start_date=${formattedStart}&end_date=${formattedEnd}`
)
if (!weatherRes.ok) {
    return NextResponse.json({ error: `Weather fetch failed (${weatherRes.status})` }, { status: 502 })
}
const weatherData = await weatherRes.json()

//Fetch air quality
const airRes = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=us_aqi&timezone=auto&start_date=${formattedStart}&end_date=${formattedEnd}`
)
const airQualityUnavailable = !airRes.ok
const airData = airRes.ok ? await airRes.json() : { hourly: { us_aqi: [] } }

// Fetch fire data from NASA FIRMS (MODIS/VIIRS)
// Using public JSON endpoint with bbox
const distanceNum = parseInt(distance) || 10
// Calculate bbox: approximate square around lat,lon with side 2*distanceNum km
const latOffset = distanceNum / 111.32; // 1 degree lat ~ 111.32 km
const lonOffset = distanceNum / (111.32 * Math.cos(lat * Math.PI / 180)); // adjust for longitude
const minLat = lat - latOffset;
const maxLat = lat + latOffset;
const minLon = lon - lonOffset;
const maxLon = lon + lonOffset;
const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
const tripDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
const firmsDays = Math.min(tripDays, 10); // FIRMS API max is 10 days
const fireRes = await fetch(
    `https://firms.modaps.eosdis.nasa.gov/api/area/json/MODIS_SP/MCD14DL/${firmsDays}/${bbox}`,
    {headers: {'User-Agent': 'scout-app'}}
)
let fireData = null
if (fireRes.ok) {
    fireData = await fireRes.json()
} else {
    // Fallback to empty array if NASA FIRMS fails
    fireData = []
}

// Fetch water access using Overpass API (OpenStreetMap)
const overpassQuery = `
[out:json];
(
  way["natural"="water"](around:${distanceNum * 1000},${lat},${lon});
  way["water"](around:${distanceNum * 1000},${lat},${lon});
  node["natural"="spring"](around:${distanceNum * 1000},${lat},${lon});
  node["amenity"="drinking_water"](around:${distanceNum * 1000},${lat},${lon});
);
out geom;
`
const waterRes = await fetch(
    `https://overpass-api.de/api/interpreter`,
    {
        method: 'POST',
        body: overpassQuery,
        headers: {'User-Agent': 'scout-app'}
    }
)
let waterData = null
if (waterRes.ok) {
    waterData = await waterRes.json()
} else {
    waterData = { elements: [] }
}

return NextResponse.json({
    location: {lat, lon, elevation},
    weather: weatherData,
    airQuality: airData,
    airQualityUnavailable,
    fire: fireData,
    water: waterData
})
}