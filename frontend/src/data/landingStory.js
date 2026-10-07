/**
 * SAGARDRISHTI master journey data — the narrative spine.
 * Progress windows mirror CinematicText chapters.
 */

export const CHAPTERS = [
  { id: 'signal', num: '01', title: 'THE SIGNAL', start: 0.075, end: 0.18, label: 'Every voyage leaves a signal' },
  { id: 'movement', num: '02', title: 'VESSEL MOVEMENT', start: 0.18, end: 0.30, label: 'Movement becomes data' },
  { id: 'patterns', num: '03', title: 'MARITIME PATTERNS', start: 0.30, end: 0.52, label: 'Thousands become a pattern' },
  { id: 'port', num: '04', title: 'THE PORT', start: 0.58, end: 0.70, label: 'Every voyage meets a port' },
  { id: 'congestion', num: '05', title: 'CONGESTION', start: 0.70, end: 0.79, label: 'Waiting begins' },
  { id: 'fusion', num: '06', title: 'DATA FUSION', start: 0.79, end: 0.85, label: 'Six streams converge' },
  { id: 'warehouse', num: '07', title: 'DATA WAREHOUSE', start: 0.85, end: 0.895, label: 'Structured intelligence' },
  { id: 'olap', num: '08', title: 'OLAP', start: 0.885, end: 0.915, label: 'Every angle' },
  { id: 'ml', num: '09', title: 'MACHINE LEARNING', start: 0.905, end: 0.94, label: 'Learning the sea' },
  { id: 'predict', num: '10', title: 'PREDICTION', start: 0.925, end: 0.958, label: 'Four hours early' },
  { id: 'decide', num: '11', title: 'DECISION SUPPORT', start: 0.954, end: 0.982, label: 'People in control' },
  { id: 'outcome', num: '12', title: 'THE OUTCOME', start: 0.968, end: 0.986, label: 'Potentially less waiting' },
]

export const AIS_TELEMETRY = {
  vesselName: 'SAGAR SHAKTI · IMO 9842104',
  position: '18.92° N · 72.85° E',
  speed: '11.4 kn',
  heading: '062° NE',
  vesselType: 'Post-Panamax Container',
  draught: '12.8 m',
  destination: 'JNPT / Nhava Sheva',
  eta: '14:30 IST',
  status: 'Underway using engine',
  tagline: 'Demonstration values · Illustrative AIS telemetry',
}

export const DATA_STREAMS = [
  { id: 'ais', name: 'AIS TELEMETRY', color: '#5EEAD4', detail: 'Positional beacons, SOG, COG & rate of turn' },
  { id: 'port', name: 'PORT ACTIVITY', color: '#38BDF8', detail: 'Berth allocation, crane gang rates & yard density' },
  { id: 'weather', name: 'WEATHER DYNAMICS', color: '#93C5FD', detail: 'Barometric trends, wind shear & visibility vectors' },
  { id: 'ocean', name: 'OCEAN HYDRAULICS', color: '#22D3EE', detail: 'Tidal heights, swell periods & surface drift' },
  { id: 'geo', name: 'GEOSPATIAL CHANNELS', color: '#2DD4BF', detail: 'Bathymetry, anchorage boundaries & TSS lanes' },
  { id: 'history', name: 'HISTORICAL LOGS', color: '#A5B4FC', detail: 'Seasonal turnaround baselines & dwell models' },
]

export const ML_PIPELINE = [
  { stage: '01', name: 'DATA INGESTION', type: 'Multi-source stream normalization', status: 'ACTIVE' },
  { stage: '02', name: 'SPATIAL-TEMPORAL FUSION', type: 'Trajectory smoothing & geospatial indexing', status: 'ACTIVE' },
  { stage: '03', name: 'FEATURE EXTRACTION', type: 'Channel occupancy & approach velocity gradients', status: 'OPTIMIZED' },
  { stage: '04', name: 'PREDICTIVE ENGINES', type: 'Congestion risk, turnaround ETA & dwell regression', status: 'CONVERGED' },
  { stage: '05', name: 'DECISION SUPPORT', type: 'Operational window ranking & advisory generation', status: 'OPERATIONAL' },
]

export const ML_CAPABILITIES = [
  {
    title: 'CLASSIFICATION',
    metric: 'Congestion Risk Index',
    value: 'Elevated (Tier 2)',
    subtext: 'Identifies anchorage choke risk 4–8 hours ahead',
    color: '#F59E0B',
  },
  {
    title: 'REGRESSION',
    metric: 'Estimated Waiting Time',
    value: '8.4 hrs (illustrative)',
    subtext: 'Confidence interval ±32 min vs 14.1 hr baseline',
    color: '#22D3EE',
  },
  {
    title: 'CLUSTERING',
    metric: 'Traffic Pattern Profiling',
    value: 'TSS Outer Swarm',
    subtext: 'Groups multi-vessel holding loops into spatial clusters',
    color: '#818CF8',
  },
]

export const DECISION_METRICS = {
  currentCongestion: 'HIGH',
  projectedWait: '8.4 HRS (ILLUSTRATIVE)',
  alternativeWindow: 'WINDOW B (+3.5 HRS)',
  projectedSavings: 'POTENTIAL 3.1 HR DWELL REDUCTION',
  disclaimer: 'Advisory decision support only. SAGARDRISHTI does not navigate or steer vessels.',
}
