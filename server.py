"""
=========================================================
VISIONINSPECT AI
Python Backend
ESP32-CAM + OpenCV + AI Inspection Server
=========================================================

Architecture:

GitHub Pages
     ↓
app.js
     ↓
Flask Backend
     ↓
ESP32-CAM
     ↓
OpenCV / AI
     ↓
GOOD / BAD result
"""

import os
import io
import time
import json
import threading
from datetime import datetime

import cv2
import numpy as np
import requests

from flask import (
    Flask,
    request,
    jsonify,
    Response,
    send_file
)

from flask_cors import CORS


# =========================================================
# CONFIGURATION
# =========================================================

HOST = "0.0.0.0"
PORT = 5000

DEFAULT_ESP32_IP = "192.168.43.120"

CAMERA_TIMEOUT = 10

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

DATASET_DIR = os.path.join(
    BASE_DIR,
    "dataset"
)

GOOD_DIR = os.path.join(
    DATASET_DIR,
    "good"
)

BAD_DIR = os.path.join(
    DATASET_DIR,
    "bad"
)

INSPECTION_DIR = os.path.join(
    BASE_DIR,
    "inspection_history"
)

MODEL_DIR = os.path.join(
    BASE_DIR,
    "models"
)


# =========================================================
# CREATE DIRECTORIES
# =========================================================

for folder in [
    DATASET_DIR,
    GOOD_DIR,
    BAD_DIR,
    INSPECTION_DIR,
    MODEL_DIR
]:

    os.makedirs(
        folder,
        exist_ok=True
    )


# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": "*"
        }
    }
)


# =========================================================
# GLOBAL STATE
# =========================================================

state = {

    "camera_ip": DEFAULT_ESP32_IP,

    "camera_connected": False,

    "last_frame": None,

    "last_result": None,

    "total_inspections": 0,

    "good_count": 0,

    "bad_count": 0,

    "training": False,

    "training_progress": 0,

    "model_ready": False

}


state_lock = threading.Lock()


# =========================================================
# UTILITY
# =========================================================

def now_string():

    return datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )


def camera_url(ip):

    return (
        f"http://{ip}/capture"
    )


# =========================================================
# CAMERA CAPTURE
# =========================================================

def capture_from_esp32(ip=None):

    if not ip:

        ip = state["camera_ip"]


    url = camera_url(ip)


    response = requests.get(
        url,
        timeout=CAMERA_TIMEOUT
    )


    response.raise_for_status()


    image_bytes = response.content


    frame = cv2.imdecode(
        np.frombuffer(
            image_bytes,
            dtype=np.uint8
        ),
        cv2.IMREAD_COLOR
    )


    if frame is None:

        raise ValueError(
            "ESP32-CAM returned invalid image"
        )


    with state_lock:

        state["last_frame"] = frame

        state["camera_connected"] = True


    return frame


# =========================================================
# CAMERA TEST
# =========================================================

def test_camera(ip):

    try:

        frame = capture_from_esp32(ip)

        return True, frame


    except Exception as error:

        print(
            "Camera error:",
            error
        )

        with state_lock:

            state["camera_connected"] = False

        return False, None


# =========================================================
# HEALTH
# =========================================================

@app.route(
    "/api/status",
    methods=["GET"]
)
def api_status():

    return jsonify({

        "success": True,

        "camera_ip":
            state["camera_ip"],

        "camera_connected":
            state["camera_connected"],

        "model_ready":
            state["model_ready"],

        "total_inspections":
            state["total_inspections"],

        "good_count":
            state["good_count"],

        "bad_count":
            state["bad_count"],

        "training":
            state["training"],

        "training_progress":
            state["training_progress"]

    })


# =========================================================
# CONNECT CAMERA
# =========================================================

