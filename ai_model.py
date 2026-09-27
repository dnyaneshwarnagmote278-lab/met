# ============================================================
# VISIONINSPECT AI
# AI MODEL / COMPUTER VISION ENGINE
# ============================================================

import os
import cv2
import json
import numpy as np
from datetime import datetime


# ------------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------------

MODEL_DIR = "models"
RESULT_DIR = "inspection_history"

os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(RESULT_DIR, exist_ok=True)


# ------------------------------------------------------------
# AI ENGINE
# ------------------------------------------------------------

class VisionInspectAI:

    def __init__(self):
        self.model_ready = False
        self.last_result = None

        self.model_file = os.path.join(
            MODEL_DIR,
            "visioninspect_model.json"
        )

        self.load_model()

    # --------------------------------------------------------
    # LOAD MODEL
    # --------------------------------------------------------

    def load_model(self):

        if os.path.exists(self.model_file):

            try:
                with open(self.model_file, "r") as file:
                    data = json.load(file)

                self.model_ready = data.get(
                    "model_ready",
                    False
                )

            except Exception:
                self.model_ready = False

        else:
            self.model_ready = False

    # --------------------------------------------------------
    # SAVE MODEL INFORMATION
    # --------------------------------------------------------

    def save_model(self, dataset_info=None):

        data = {
            "model_ready": True,
            "created": datetime.now().isoformat(),
            "dataset": dataset_info or {},
            "model_type": "OpenCV Vision Inspection"
        }

        with open(self.model_file, "w") as file:
            json.dump(data, file, indent=4)

        self.model_ready = True

    # --------------------------------------------------------
    # IMAGE PREPROCESSING
    # --------------------------------------------------------

    def preprocess(self, image):

        if image is None:
            return None

        # Resize while maintaining a useful inspection size
        image = cv2.resize(
            image,
            (640, 480)
        )

        # Noise reduction
        blurred = cv2.GaussianBlur(
            image,
            (5, 5),
            0
        )

        return blurred

    # --------------------------------------------------------
    # EDGE DETECTION
    # --------------------------------------------------------

    def detect_edges(self, image):

        gray = cv2.cvtColor(
            image,
            cv2.COLOR_BGR2GRAY
        )

        edges = cv2.Canny(
            gray,
            50,
            150
        )

        return edges

    # --------------------------------------------------------
    # DEFECT DETECTION
    # --------------------------------------------------------

    def detect_defects(self, image):

        processed = self.preprocess(image)

        if processed is None:
            return {
                "defect_found": False,
                "defects": []
            }

        edges = self.detect_edges(processed)

        contours, _ = cv2.findContours(
            edges,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        defects = []

        height, width = processed.shape[:2]

        image_area = width * height

        for contour in contours:

            area = cv2.contourArea(contour)

            # Ignore extremely small objects/noise
            if area < 100:
                continue

            x, y, w, h = cv2.boundingRect(
                contour
            )

            contour_area_ratio = (
                area / image_area
            )

            # Large irregular regions are treated
            # as possible visual defects.
            if contour_area_ratio > 0.002:

                perimeter = cv2.arcLength(
                    contour,
                    True
                )

                if perimeter == 0:
                    continue

                circularity = (
                    4 * np.pi * area
                ) / (perimeter * perimeter)

                defects.append({
                    "x": int(x),
                    "y": int(y),
                    "width": int(w),
                    "height": int(h),
                    "area_pixels": int(area),
                    "circularity": round(
                        float(circularity),
                        3
                    )
                })

        return {
            "defect_found": len(defects) > 0,
            "defects": defects
        }

    # --------------------------------------------------------
    # DEFECT CLASSIFICATION
    # --------------------------------------------------------

    def classify_defect(self, defect):

        area = defect["area_pixels"]
        circularity = defect["circularity"]

        if area > 15000:
            defect_type = "Large Surface Defect"
            severity = "HIGH"

        elif area > 5000:
            defect_type = "Surface Irregularity"
            severity = "MEDIUM"

        else:
            defect_type = "Small Surface Defect"
            severity = "LOW"

        if circularity < 0.25:
            shape = "Irregular"

        elif circularity > 0.75:
            shape = "Rounded"

        else:
            shape = "Mixed"

        return {
            "type": defect_type,
            "severity": severity,
            "shape": shape
        }

    # --------------------------------------------------------
    # CONFIDENCE ESTIMATION
    # --------------------------------------------------------

    def calculate_confidence(
        self,
        defects,
        image
    ):

        if image is None:
            return 0

        if len(defects) == 0:
            return 96

        largest_area = max(
            d["area_pixels"]
            for d in defects
        )

        image_area = (
            image.shape[0] *
            image.shape[1]
        )

        ratio = (
            largest_area /
            image_area
        )

        confidence = 70 + (
            min(ratio, 0.15) / 0.15
        ) * 25

        return int(
            min(confidence, 95)
        )

    # --------------------------------------------------------
    # MAIN INSPECTION
    # --------------------------------------------------------

    def inspect(self, image):

        if image is None:
            return {
                "success": False,
                "error": "Invalid image"
            }

        start_time = datetime.now()

        detection = self.detect_defects(
            image
        )

        defects = detection["defects"]

        classified_defects = []

        for defect in defects:

            classification = (
                self.classify_defect(
                    defect
                )
            )

            defect.update(
                classification
            )

            classified_defects.append(
                defect
            )

        confidence = (
            self.calculate_confidence(
                defects,
                image
            )
        )

        if len(defects) == 0:

            result = "GOOD"

            severity = "NONE"

            defect_type = "No Visible Defect"

        else:

            result = "BAD"

            severity_levels = {
                "LOW": 1,
                "MEDIUM": 2,
                "HIGH": 3
            }

            severity = max(
                (
                    d["severity"]
                    for d in defects
                ),
                key=lambda x:
                    severity_levels[x]
            )

            defect_type = (
                classified_defects[0]["type"]
            )

        processing_time = (
            datetime.now() -
            start_time
        ).total_seconds()

        result_data = {

            "success": True,

            "result": result,

            "status": result,

            "confidence": confidence,

            "defect_found": (
                len(defects) > 0
            ),

            "defect_count": len(defects),

            "defect_type": defect_type,

            "severity": severity,

            "defects": classified_defects,

            "processing_time": round(
                processing_time,
                3
            ),

            "timestamp":
                datetime.now().isoformat()
        }

        self.last_result = result_data

        return result_data

    # --------------------------------------------------------
    # DRAW DETECTIONS ON IMAGE
    # --------------------------------------------------------

    def draw_results(
        self,
        image,
        result
    ):

        output = image.copy()

        defects = result.get(
            "defects",
            []
        )

        for defect in defects:

            x = defect["x"]
            y = defect["y"]
            w = defect["width"]
            h = defect["height"]

            # Red rectangle around detected region
            cv2.rectangle(
                output,
                (x, y),
                (x + w, y + h),
                (0, 0, 255),
                3
            )

            label = (
                defect["type"]
                + " | "
                + defect["severity"]
            )

            cv2.putText(
                output,
                label,
                (x, max(y - 10, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 0, 255),
                2
            )

        # Overall result

        result_text = (
            "RESULT: "
            + result.get(
                "result",
                "UNKNOWN"
            )
        )

        cv2.putText(
            output,
            result_text,
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 255, 0)
            if result.get("result") == "GOOD"
            else (0, 0, 255),
            3
        )

        return output


# ------------------------------------------------------------
# GLOBAL AI ENGINE
# ------------------------------------------------------------

ai_engine = VisionInspectAI()


# ------------------------------------------------------------
# SIMPLE FUNCTION FOR SERVER.PY
# ------------------------------------------------------------

def inspect_image(image):

    return ai_engine.inspect(image)


def draw_inspection_result(
    image,
    result
):

    return ai_engine.draw_results(
        image,
        result
    )


# ------------------------------------------------------------
# TEST
# ------------------------------------------------------------

if __name__ == "__main__":

    print("=" * 55)
    print("VISIONINSPECT AI ENGINE")
    print("=" * 55)

    print(
        "Model Ready:",
        ai_engine.model_ready
    )

    print(
        "Engine:",
        "OpenCV Vision Inspection"
    )

    print("=" * 55)
