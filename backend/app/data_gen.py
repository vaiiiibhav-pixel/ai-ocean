"""
Synthetic ocean data generator for the SIH26067 prototype.

IMPORTANT (see README): none of this is real observational or model data.
It is generated with numpy to have the same *shape* and rough *semantics*
as real products so the visualization/integration pipeline can be built
and demoed end-to-end:

  - "model" fields  -> stand in for a numerical ocean model product such as
                       INCOIS GOFS / HYCOM / Copernicus Marine reanalysis:
                       a regular lat/lon/depth/time grid of temperature,
                       salinity and current vectors.
  - "observations"   -> stand in for in-situ platforms such as Argo floats
                       and moored buoys: sparse point locations, each with
                       its own (higher vertical resolution) depth profile
                       that does NOT sit exactly on the model grid — which
                       is the point: the platform's job is to compare the
                       two, not just render one of them.

Swapping this module out for a real loader (xarray + NetCDF for the model
grid, an Argo GDAC index + profile files for observations) is meant to be
the *only* thing that needs to change — main.py only calls the functions
below and does not know or care that the data is synthetic.
"""

import math
import random
from functools import lru_cache

import numpy as np

# ---------------------------------------------------------------------------
# Region & grid definition — Arabian Sea / Bay of Bengal / equatorial Indian
# Ocean, the area covered by INCOIS's operational ocean state forecasts.
# ---------------------------------------------------------------------------
LON_MIN, LON_MAX = 40.0, 100.0
LAT_MIN, LAT_MAX = -10.0, 30.0
N_LON, N_LAT = 21, 21  # ~3 deg lon spacing, ~2 deg lat spacing

DEPTHS = [0, 50, 100, 200, 500]  # metres
N_TIMESTEPS = 6  # synthetic "daily" snapshots
TIME_LABELS = [f"2026-09-{1 + i:02d}" for i in range(N_TIMESTEPS)]

LONS = np.linspace(LON_MIN, LON_MAX, N_LON)
LATS = np.linspace(LAT_MIN, LAT_MAX, N_LAT)

_RNG = np.random.default_rng(26067)


def _thermocline_temp(lat, lon, depth, t):
    """Synthetic sea temperature (deg C)."""
    lat_r = np.deg2rad(lat)
    # Warm pool centred near the equator, cooling poleward.
    base = 29.5 - 6.5 * np.sin(lat_r) ** 2
    # Depth decay (simple thermocline shape).
    depth_term = 1.0 / (1.0 + (depth / 120.0) ** 1.6)
    temp = 4.0 + (base - 4.0) * depth_term

    # Arabian Sea coastal upwelling cell (west boundary), intensifying
    # slightly over the synthetic time series to show seasonal dynamics.
    upwelling_mask = np.exp(-(((lon - 52.0) / 6.0) ** 2)) * np.exp(-(((lat - 15.0) / 8.0) ** 2))
    upwelling_strength = 2.0 + 0.35 * t
    temp = temp - upwelling_strength * upwelling_mask * (1.0 / (1.0 + depth / 60.0))

    # Bay of Bengal slightly warmer/more stratified near-surface.
    bob_mask = np.exp(-(((lon - 88.0) / 8.0) ** 2)) * np.exp(-(((lat - 15.0) / 9.0) ** 2))
    temp = temp + 0.8 * bob_mask * (1.0 / (1.0 + depth / 40.0))

    return temp


def _salinity(lat, lon, depth, t):
    """Synthetic salinity (PSU)."""
    base = 34.7 + 0.15 * np.sin(np.deg2rad(lat))
    # Arabian Sea: saltier (high evaporation, Persian Gulf/Red Sea influence).
    arabian_mask = np.exp(-(((lon - 55.0) / 10.0) ** 2)) * np.exp(-(((lat - 18.0) / 10.0) ** 2))
    base = base + 1.6 * arabian_mask * (1.0 / (1.0 + depth / 100.0))
    # Bay of Bengal: fresher near-surface (Ganges-Brahmaputra discharge),
    # converging back to open-ocean salinity with depth.
    bob_mask = np.exp(-(((lon - 89.0) / 7.0) ** 2)) * np.exp(-(((lat - 18.0) / 9.0) ** 2))
    freshening = 2.6 * bob_mask * np.exp(-depth / 45.0)
    freshening *= 1.0 + 0.05 * t
    sal = base - freshening
    return sal


def _currents(lat, lon, depth, t):
    """Synthetic (u, v) surface-forced current vectors in m/s."""
    lat_r = np.deg2rad(lat)
    phase = 2 * math.pi * (t / N_TIMESTEPS)
    depth_decay = np.exp(-depth / 250.0)

    # Equatorial jet-like eastward flow (Wyrtki-jet inspired), oscillating
    # in strength across the synthetic time series.
    jet = 0.55 * np.exp(-((lat / 4.0) ** 2)) * (0.5 + 0.5 * np.sin(phase))
    u = jet * depth_decay

    # Broad basin-scale gyre component so the field isn't just zonal.
    u = u + 0.18 * np.sin(lat_r * 2.0 + phase) * depth_decay
    v = 0.18 * np.cos(np.deg2rad(lon - 40) * 1.2 + phase) * depth_decay

    # West India Coastal Current-like boundary flow near the west coast.
    coastal_mask = np.exp(-(((lon - 72.0) / 5.0) ** 2))
    v = v + 0.3 * coastal_mask * np.cos(phase) * depth_decay

    return u, v


