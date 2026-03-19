import json
from pathlib import Path
from urllib import error, request

from flask import Flask, jsonify, request as flask_request


PORT = 3001
MASTER_PASS_SERVER_URL = "http://127.0.0.1:8080/master-pass"
PAGES_JSON_PATH = Path(__file__).with_name("pages.json")
TEMP_DIR = Path(__file__).with_name("temp_data")

app = Flask(__name__)


def get_login_hostname_from_pages_json():
    if not PAGES_JSON_PATH.exists():
        return None

    try:
        json_data = json.loads(PAGES_JSON_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return None

    login_titles = json_data.get("login_titles")
    if isinstance(login_titles, list) and login_titles:
        return login_titles[0]

    return None


def read_pages_json():
    if not PAGES_JSON_PATH.exists():
        return {"titles": [], "login_titles": []}

    try:
        return json.loads(PAGES_JSON_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {"titles": [], "login_titles": []}


def prepend_unique(items, value):
    existing = [item for item in items if item != value]
    return [value] + existing


def update_pages_json(hostname, is_login_page):
    pages_json = read_pages_json()
    pages_json.setdefault("titles", [])
    pages_json.setdefault("login_titles", [])

    pages_json["titles"] = prepend_unique(pages_json["titles"], hostname)
    if is_login_page:
        pages_json["login_titles"] = prepend_unique(pages_json["login_titles"], hostname)

    PAGES_JSON_PATH.write_text(json.dumps(pages_json, indent=2))


def save_captured_login(payload):
    TEMP_DIR.mkdir(exist_ok=True)
    filename = f"captured_login_{payload.get('hostname', 'unknown')}.json"
    safe_filename = filename.replace("/", "_")
    (TEMP_DIR / safe_filename).write_text(json.dumps(payload, indent=2))


def post_to_master_pass_server(payload):
    encoded_body = json.dumps(payload).encode("utf-8")
    upstream_request = request.Request(
        MASTER_PASS_SERVER_URL,
        data=encoded_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(upstream_request, timeout=10) as response:
            body = response.read().decode("utf-8")
            return response.status, body
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        return exc.code, body


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200


@app.route("/log-hostname", methods=["POST", "OPTIONS"])
def log_hostname():
    if flask_request.method == "OPTIONS":
        return ("", 204)

    payload = flask_request.get_json(silent=True)
    if not payload:
        return jsonify({"message": "Invalid JSON in request body."}), 400

    hostname = payload.get("hostname")
    is_login_page = payload.get("isLoginPage")

    if hostname is None or is_login_page is None:
        return jsonify({"message": "Invalid request body. Missing hostname or isLoginPage."}), 400

    update_pages_json(hostname, bool(is_login_page))
    return jsonify({"status": "success", "message": "Hostname logged."}), 200


@app.route("/capture-website-login", methods=["POST", "OPTIONS"])
def capture_website_login():
    if flask_request.method == "OPTIONS":
        return ("", 204)

    payload = flask_request.get_json(silent=True)
    if not payload:
        return jsonify({"message": "Invalid JSON in request body."}), 400

    save_captured_login(payload)
    return jsonify({"status": "success", "message": "Website login captured."}), 200


@app.route("/log-data", methods=["POST", "OPTIONS"])
def log_data():
    if flask_request.method == "OPTIONS":
        return ("", 204)

    received_data = flask_request.get_json(silent=True)
    if not received_data:
        return jsonify({"message": "Invalid JSON in request body."}), 400

    if "hostname" not in received_data or "isLoginPage" not in received_data:
        return jsonify({"message": "Invalid request body. Missing hostname or isLoginPage."}), 400

    login_hostname = get_login_hostname_from_pages_json()
    if login_hostname:
        received_data["loginPageHostname"] = login_hostname

    try:
        upstream_status, upstream_body = post_to_master_pass_server(received_data)
    except Exception as exc:
        return jsonify(
            {
                "message": "Failed to authenticate with master server.",
                "status": "error",
                "error": str(exc),
                "password": None,
            }
        ), 500

    try:
        upstream_json = json.loads(upstream_body)
    except json.JSONDecodeError:
        return jsonify(
            {
                "message": "Invalid response from master server.",
                "status": "error",
                "password": None,
            }
        ), 500

    # Keep the popup flow simple by always returning 200 for handled auth responses.
    if upstream_status in (200, 401):
        return jsonify(
            {
                "message": upstream_json.get("message", "Unknown response from server."),
                "status": upstream_json.get("status", "error"),
                "password": upstream_json.get("password"),
            }
        ), 200

    return jsonify(
        {
            "message": "Failed to authenticate with master server.",
            "status": "error",
            "error": upstream_json.get("error", upstream_body),
            "password": None,
        }
    ), 500


if __name__ == "__main__":
    print(f"Python bridge server running on http://127.0.0.1:{PORT}")
    app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False)
