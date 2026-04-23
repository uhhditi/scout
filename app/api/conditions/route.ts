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

//Add geocoding and fetch latitude and longitude 
const geoRes = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
    {headers: {'User-Agent': 'scout-app'}}
)
if (!geoRes.ok) {
    return NextResponse.json({ error: 'Weather fetch failed' }, { status: 502 })
}
const geoData = await geoRes.json()
if (!geoData.length) {
    return NextResponse.json({error: 'Address not found'}, {status:404})
}
const lat = parseFloat(geoData[0].lat)
const lon = parseFloat(geoData[0].lon)
const startDateObj = new Date(startDate)
const endDateObj = new Date(endDate)
if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
}
const formattedStart = startDateObj.toISOString().split('T')[0]
const formattedEnd = endDateObj.toISOString().split('T')[0]
// Fetch weather
const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weathercode,precipitation_sum,windspeed_10m_max` +
    `&timezone=auto&start_date=${formattedStart}&end_date=${formattedEnd}`
)
if (!weatherRes.ok) {
    return NextResponse.json({ error: 'Weather fetch failed' }, { status: 502 })
}
const weatherData = await weatherRes.json()

//Fetch air quality
const airRes = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=us_aqi&timezone=auto&start_date=${formattedStart}&end_date=${formattedEnd}`
)
if (!airRes.ok) {
    return NextResponse.json({ error: 'Weather fetch failed' }, { status: 502 })
}
const airData = await airRes.json()

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
const fireRes = await fetch(
    `https://firms.modaps.eosdis.nasa.gov/api/area/json/MODIS_SP/MCD14DL/1/${bbox}`,
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
[bbox=${lat - 0.05},${lon - 0.05},${lat + 0.05},${lon + 0.05}];
(
  way["natural"="water"];
  way["water"];
  node["natural"="spring"];
  node["amenity"="drinking_water"];
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
    waterData = await waterRes.text()
    // Parse OSM XML response - for now just return raw
} else {
    waterData = null
}

return NextResponse.json({
    location: {lat, lon},
    weather: weatherData,
    airQuality: airData,
    fire: fireData,
    water: waterData
})
}