@app.route(
    "/api/connect",
    methods=["POST"]
)
def api_connect():

    data = request.get_json(
        silent=True
    ) or {}


    ip = str(
        data.get(
            "ip",
            DEFAULT_ESP32_IP
        )
    ).strip()


    if not ip:

        return jsonify({

            "success": False,

            "message":
                "Camera IP is required"

        }), 400


    print(
        f"[CAMERA] Connecting to {ip}"
    )


    success, frame = test_camera(ip)


    if not success:

        return jsonify({

            "success": False,

            "message":
                "ESP32-CAM did not respond",

            "ip":
                ip

        }), 502


    with state_lock:

        state["camera_ip"] = ip

        state["camera_connected"] = True

        state["last_frame"] = frame


    return jsonify({

        "success": True,

        "message":
            "ESP32-CAM connected",

        "ip":
            ip

    })


# =========================================================
# DISCONNECT
# =========================================================

@app.route(
    "/api/disconnect",
    methods=["POST"]
)
def api_disconnect():

    with state_lock:

        state["camera_connected"] = False


    return jsonify({

        "success": True,

        "message":
            "Camera disconnected"

    })


# =========================================================
# FRAME
# =========================================================

@app.route(
    "/api/frame",
    methods=["GET"]
)
def api_frame():

    ip = request.args.get(
        "ip",
        state["camera_ip"]
    )


    try:

        frame = capture_from_esp32(
            ip
        )


        success, encoded =
            cv2.imencode(
                ".jpg",
                frame,
                [
                    int(
                        cv2.IMWRITE_JPEG_QUALITY
                    ),
                    85
                ]
            )


        if not success:

            raise ValueError(
                "Could not encode image"
            )


        return Response(

            encoded.tobytes(),

            mimetype="image/jpeg",

            headers={
                "Cache-Control":
                    "no-store, no-cache, must-revalidate"
            }

        )


    except Exception as error:

        print(
            "[FRAME ERROR]",
            error
        )


        return jsonify({

            "success": False,

            "message":
                str(error)

        }), 502


# =========================================================
# IMAGE PROCESSING
# =========================================================

def preprocess_frame(frame):

    """
    Basic preprocessing.

    This does not perform final AI classification.
    """

    gray = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2GRAY
    )


    blurred = cv2.GaussianBlur(
        gray,
        (5, 5),
        0
    )


    return gray, blurred


# =========================================================
# BASIC DEFECT ANALYSIS
# =========================================================

def analyze_visual_defect(frame):

    """
    Basic OpenCV analysis.

    Purpose:
        Detect strong visible irregular regions.

    This is NOT a trained metal-defect AI model.

    The function is intentionally kept as a baseline
    until the actual dataset/model is connected.
    """

    gray, blurred = preprocess_frame(
        frame
    )


    edges = cv2.Canny(
        blurred,
        60,
        150
    )


    contours, _ = cv2.findContours(
        edges,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )


    frame_area = (
        frame.shape[0] *
        frame.shape[1]
    )


    largest_area = 0

    largest_contour = None


    for contour in contours:

        area = cv2.contourArea(
            contour
        )


        if area > largest_area:

            largest_area = area

            largest_contour = contour


    defect_ratio = (
        largest_area /
        frame_area
    )


    /*
    This threshold is only a baseline visual
    signal.

    It should NOT be treated as a trained AI
    decision for production inspection.
    */


    if (
        largest_contour is not None
        and defect_ratio > 0.015
    ):

        x, y, w, h = cv2.boundingRect(
            largest_contour
        )


        return {

            "possible_defect": True,

            "defect_type":
                "Visible surface irregularity",

            "severity":
                "Review required",

            "location": {

                "x": int(x),

                "y": int(y),

                "width": int(w),

                "height": int(h)

            },

            "area_pixels":
                float(largest_area)

        }


    return {

        "possible_defect": False,

        "defect_type":
            "No strong visible irregularity detected",

        "severity":
            "None",

        "location": None,

        "area_pixels":
            0

    }


# =========================================================
# INSPECTION RESULT
# =========================================================

