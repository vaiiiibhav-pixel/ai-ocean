"""
Flask backend for the SIH26067 3D ocean visualization prototype.

Serves gridded synthetic "numerical ocean model" fields and synthetic
"in-situ observation" (Argo float / buoy) data to the frontend. See
data_gen.py for exactly what is synthetic and how a real data source
would plug in.

Run with:  python -m app.main   (from the backend/ directory)
Then open: http://localhost:8000/
"""

import os

from flask import Flask, jsonify, request, abort, send_from_directory

from . import data_gen as dg

_frontend_dir = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
)

app = Flask(__name__, static_folder=_frontend_dir, static_url_path="")


@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    return resp


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/model/meta")
def model_meta():
    ds = dg.get_model_dataset()
    return jsonify({
        "region": {
            "lon_min": dg.LON_MIN, "lon_max": dg.LON_MAX,
            "lat_min": dg.LAT_MIN, "lat_max": dg.LAT_MAX,
        },
        "depths": ds["depths"].tolist(),
        "times": ds["times"],
        "variables": ["temperature", "salinity"],
    })


@app.get("/api/model/timesteps")
def model_timesteps():
    ds = dg.get_model_dataset()
    return jsonify({"times": ds["times"]})


@app.get("/api/model/field")
def model_field():
    variable = request.args.get("variable", "temperature")
    depth = float(request.args.get("depth", 0))
    time_index = int(request.args.get("time_index", 0))
    if variable not in ("temperature", "salinity"):
        abort(400, description="variable must be temperature or salinity")
    return jsonify(dg.get_field_slice(variable, depth, time_index))


@app.get("/api/model/currents")
def model_currents():
    depth = float(request.args.get("depth", 0))
    time_index = int(request.args.get("time_index", 0))
    return jsonify(dg.get_current_slice(depth, time_index))


@app.get("/api/model/transect")
def model_transect():
    variable = request.args.get("variable", "temperature")
    lat_index = int(request.args.get("lat_index", 10))
    time_index = int(request.args.get("time_index", 0))
    if variable not in ("temperature", "salinity"):
        abort(400, description="variable must be temperature or salinity")
    return jsonify(dg.get_transect(variable, lat_index, time_index))


@app.get("/api/validation/summary")
def validation_summary():
    return jsonify(dg.get_validation_summary())


@app.get("/api/observations")
def observations():
    stations = dg.get_observations()
    return jsonify([
        {
            "id": s["id"], "kind": s["kind"], "lon": s["lon"], "lat": s["lat"],
            "profile_time_label": s["profile_time_label"],
        }
        for s in stations
    ])


@app.get("/api/observations/<station_id>/profile")
def observation_profile(station_id):
    station = dg.get_observation_by_id(station_id)
    if station is None:
        abort(404, description="station not found")
    model_column = dg.get_model_column(station["lon"], station["lat"], station["profile_time_index"])
    return jsonify({"station": station, "model_column": model_column})


# Serve the frontend (so running this file alone is enough to demo).
@app.get("/")
def index():
    return send_from_directory(_frontend_dir, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=False)
