# ============================================================
# VISIONINSPECT AI
# GOOD / BAD DATASET TRAINING
# ============================================================

import os
import cv2
import json
import numpy as np

from datetime import datetime

# ------------------------------------------------------------
# PATHS
# ------------------------------------------------------------

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

GOOD_DIR = os.path.join(
    BASE_DIR,
    "dataset",
    "good"
)

BAD_DIR = os.path.join(
    BASE_DIR,
    "dataset",
    "bad"
)

MODEL_DIR = os.path.join(
    BASE_DIR,
    "models"
)

MODEL_FILE = os.path.join(
    MODEL_DIR,
    "visioninspect_model.json"
)

os.makedirs(GOOD_DIR, exist_ok=True)
os.makedirs(BAD_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)


# ------------------------------------------------------------
# TRAINING SETTINGS
# ------------------------------------------------------------

IMAGE_SIZE = (128, 128)

training_status = {
    "running": False,
    "progress": 0,
    "message": "Waiting for training",
    "good_images": 0,
    "bad_images": 0
}


# ------------------------------------------------------------
# FEATURE EXTRACTION
# ------------------------------------------------------------

def extract_features(image):

    image = cv2.resize(
        image,
        IMAGE_SIZE
    )

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    # Normalize brightness
    gray = cv2.equalizeHist(gray)

    # Edge information
    edges = cv2.Canny(
        gray,
        50,
        150
    )

    # Resize feature representation
    features = cv2.resize(
        edges,
        (32, 32)
    )

    features = features.astype(
        np.float32
    ) / 255.0

    return features.flatten()


# ------------------------------------------------------------
# LOAD DATASET
# ------------------------------------------------------------

def load_dataset():

    X = []
    y = []

    good_count = 0
    bad_count = 0

    # --------------------------------------------------------
    # GOOD IMAGES
    # --------------------------------------------------------

    if os.path.exists(GOOD_DIR):

        for filename in os.listdir(GOOD_DIR):

            filepath = os.path.join(
                GOOD_DIR,
                filename
            )

            image = cv2.imread(
                filepath
            )

            if image is None:
                continue

            features = extract_features(
                image
            )

            X.append(features)
            y.append(0)

            good_count += 1

    # --------------------------------------------------------
    # BAD IMAGES
    # --------------------------------------------------------

    if os.path.exists(BAD_DIR):

        for filename in os.listdir(BAD_DIR):

            filepath = os.path.join(
                BAD_DIR,
                filename
            )

            image = cv2.imread(
                filepath
            )

            if image is None:
                continue

            features = extract_features(
                image
            )

            X.append(features)
            y.append(1)

            bad_count += 1

    return (
        np.array(X),
        np.array(y),
        good_count,
        bad_count
    )


# ------------------------------------------------------------
# SIMPLE ML CLASSIFIER
# ------------------------------------------------------------

class VisionClassifier:

    def __init__(self):

        self.good_mean = None
        self.bad_mean = None

    # --------------------------------------------------------
    # TRAIN
    # --------------------------------------------------------

    def train(
        self,
        X,
        y
    ):

        good_samples = X[y == 0]
        bad_samples = X[y == 1]

        if len(good_samples) == 0:
            raise ValueError(
                "No GOOD images found."
            )

        if len(bad_samples) == 0:
            raise ValueError(
                "No BAD images found."
            )

        self.good_mean = np.mean(
            good_samples,
            axis=0
        )

        self.bad_mean = np.mean(
            bad_samples,
            axis=0
        )

    # --------------------------------------------------------
    # PREDICT
    # --------------------------------------------------------

    def predict(self, features):

        if (
            self.good_mean is None
            or self.bad_mean is None
        ):
            raise ValueError(
                "Model has not been trained."
            )

        good_distance = np.linalg.norm(
            features - self.good_mean
        )

        bad_distance = np.linalg.norm(
            features - self.bad_mean
        )

        total = (
            good_distance
            + bad_distance
        )

        if total == 0:

            good_probability = 0.5
            bad_probability = 0.5

        else:

            good_probability = (
                bad_distance / total
            )

            bad_probability = (
                good_distance / total
            )

        if good_distance < bad_distance:

            result = "GOOD"
            confidence = (
                good_probability * 100
            )

        else:

            result = "BAD"
            confidence = (
                bad_probability * 100
            )

        return {
            "result": result,
            "confidence": round(
                float(confidence),
                2
            )
        }


