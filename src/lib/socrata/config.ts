/**
 * Seattle Open Data — Customer Service Requests (Find It, Fix It + web portal).
 *
 * Portal page: https://data.seattle.gov/d/5ngg-rpne
 * API docs:    https://dev.socrata.com/foundry/data.seattle.gov/5ngg-rpne
 *
 * Every external request in this app goes through this dataset's SODA
 * resource endpoint. Schema was verified against the live API (see README).
 */
export const SOCRATA_DOMAIN = "data.seattle.gov";
export const DATASET_ID = "5ngg-rpne";
export const DATASET_NAME = "Customer Service Requests";
export const DATASET_PUBLISHER = "City of Seattle";
export const DATASET_PAGE_URL = `https://${SOCRATA_DOMAIN}/d/${DATASET_ID}`;
export const DATASET_API_DOCS_URL = `https://dev.socrata.com/foundry/${SOCRATA_DOMAIN}/${DATASET_ID}`;
export const RESOURCE_URL = `https://${SOCRATA_DOMAIN}/resource/${DATASET_ID}.json`;

/** Source column names, exactly as published by the API. */
export const FIELDS = {
  id: "servicerequestnumber",
  type: "webintakeservicerequests",
  department: "departmentname",
  createdAt: "createddate",
  method: "methodreceivedname",
  status: "servicerequeststatusname",
  address: "location",
  latitude: "latitude",
  longitude: "longitude",
  point: "latitude_longitude",
  zip: "zipcode",
  councilDistrict: "councildistrict",
  precinct: "policeprecinct",
  area: "community_reporting_area",
} as const;

/** Earliest created date present in the dataset (verified 2026-10-20). */
export const DATASET_START_DATE = "2013-01-01";

/**
 * Loose bounding box around the City of Seattle. Coordinates outside it are
 * treated as invalid rather than plotted. Every geolocated record checked
 * during reconnaissance fell inside this box.
 */
export const SEATTLE_BOUNDS = {
  minLat: 47.4,
  maxLat: 47.8,
  minLon: -122.5,
  maxLon: -122.2,
} as const;

/** Most recent requests returned for the map markers and the recent list. */
export const SAMPLE_LIMIT = 2000;

/** Density grid cell size, in decimal degrees (~550 m N–S, ~375 m E–W). */
export const GRID_RESOLUTION = 0.005;

export const REQUEST_TIMEOUT_MS = 20_000;