@lru_cache(maxsize=1)
def get_model_dataset():
    """Full synthetic model grid for every timestep/depth.

    Returns a dict of numpy arrays shaped (time, depth, lat, lon):
      temperature (degC), salinity (PSU), u (m/s), v (m/s)
    plus the coordinate axes.
    """
    lon_grid, lat_grid = np.meshgrid(LONS, LATS)  # each (N_LAT, N_LON)

    shape = (N_TIMESTEPS, len(DEPTHS), N_LAT, N_LON)
    temperature = np.zeros(shape)
    salinity = np.zeros(shape)
    u = np.zeros(shape)
    v = np.zeros(shape)

    for t in range(N_TIMESTEPS):
        for di, depth in enumerate(DEPTHS):
            temperature[t, di] = _thermocline_temp(lat_grid, lon_grid, depth, t)
            salinity[t, di] = _salinity(lat_grid, lon_grid, depth, t)
            uu, vv = _currents(lat_grid, lon_grid, depth, t)
            u[t, di] = uu
            v[t, di] = vv

    # Small deterministic noise so the field doesn't look perfectly analytic.
    noise = _RNG.normal(0, 0.12, size=shape)
    temperature = temperature + noise
    salinity = salinity + _RNG.normal(0, 0.05, size=shape)

    return {
        "lons": LONS,
        "lats": LATS,
        "depths": np.array(DEPTHS),
        "times": TIME_LABELS,
        "temperature": temperature,
        "salinity": salinity,
        "u": u,
        "v": v,
    }


def get_field_slice(variable: str, depth: float, time_index: int):
    """Return a (lat, lon) grid slice for one variable/depth/time as a
    plain nested list, plus the axes — this is what /api/model/field serves.
    """
    ds = get_model_dataset()
    if variable not in ("temperature", "salinity"):
        raise ValueError(f"unknown variable: {variable}")
    di = int(np.argmin(np.abs(ds["depths"] - depth)))
    ti = max(0, min(time_index, N_TIMESTEPS - 1))
    grid = ds[variable][ti, di]
    return {
        "variable": variable,
        "depth": float(ds["depths"][di]),
        "time_index": ti,
        "time_label": ds["times"][ti],
        "lons": ds["lons"].tolist(),
        "lats": ds["lats"].tolist(),
        "values": np.round(grid, 3).tolist(),
    }


def get_current_slice(depth: float, time_index: int):
    ds = get_model_dataset()
    di = int(np.argmin(np.abs(ds["depths"] - depth)))
    ti = max(0, min(time_index, N_TIMESTEPS - 1))
    return {
        "depth": float(ds["depths"][di]),
        "time_index": ti,
        "time_label": ds["times"][ti],
        "lons": ds["lons"].tolist(),
        "lats": ds["lats"].tolist(),
        "u": np.round(ds["u"][ti, di], 3).tolist(),
        "v": np.round(ds["v"][ti, di], 3).tolist(),
    }


# ---------------------------------------------------------------------------
# In-situ observations: synthetic Argo-float-style profiles + a couple of
# moored buoys. Positions are deliberately offset from exact model grid
# points, and profile depths use a finer, irregular vertical resolution —
# both realistic and useful for showing the model-vs-observation comparison.
# ---------------------------------------------------------------------------
PROFILE_DEPTHS = [0, 10, 20, 30, 50, 75, 100, 150, 200, 250, 300, 400, 500, 700, 1000]

_STATION_SEED = [
    # (lon, lat, kind)
    (58.3, 12.7, "argo"), (62.1, 18.4, "argo"), (66.9, 9.2, "argo"),
    (71.4, 15.8, "argo"), (74.6, 6.1, "argo"), (80.2, 11.3, "argo"),
    (85.7, 17.6, "argo"), (90.3, 13.9, "argo"), (94.8, 8.4, "argo"),
    (97.2, 4.7, "argo"), (52.9, 22.1, "argo"), (48.6, 14.3, "argo"),
    (76.8, 2.4, "argo"), (83.1, -4.6, "argo"), (68.5, 24.9, "argo"),
    (60.4, -6.8, "argo"), (89.6, 20.7, "buoy"), (72.8, 19.1, "buoy"),
]