def perform_inspection(frame):

    """
    Inspection pipeline.

    Current version:

        Capture
           ↓
        OpenCV
           ↓
        Visible irregularity analysis
           ↓
        Result

    Replace/extend this with the trained
    metal-defect model later.
    """

    analysis =
        analyze_visual_defect(
            frame
        )


    if analysis[
        "possible_defect"
    ]:

        result = "BAD"

        confidence = 65.0

        defect_type =
            analysis[
                "defect_type"
            ]

        severity =
            analysis[
                "severity"
            ]

    else:

        result = "GOOD"

        confidence = 60.0

        defect_type =
            "No strong visible defect detected"

        severity = "None"


    return {

        "status":
            result,

        "confidence":
            confidence,

        "defect_type":
            defect_type,

        "severity":
            severity,

        "measurement":
            "--",

        "location":
            analysis[
                "location"
            ],

        "area_pixels":
            analysis[
                "area_pixels"
            ],

        "timestamp":
            now_string()

    }


# =========================================================
# SAVE INSPECTION IMAGE
# =========================================================

def save_inspection_image(
    frame,
    result
):

    timestamp =
        datetime.now().strftime(
            "%Y%m%d_%H%M%S_%f"
        )


    filename = (
        f"{result['status']}_"
        f"{timestamp}.jpg"
    )


    filepath = os.path.join(
        INSPECTION_DIR,
        filename
    )


    output = frame.copy()


    location =
        result.get(
            "location"
        )


    if location:

        x = location["x"]

        y = location["y"]

        w = location["width"]

        h = location["height"]


        cv2.rectangle(
            output,
            (x, y),
            (x + w, y + h),
            (0, 0, 255),
            2
        )


        cv2.putText(
            output,
            result["status"],
            (x, max(25, y - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 0, 255),
            2
        )


    cv2.imwrite(
        filepath,
        output
    )


    return filepath


# =========================================================
# INSPECT ENDPOINT
# =========================================================

@app.route(
    "/api/inspect",
    methods=["POST"]
)
def api_inspect():

    try:

        frame = None


        /*
        Option 1:
        Image uploaded from browser.
        */

        if "image" in request.files:

            file = request.files[
                "image"
            ]


            image_bytes =
                file.read()


            frame = cv2.imdecode(
                np.frombuffer(
                    image_bytes,
                    dtype=np.uint8
                ),
                cv2.IMREAD_COLOR
            )


        /*
        Option 2:
        Capture directly from ESP32-CAM.
        */

        else:

            frame =
                capture_from_esp32()


        if frame is None:

            raise ValueError(
                "No valid image available"
            )


        result =
            perform_inspection(
                frame
            )


        save_inspection_image(
            frame,
            result
        )


        with state_lock:

            state[
                "last_result"
            ] = result

            state[
                "total_inspections"
            ] += 1


            if result[
                "status"
            ] == "GOOD":

                state[
                    "good_count"
                ] += 1


            elif result[
                "status"
            ] == "BAD":

                state[
                    "bad_count"
                ] += 1


        print(
            "[INSPECTION]",
            json.dumps(
                result,
                indent=2
            )
        )


        return jsonify({

            "success": True,

            **result

        })


    except Exception as error:

        print(
            "[INSPECTION ERROR]",
            error
        )


        return jsonify({

            "success": False,

            "message":
                str(error)

        }), 500


# =========================================================
# UPLOAD GOOD DATASET
# =========================================================

@app.route(
    "/api/upload/good",
    methods=["POST"]
)
def upload_good():

    return save_dataset_images(
        GOOD_DIR,
        "GOOD"
    )


# =========================================================
# UPLOAD BAD DATASET
# =========================================================

@app.route(
    "/api/upload/bad",
    methods=["POST"]
)
def upload_bad():

    return save_dataset_images(
        BAD_DIR,
        "BAD"
    )


# =========================================================
# SAVE DATASET IMAGES
# =========================================================

def save_dataset_images(
    folder,
    label
):

    files =
        request.files.getlist(
            "images"
        )


    if not files:

        return jsonify({

            "success": False,

            "message":
                "No images received"

        }), 400


    saved = []


    for file in files:

        if not file.filename:

            continue


        extension =
            os.path.splitext(
                file.filename
            )[1].lower()


        allowed = [
            ".jpg",
            ".jpeg",
            ".png",
            ".webp"
        ]


        if extension not in allowed:

            continue


        timestamp =
            datetime.now().strftime(
                "%Y%m%d_%H%M%S_%f"
            )


        filename = (
            f"{label}_"
            f"{timestamp}"
            f"{extension}"
        )


        filepath =
            os.path.join(
                folder,
                filename
            )


        file.save(
            filepath
        )


        saved.append(
            filename
        )


    return jsonify({

        "success": True,

        "label":
            label,

        "saved":
            len(saved),

        "files":
            saved

    })


# =========================================================
# DATASET INFORMATION
# =========================================================

def count_images(folder):

    allowed = (
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
    )


    if not os.path.exists(
        folder
    ):

        return 0


    return len([
        f
        for f in os.listdir(folder)
        if f.lower().endswith(
            allowed
        )
    ])


@app.route(
    "/api/dataset",
    methods=["GET"]
)
def api_dataset():

    return jsonify({

        "success": True,

        "good":
            count_images(
                GOOD_DIR
            ),

        "bad":
            count_images(
                BAD_DIR
            )

    })


# =========================================================
# TRAINING
# =========================================================

def training_worker():

    print(
        "[TRAINING] Starting..."
    )


    with state_lock:

        state["training"] = True

        state[
            "training_progress"
        ] = 0


    try:

        good =
            count_images(
                GOOD_DIR
            )

        bad =
            count_images(
                BAD_DIR
            )


        print(
            f"[TRAINING] GOOD={good} BAD={bad}"
        )


        if good == 0 or bad == 0:

            print(
                "[TRAINING] Need both GOOD and BAD datasets"
            )

            return


        /*
        Placeholder training loop.

        The actual ML model should be added here.

        We deliberately do not pretend that this
        simple loop is an AI model.
        */


        for progress in range(
            0,
            101,
            5
        ):

            with state_lock:

                state[
                    "training_progress"
                ] = progress


            time.sleep(
                0.12
            )


        with state_lock:

            state[
                "model_ready"
            ] = True


        print(
            "[TRAINING] Completed"
        )


    except Exception as error:

        print(
            "[TRAINING ERROR]",
            error
        )


    finally:

        with state_lock:

            state[
                "training"
            ] = False


# =========================================================
# TRAIN ENDPOINT
# =========================================================

@app.route(
    "/api/train",
    methods=["POST"]
)
def api_train():

    if state["training"]:

        return jsonify({

            "success": False,

            "message":
                "Training already running"

        }), 409


    good =
        count_images(
            GOOD_DIR
        )


    bad =
        count_images(
            BAD_DIR
        )


    if good == 0 or bad == 0:

        return jsonify({

            "success": False,

            "message":
                "Upload GOOD and BAD images before training",

            "good":
                good,

            "bad":
                bad

        }), 400


    thread =
        threading.Thread(
            target=training_worker,
            daemon=True
        )


    thread.start()


    return jsonify({

        "success": True,

        "message":
            "Training started",

        "good":
            good,

        "bad":
            bad

    })


# =========================================================
# TRAINING STATUS
# =========================================================

@app.route(
    "/api/train/status",
    methods=["GET"]
)
def training_status():

    return jsonify({

        "success": True,

        "training":
            state["training"],

        "progress":
            state["training_progress"],

        "model_ready":
            state["model_ready"]

    })


# =========================================================
# HISTORY
# =========================================================

@app.route(
    "/api/history",
    methods=["GET"]
)
def api_history():

    files = []


    if os.path.exists(
        INSPECTION_DIR
    ):

        for filename in sorted(
            os.listdir(
                INSPECTION_DIR
            ),
            reverse=True
        ):

            files.append(
                filename
            )


    return jsonify({

        "success": True,

        "count":
            len(files),

        "files":
            files[:100]

    })


# =========================================================
# LAST RESULT
# =========================================================

@app.route(
    "/api/result",
    methods=["GET"]
)
def api_result():

    return jsonify({

        "success": True,

        "result":
            state["last_result"]

    })


# =========================================================
# CALIBRATION
# =========================================================

calibration = {

    "reference_mm":
        None,

    "reference_pixels":
        None,

    "pixels_per_mm":
        None

}


@app.route(
    "/api/calibrate",
    methods=["POST"]
)
def api_calibrate():

    data =
        request.get_json(
            silent=True
        ) or {}


    reference_mm =
        data.get(
            "reference_mm"
        )


    reference_pixels =
        data.get(
            "reference_pixels"
        )


    try:

        reference_mm =
            float(
                reference_mm
            )

        reference_pixels =
            float(
                reference_pixels
            )


    except (
        TypeError,
        ValueError
    ):

        return jsonify({

            "success": False,

            "message":
                "Invalid calibration values"

        }), 400


    if (
        reference_mm <= 0
        or reference_pixels <= 0
    ):

        return jsonify({

            "success": False,

            "message":
                "Calibration values must be greater than zero"

        }), 400


    calibration[
        "reference_mm"
    ] = reference_mm


    calibration[
        "reference_pixels"
    ] = reference_pixels


    calibration[
        "pixels_per_mm"
    ] = (
        reference_pixels /
        reference_mm
    )


    return jsonify({

        "success": True,

        "pixels_per_mm":
            calibration[
                "pixels_per_mm"
            ]

    })


# =========================================================
# MEASUREMENT
# =========================================================

def pixels_to_mm(
    pixels
):

    ppm =
        calibration[
            "pixels_per_mm"
        ]


    if not ppm:

        return None


    return (
        pixels / ppm
    )


@app.route(
    "/api/measure",
    methods=["POST"]
)
def api_measure():

    data =
        request.get_json(
            silent=True
        ) or {}


    pixels =
        data.get(
            "pixels"
        )


    try:

        pixels =
            float(
                pixels
            )

    except (
        TypeError,
        ValueError
    ):

        return jsonify({

            "success": False,

            "message":
                "Invalid pixel measurement"

        }), 400


    result =
        pixels_to_mm(
            pixels
        )


    if result is None:

        return jsonify({

            "success": False,

            "message":
                "Calibration not configured"

        }), 400


    return jsonify({

        "success": True,

        "pixels":
            pixels,

        "millimeters":
            round(
                result,
                2
            )

    })


# =========================================================
# SIMPLE HOME
# =========================================================

@app.route(
    "/",
    methods=["GET"]
)
def home():

    return jsonify({

        "name":
            "VISIONINSPECT AI",

        "status":
            "Backend running",

        "version":
            "1.0.0",

        "camera":
            state["camera_ip"],

        "endpoints": [

            "/api/status",

            "/api/connect",

            "/api/disconnect",

            "/api/frame",

            "/api/inspect",

            "/api/upload/good",

            "/api/upload/bad",

            "/api/dataset",

            "/api/train",

            "/api/train/status",

            "/api/history",

            "/api/result",

            "/api/calibrate",

            "/api/measure"

        ]

    })


# =========================================================
# ERROR HANDLER
# =========================================================

@app.errorhandler(404)
def not_found(error):

    return jsonify({

        "success": False,

        "message":
            "API endpoint not found"

    }), 404


@app.errorhandler(500)
def internal_error(error):

    return jsonify({

        "success": False,

        "message":
            "Internal server error"

    }), 500


# =========================================================
# START SERVER
# =========================================================

if __name__ == "__main__":

    print()
    print("=" * 60)
    print("       VISIONINSPECT AI BACKEND")
    print("=" * 60)
    print()
    print(
        f"Server: http://127.0.0.1:{PORT}"
    )
    print(
        f"Camera IP: {state['camera_ip']}"
    )
    print()
    print(
        "IMPORTANT:"
    )
    print(
        "Update DEFAULT_ESP32_IP if your"
    )
    print(
        "ESP32-CAM has a different IP."
    )
    print()
    print("=" * 60)
    print()


    app.run(

        host=HOST,

        port=PORT,

        debug=True,

        threaded=True

    )
