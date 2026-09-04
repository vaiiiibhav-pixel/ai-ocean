#!/usr/bin/env python3
"""
Builds the self-contained, no-backend demo of the ocean 3D visualization
platform by:
  1. exporting the same synthetic dataset (backend/app/data_gen.py) as one
     embedded JSON blob, and
  2. inlining the *same* frontend/js/*.js source files used by the live
     (backend-fetching) app — so the demo is never a hand-maintained fork
     of the rendering logic, just a different data source (see the
     store-selection line in frontend/js/app.js).

Produces two files:
  - demo/standalone.html         a complete, double-click-able HTML file
                                  (for the zipped project / offline demo)
  - demo/artifact_fragment.html   the same content WITHOUT <!doctype>/<html>/
                                  <head>/<body> wrapper tags, for publishing
                                  through a host that adds its own page
                                  skeleton (e.g. the Artifact tool)
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "backend"))

from app import data_gen as dg  # noqa: E402


def export_dataset():
    ds = dg.get_model_dataset()
    stations = dg.get_observations()
    model_columns = {
        s["id"]: dg.get_model_column(s["lon"], s["lat"], s["profile_time_index"])
        for s in stations
    }
    return {
        "region": {
            "lon_min": dg.LON_MIN, "lon_max": dg.LON_MAX,
            "lat_min": dg.LAT_MIN, "lat_max": dg.LAT_MAX,
        },
        "lons": ds["lons"].tolist(),
        "lats": ds["lats"].tolist(),
        "depths": ds["depths"].tolist(),
        "times": ds["times"],
        "temperature": _round4(ds["temperature"].tolist()),
        "salinity": _round4(ds["salinity"].tolist()),
        "u": _round4(ds["u"].tolist()),
        "v": _round4(ds["v"].tolist()),
        "stations": stations,
        "model_columns": model_columns,
    }


def _round4(nested):
    # Recursively round floats to keep the embedded JSON compact.
    if isinstance(nested, list):
        return [_round4(x) for x in nested]
    return round(nested, 4)


def read(*parts):
    with open(os.path.join(ROOT, *parts), "r") as f:
        return f.read()


def extract_app_markup():
    """Pull the <div id="app">...</div> block straight out of the real
    index.html (between the BEGIN_APP/END_APP markers) so the demo build
    can never drift from the live-app markup — single source of truth.
    """
    html = read("frontend", "index.html")
    start = html.index("<!-- BEGIN_APP -->") + len("<!-- BEGIN_APP -->")
    end = html.index("<!-- END_APP -->")
    markup = html[start:end].strip()
    # Demo-specific tweaks: badge text + load-error copy differ slightly
    # from the live app (no backend to blame here).
    markup = markup.replace(
        'class="badge">prototype · synthetic data<',
        'class="badge">standalone demo · synthetic data<',
    )
    markup = markup.replace(
        'Could not reach the backend API. Is the Flask server running (see README)?',
        'Could not load the embedded demo dataset.',
    )
    return markup


def build():
    dataset = export_dataset()
    data_json = json.dumps(dataset, separators=(",", ":"))

    css = read("frontend", "style.css")
    js_files = [
        "colormap.js", "projector.js", "scene.js", "profile-chart.js",
        "transect-chart.js", "datastore-embedded.js", "app.js",
    ]
    js_blobs = [read("frontend", "js", name) for name in js_files]
    app_markup = extract_app_markup()

    body = f"""<title>Ocean 3D Visualization</title>
<style>
{css}
</style>
{app_markup}
<script>
window.OCEAN_DATA = {data_json};
</script>
<script>
{chr(10).join(js_blobs)}
</script>
"""

    os.makedirs(os.path.join(ROOT, "demo"), exist_ok=True)

    standalone = f"<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\" />\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n</head>\n<body>\n{body}\n</body>\n</html>\n"
    with open(os.path.join(ROOT, "demo", "standalone.html"), "w") as f:
        f.write(standalone)

    with open(os.path.join(ROOT, "demo", "artifact_fragment.html"), "w") as f:
        f.write(body)

    print(f"data_json size: {len(data_json) / 1024:.1f} KB")
    print(f"standalone.html size: {len(standalone) / 1024:.1f} KB")
    print("wrote demo/standalone.html and demo/artifact_fragment.html")


if __name__ == "__main__":
    build()