@lru_cache(maxsize=1)
def get_observations():
    ds = get_model_dataset()
    stations = []
    rng = random.Random(26067)
    for i, (lon, lat, kind) in enumerate(_STATION_SEED):
        station_id = f"AR{2900000 + i * 137}" if kind == "argo" else f"BUOY-{i:02d}"
        profile_day = rng.choice(range(N_TIMESTEPS))

        temp_profile = []
        sal_profile = []
        for depth in PROFILE_DEPTHS:
            model_t = float(_thermocline_temp(np.array(lat), np.array(lon), depth, profile_day))
            model_s = float(_salinity(np.array(lat), np.array(lon), depth, profile_day))
            # Observation deliberately differs from the model by a small,
            # depth-correlated offset + noise — the "why do we need both
            # sources" story for the judges.
            depth_factor = 1.0 / (1.0 + depth / 200.0)
            obs_t = model_t + rng.uniform(-0.6, 0.6) * depth_factor + rng.uniform(-0.15, 0.15)
            obs_s = model_s + rng.uniform(-0.35, 0.35) * depth_factor + rng.uniform(-0.08, 0.08)
            temp_profile.append(round(obs_t, 2))
            sal_profile.append(round(obs_s, 2))

        stations.append({
            "id": station_id,
            "kind": kind,
            "lon": lon,
            "lat": lat,
            "profile_time_index": profile_day,
            "profile_time_label": ds["times"][profile_day],
            "depths": PROFILE_DEPTHS,
            "temperature": temp_profile,
            "salinity": sal_profile,
        })
    return stations


def get_observation_by_id(station_id: str):
    for s in get_observations():
        if s["id"] == station_id:
            return s
    return None


def get_transect(variable: str, lat_index: int, time_index: int):
    """A depth-vs-longitude vertical slice at one grid latitude row — the
    data behind the 'vertical cross-section' view. Returns values shaped
    (depth, lon).
    """
    ds = get_model_dataset()
    if variable not in ("temperature", "salinity"):
        raise ValueError(f"unknown variable: {variable}")
    lat_i = max(0, min(lat_index, len(ds["lats"]) - 1))
    ti = max(0, min(time_index, N_TIMESTEPS - 1))
    values = ds[variable][ti, :, lat_i, :]  # (depth, lon)
    return {
        "lat": float(ds["lats"][lat_i]),
        "time_index": ti,
        "time_label": ds["times"][ti],
        "depths": ds["depths"].tolist(),
        "lons": ds["lons"].tolist(),
        "values": np.round(values, 3).tolist(),
    }


def get_validation_summary():
    """Aggregate model-vs-observation skill metrics across every station,
    at each station's own profile time, at the depths the model and the
    observation profiles share. This is the headline number for the
    "why do you need both a model AND observations" pitch.
    """
    stations = get_observations()
    per_var_errors = {"temperature": [], "salinity": []}
    per_station = []

    for s in stations:
        model_col = get_model_column(s["lon"], s["lat"], s["profile_time_index"])
        model_depths = model_col["depths"]
        station_errors = {"temperature": [], "salinity": []}
        for var in ("temperature", "salinity"):
            for di, depth in enumerate(model_depths):
                if depth in s["depths"]:
                    oi = s["depths"].index(depth)
                    err = s[var][oi] - model_col[var][di]
                    per_var_errors[var].append(err)
                    station_errors[var].append(err)

        def _rmse(errs):
            return round(float(np.sqrt(np.mean(np.square(errs)))), 3) if errs else None

        def _bias(errs):
            return round(float(np.mean(errs)), 3) if errs else None

        per_station.append({
            "id": s["id"],
            "temperature_bias": _bias(station_errors["temperature"]),
            "temperature_rmse": _rmse(station_errors["temperature"]),
            "salinity_bias": _bias(station_errors["salinity"]),
            "salinity_rmse": _rmse(station_errors["salinity"]),
        })

    def _agg_rmse(errs):
        return round(float(np.sqrt(np.mean(np.square(errs)))), 3) if errs else None

    def _agg_bias(errs):
        return round(float(np.mean(errs)), 3) if errs else None

    return {
        "n_stations": len(stations),
        "temperature_rmse": _agg_rmse(per_var_errors["temperature"]),
        "temperature_bias": _agg_bias(per_var_errors["temperature"]),
        "salinity_rmse": _agg_rmse(per_var_errors["salinity"]),
        "salinity_bias": _agg_bias(per_var_errors["salinity"]),
        "per_station": per_station,
    }


def get_model_column(lon: float, lat: float, time_index: int):
    """Model temperature/salinity at every model depth level, at the grid
    point nearest (lon, lat) — used to overlay against an observation
    profile so the two sources can be compared directly.
    """
    ds = get_model_dataset()
    ti = max(0, min(time_index, N_TIMESTEPS - 1))
    lon_i = int(np.argmin(np.abs(ds["lons"] - lon)))
    lat_i = int(np.argmin(np.abs(ds["lats"] - lat)))
    return {
        "lon": float(ds["lons"][lon_i]),
        "lat": float(ds["lats"][lat_i]),
        "depths": ds["depths"].tolist(),
        "temperature": np.round(ds["temperature"][ti, :, lat_i, lon_i], 3).tolist(),
        "salinity": np.round(ds["salinity"][ti, :, lat_i, lon_i], 3).tolist(),
    }