# ------------------------------------------------------------
# GLOBAL CLASSIFIER
# ------------------------------------------------------------

classifier = VisionClassifier()


# ------------------------------------------------------------
# TRAIN MODEL
# ------------------------------------------------------------

def train_model():

    global training_status

    training_status = {
        "running": True,
        "progress": 0,
        "message": "Loading dataset",
        "good_images": 0,
        "bad_images": 0
    }

    try:

        # ----------------------------------------------------
        # LOAD IMAGES
        # ----------------------------------------------------

        X, y, good_count, bad_count = (
            load_dataset()
        )

        training_status[
            "good_images"
        ] = good_count

        training_status[
            "bad_images"
        ] = bad_count

        training_status[
            "progress"
        ] = 30

        if good_count == 0:
            raise ValueError(
                "Add GOOD images first."
            )

        if bad_count == 0:
            raise ValueError(
                "Add BAD images first."
            )

        # ----------------------------------------------------
        # TRAIN
        # ----------------------------------------------------

        training_status[
            "message"
        ] = "Extracting visual features"

        training_status[
            "progress"
        ] = 55

        classifier.train(
            X,
            y
        )

        # ----------------------------------------------------
        # SAVE MODEL
        # ----------------------------------------------------

        training_status[
            "message"
        ] = "Saving trained model"

        training_status[
            "progress"
        ] = 80

        model_data = {

            "model_type":
                "VisionInspect GOOD/BAD Classifier",

            "image_size":
                IMAGE_SIZE,

            "good_images":
                good_count,

            "bad_images":
                bad_count,

            "trained_at":
                datetime.now().isoformat(),

            "good_mean":
                classifier.good_mean.tolist(),

            "bad_mean":
                classifier.bad_mean.tolist()
        }

        with open(
            MODEL_FILE,
            "w"
        ) as file:

            json.dump(
                model_data,
                file
            )

        # ----------------------------------------------------
        # FINISHED
        # ----------------------------------------------------

        training_status = {

            "running": False,

            "progress": 100,

            "message":
                "Training completed",

            "good_images":
                good_count,

            "bad_images":
                bad_count
        }

        return {
            "success": True,
            "message":
                "Model trained successfully",
            "good_images":
                good_count,
            "bad_images":
                bad_count
        }

    except Exception as error:

        training_status = {

            "running": False,

            "progress": 0,

            "message":
                str(error),

            "good_images":
                training_status.get(
                    "good_images",
                    0
                ),

            "bad_images":
                training_status.get(
                    "bad_images",
                    0
                )
        }

        return {
            "success": False,
            "error": str(error)
        }


# ------------------------------------------------------------
# GET TRAINING STATUS
# ------------------------------------------------------------

def get_training_status():

    return training_status


# ------------------------------------------------------------
# LOAD SAVED MODEL
# ------------------------------------------------------------

def load_trained_model():

    if not os.path.exists(
        MODEL_FILE
    ):
        return False

    try:

        with open(
            MODEL_FILE,
            "r"
        ) as file:

            data = json.load(file)

        classifier.good_mean = np.array(
            data["good_mean"],
            dtype=np.float32
        )

        classifier.bad_mean = np.array(
            data["bad_mean"],
            dtype=np.float32
        )

        return True

    except Exception as error:

        print(
            "Model loading error:",
            error
        )

        return False


# ------------------------------------------------------------
# PREDICT IMAGE
# ------------------------------------------------------------

def predict_image(image):

    if (
        classifier.good_mean is None
        or classifier.bad_mean is None
    ):

        if not load_trained_model():

            return {
                "success": False,
                "error":
                    "Model is not trained yet."
            }

    features = extract_features(
        image
    )

    prediction = classifier.predict(
        features
    )

    return {
        "success": True,
        **prediction
    }


# ------------------------------------------------------------
# TEST
# ------------------------------------------------------------

if __name__ == "__main__":

    print("=" * 60)
    print("VISIONINSPECT AI - TRAINING SYSTEM")
    print("=" * 60)

    print(
        "GOOD folder:",
        GOOD_DIR
    )

    print(
        "BAD folder:",
        BAD_DIR
    )

    print(
        "Model file:",
        MODEL_FILE
    )

    result = train_model()

    print()
    print("Training Result:")
    print(result)

    print("=" * 60)
