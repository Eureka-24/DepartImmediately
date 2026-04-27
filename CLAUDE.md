# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a local intelligent route planning system (智能路线规划系统) - a single-page frontend application for generating personalized travel itineraries with map visualization.

**Main file**: `trip_plan.html` - Pure frontend HTML/CSS/JS application, no build step required.

## Key Dependencies

### External APIs
- **Amap (高德地图)** JS API v2.0 via `webapi.amap.com/loader.js`
- API keys configured in `config.js` (not committed to git)

### External Libraries (CDN)
- Google Fonts: Cormorant Garamond, DM Sans
- Flatpickr v4.6.13 for datetime picker

### Skills
- `skills/amap-jsapi-skill/` - Amap JS API integration reference documentation
  - `SKILL.md` - Main skill file with usage instructions
  - `references/` - API reference docs (routing.md, marker.md, map-init.md, etc.)

## Configuration

API keys must be configured before running:
1. Copy `config.js.example` to `config.js`
2. Fill in `AMAP_KEY` and `AMAP_SECURITY_CODE`

```javascript
// config.js
const AMAP_KEY = 'YOUR_AMAP_JSAPI_KEY';
const AMAP_SECURITY_CODE = 'YOUR_AMAP_SECURITY_JS_CODE';
```

## Architecture

### Core Data Structure
```javascript
const cityData = {
    beijing: {
        name: '北京',
        center: [lng, lat],
        landmarks: [{ name, lng, lat }, ...]
    },
    // ... other cities
};
```
Six cities supported: Beijing, Shanghai, Hangzhou, Chengdu, Xi'an, Chongqing.

### Key Functions
- `initMap(city)` - Initialize Amap with city landmarks
- `drawRoute(city, routeIndices)` - Draw route polyline on map
- `generateRoute(city, preferences)` - Generate random route based on preferences
- `generateItinerary(...)` - Format itinerary text output
- `typewriterEffect(text)` - Animated text display

### Custom Components
- **CustomSelect** - City dropdown (replaces native select)
- **Flatpickr** - Datetime picker for start/end time

## Performance Considerations

- Map uses `viewMode: '2D'` (not 3D) for better performance
- Minimal use of `backdrop-filter: blur()` (removed in optimization)
- Simplified CSS gradients and shadows
- No external build tools or bundlers

## File Structure

```
├── trip_plan.html       # Main application (HTML+CSS+JS)
├── config.js            # API keys (gitignored)
├── config.js.example    # Template for config.js
├── SPEC.md              # Project specification
├── doc/需求.md           # Requirements document
├── skills/
│   └── amap-jsapi-skill/  # Amap skill documentation
└── .gitignore           # Ignores config.js
```

## Running the Application

Open `trip_plan.html` directly in a browser. No server required for local development.
