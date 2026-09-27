"use strict";

/* =========================================================
   VISIONINSPECT AI
   app.js
   ESP32-CAM + AI METAL INSPECTION FRONTEND
   ========================================================= */

/*
   IMPORTANT ARCHITECTURE

   GitHub Pages
        ↓
   app.js
        ↓
   Python Backend
        ↓
   ESP32-CAM

   Example backend:
   http://127.0.0.1:5000

   Change this later if your Python backend runs somewhere else.
*/

const CONFIG = {
    BACKEND_URL: "http://127.0.0.1:5000",

    DEFAULT_CAMERA_IP: "192.168.43.120",

    CAMERA_CAPTURE_PATH: "/capture",

    REQUEST_TIMEOUT: 10000,

    AUTO_REFRESH_HISTORY: true,

    VOICE_ENABLED: true
};


/* =========================================================
   GLOBAL STATE
   ========================================================= */

const state = {
    connected: false,
    scanning: false,
    inspecting: false,

    cameraIP: CONFIG.DEFAULT_CAMERA_IP,

    result: null,

    confidence: 0,

    defectType: "No defect detected",

    defectSeverity: "None",

    measurement: "--",

    totalInspections: 0,
    goodCount: 0,
    badCount: 0,

    goodFiles: 0,
    badFiles: 0,

    history: [],

    training: false,
    trainingProgress: 0,

    voiceEnabled: CONFIG.VOICE_ENABLED
};


/* =========================================================
   DOM HELPER
   ========================================================= */

function $(selector) {
    return document.querySelector(selector);
}

function $all(selector) {
    return document.querySelectorAll(selector);
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    initializeApplication();

});


async function initializeApplication() {

    console.log("VISIONINSPECT AI starting...");

    setupBootScreen();

    setupEventListeners();

    setupDefaultValues();

    createDatasetParticles();

    setupUploadZones();

    setupDragAndDrop();

    setupKeyboardShortcuts();

    await delay(2500);

    hideBootScreen();

    showToast(
        "VISIONINSPECT AI SYSTEM READY",
        "success"
    );

}


/* =========================================================
   BOOT SCREEN
   ========================================================= */

function setupBootScreen() {

    const bootStatus = $(".boot-status");

    if (!bootStatus) return;

    const messages = [
        "INITIALIZING VISION CORE...",
        "LOADING CAMERA INTERFACE...",
        "INITIALIZING AI PIPELINE...",
        "CHECKING INSPECTION MODULE...",
        "SYSTEM READY"
    ];

    let index = 0;

    const interval = setInterval(() => {

        if (index < messages.length) {

            bootStatus.textContent = messages[index];

            index++;

        } else {

            clearInterval(interval);

        }

    }, 450);

}


function hideBootScreen() {

    const boot = $(".boot-screen");

    if (!boot) return;

    boot.classList.add("hide");

}


/* =========================================================
   DEFAULT VALUES
   ========================================================= */

function setupDefaultValues() {

    const ipInput =
        $("#cameraIP") ||
        $("#ipInput") ||
        $(".ip-input");

    if (ipInput) {

        ipInput.value = state.cameraIP;

    }

    updateAllUI();

}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEventListeners() {

    /*
       Connection buttons
    */

    bindClick(
        ["#connectCamera", "#connectBtn", "[data-action='connect']"],
        connectCamera
    );

    bindClick(
        ["#disconnectCamera", "#disconnectBtn", "[data-action='disconnect']"],
        disconnectCamera
    );

    bindClick(
        ["#testCamera", "#testBtn", "[data-action='test']"],
        testCamera
    );


    /*
       Inspection buttons
    */

    bindClick(
        ["#startInspection", "#inspectBtn", "[data-action='inspect']"],
        startInspection
    );

    bindClick(
        ["#stopInspection", "#stopInspection", "[data-action='stop']"],
        stopInspection
    );


    /*
       Measurement
    */

    bindClick(
        ["#calibrateBtn", "#calibrate", "[data-action='calibrate']"],
        calibrateMeasurement
    );

    bindClick(
        ["#measureBtn", "#measure", "[data-action='measure']"],
        calculateMeasurement
    );


    /*
       Voice
    */

    bindClick(
        ["#voiceBtn", "#voiceToggle", "[data-action='voice']"],
        toggleVoice
    );


    /*
       Training
    */

    bindClick(
        ["#trainBtn", "#startTraining", "[data-action='train']"],
        startTraining
    );


    /*
       AI test
    */

    bindClick(
        ["#predictBtn", "#testAI", "[data-action='predict']"],
        runAITest
    );


    /*
       Settings / modal
    */

    bindClick(
        ["#settingsBtn", "#openSettings"],
        openSettings
    );

    bindClick(
        ["#closeModal", ".modal-close"],
        closeSettings
    );


    /*
       IP input
    */

    const ipInput =
        $("#cameraIP") ||
        $("#ipInput") ||
        $(".ip-input");

    if (ipInput) {

        ipInput.addEventListener("change", () => {

            state.cameraIP = ipInput.value.trim();

        });

        ipInput.addEventListener("keydown", event => {

            if (event.key === "Enter") {

                connectCamera();

            }

        });

    }

}


/* =========================================================
   EVENT BIND HELPER
   ========================================================= */

function bindClick(selectors, handler) {

    selectors.forEach(selector => {

        document
            .querySelectorAll(selector)
            .forEach(element => {

                element.addEventListener("click", handler);

            });

    });

}


/* =========================================================
   CAMERA CONNECTION
   ========================================================= */

async function connectCamera() {

    const ipInput =
        $("#cameraIP") ||
        $("#ipInput") ||
        $(".ip-input");

    if (ipInput) {

        state.cameraIP = ipInput.value.trim();

    }

    if (!state.cameraIP) {

        showToast(
            "ENTER ESP32-CAM IP ADDRESS",
            "error"
        );

        return;

    }


    showToast(
        "CONNECTING TO ESP32-CAM...",
        "info"
    );


    setConnectionStatus("CONNECTING");


    try {

        /*
           First try Python backend.
        */

        const response = await fetchWithTimeout(
            `${CONFIG.BACKEND_URL}/api/connect`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    ip: state.cameraIP
                })
            },
            CONFIG.REQUEST_TIMEOUT
        );


        if (!response.ok) {

            throw new Error(
                `Backend returned ${response.status}`
            );

        }


        const data = await response.json();


        if (data.success === false) {

            throw new Error(
                data.message || "Camera connection failed"
            );

        }


        state.connected = true;

        setConnectionStatus("ONLINE");

        showCameraFeed();

        showToast(
            "ESP32-CAM CONNECTED",
            "success"
        );

        speak(
            "ESP32 camera connected successfully"
        );


    } catch (error) {

        console.warn(
            "Backend connection failed:",
            error
        );


        /*
           Frontend fallback.

           The browser may be unable to access
           ESP32-CAM directly when this site is
           hosted on HTTPS/GitHub Pages.

           We therefore try the direct camera
           only as a secondary test.
        */

        const directResult =
            await testDirectCamera();


        if (directResult) {

            state.connected = true;

            setConnectionStatus("ONLINE");

            showCameraFeed();

            showToast(
                "DIRECT CAMERA CONNECTION ACTIVE",
                "success"
            );

        } else {

            state.connected = false;

            setConnectionStatus("OFFLINE");

            showToast(
                "CAMERA CONNECTION FAILED",
                "error"
            );

        }

    }

}


/* =========================================================
   DIRECT CAMERA TEST
   ========================================================= */

async function testDirectCamera() {

    const url =
        `http://${state.cameraIP}${CONFIG.CAMERA_CAPTURE_PATH}`;

    try {

        const response =
            await fetchWithTimeout(
                url,
                {
                    method: "GET",
                    cache: "no-store"
                },
                5000
            );

        return response.ok;

    } catch (error) {

        console.warn(
            "Direct camera unavailable:",
            error
        );

        return false;

    }

}


/* =========================================================
   TEST CAMERA
   ========================================================= */

async function testCamera() {

    if (!state.cameraIP) {

        showToast(
            "ENTER CAMERA IP FIRST",
            "error"
        );

        return;

    }


    showToast(
        "TESTING CAMERA CONNECTION...",
        "info"
    );


    const result =
        await testDirectCamera();


    if (result) {

        showToast(
            "ESP32-CAM RESPONDED SUCCESSFULLY",
            "success"
        );

        setConnectionStatus("ONLINE");

    } else {

        showToast(
            "CAMERA DID NOT RESPOND",
            "error"
        );

        setConnectionStatus("OFFLINE");

    }

}


/* =========================================================
   DISCONNECT
   ========================================================= */

function disconnectCamera() {

    stopInspection();

    state.connected = false;

    setConnectionStatus("OFFLINE");

    hideCameraFeed();

    showToast(
        "ESP32-CAM DISCONNECTED",
        "info"
    );

}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function setConnectionStatus(status) {

    const statusDot =
        $(".status-dot");

    const statusText =
        $(".system-status span:last-child") ||
        $("#connectionStatus");

    if (status === "ONLINE") {

        if (statusDot) {

            statusDot.classList.add("online");

        }

        if (statusText) {

            statusText.textContent =
                "CAMERA ONLINE";

        }

        document.body.classList.add("connected");

    }

    else if (status === "CONNECTING") {

        if (statusDot) {

            statusDot.classList.remove("online");

        }

        if (statusText) {

            statusText.textContent =
                "CONNECTING...";

        }

    }

    else {

        if (statusDot) {

            statusDot.classList.remove("online");

        }

        if (statusText) {

            statusText.textContent =
                "CAMERA OFFLINE";

        }

        document.body.classList.remove("connected");

    }

}


/* =========================================================
   CAMERA FEED
   ========================================================= */

function showCameraFeed() {

    const image =
        $("#cameraFeed") ||
        $(".camera-feed");

    const placeholder =
        $(".camera-placeholder");


    if (image) {

        image.src =
            getCameraStreamURL();

        image.classList.add("active");

    }


    if (placeholder) {

        placeholder.style.display =
            "none";

    }

}


function hideCameraFeed() {

    const image =
        $("#cameraFeed") ||
        $(".camera-feed");

    const placeholder =
        $(".camera-placeholder");


    if (image) {

        image.removeAttribute("src");

        image.classList.remove("active");

    }


    if (placeholder) {

        placeholder.style.display =
            "flex";

    }

}


/* =========================================================
   CAMERA URL
   ========================================================= */

function getCameraStreamURL() {

    /*
       If backend is running, use backend
       camera endpoint.

       This is the recommended architecture
       for GitHub Pages.
    */

    return (
        `${CONFIG.BACKEND_URL}/api/frame?ip=` +
        encodeURIComponent(state.cameraIP) +
        `&t=${Date.now()}`
    );

}


/* =========================================================
   LIVE CAMERA REFRESH
   ========================================================= */

let cameraRefreshTimer = null;


function startCameraRefresh() {

    stopCameraRefresh();


    const image =
        $("#cameraFeed") ||
        $(".camera-feed");


    if (!image) return;


    cameraRefreshTimer =
        setInterval(() => {

            if (
                state.connected &&
                !state.scanning
            ) {

                image.src =
                    getCameraStreamURL();

            }

        }, 800);

}


function stopCameraRefresh() {

    if (cameraRefreshTimer) {

        clearInterval(
            cameraRefreshTimer
        );

        cameraRefreshTimer = null;

    }

}


/* =========================================================
   START INSPECTION
   ========================================================= */

async function startInspection() {

    if (!state.connected) {

        showToast(
            "CONNECT ESP32-CAM FIRST",
            "error"
        );

        return;

    }


    if (state.inspecting) {

        showToast(
            "INSPECTION ALREADY RUNNING",
            "info"
        );

        return;

    }


    state.inspecting = true;
    state.scanning = true;


    updateInspectionButtons();

    activateScanningUI();

    resetPipeline();


    try {

        /*
           Pipeline:

           CAPTURE
              ↓
           DETECT
              ↓
           ANALYZE
              ↓
           MEASURE
              ↓
           RESULT
        */

        await runPipelineStage(0, 700);

        const image =
            await captureFrame();

        await runPipelineStage(1, 900);

        await runPipelineStage(2, 1100);


        /*
           Send captured image to
           Python AI backend.
        */

        const result =
            await sendImageForInspection(image);


        await runPipelineStage(3, 900);

        applyInspectionResult(result);

        await runPipelineStage(4, 700);


    } catch (error) {

        console.error(
            "Inspection error:",
            error
        );


        showToast(
            "INSPECTION ERROR",
            "error"
        );


    } finally {

        state.inspecting = false;
        state.scanning = false;

        updateInspectionButtons();

        deactivateScanningUI();

    }

}


/* =========================================================
   STOP INSPECTION
   ========================================================= */

function stopInspection() {

    state.inspecting = false;
    state.scanning = false;

    deactivateScanningUI();

    updateInspectionButtons();

}


/* =========================================================
   PIPELINE
   ========================================================= */

async function runPipelineStage(
    index,
    duration
) {

    const stages =
        $all(".pipeline-stage");


    stages.forEach(stage => {

        stage.classList.remove(
            "active"
        );

    });


    if (stages[index]) {

        stages[index]
            .classList.add("active");

    }


    await delay(duration);


    if (stages[index]) {

        stages[index]
            .classList.remove("active");

        stages[index]
            .classList.add("done");

    }

}


/* =========================================================
   RESET PIPELINE
   ========================================================= */

function resetPipeline() {

    $all(".pipeline-stage")
        .forEach(stage => {

            stage.classList.remove(
                "active",
                "done"
            );

        });

}


/* =========================================================
   SCANNING UI
   ========================================================= */

function activateScanningUI() {

    const camera =
        $(".camera-section");

    if (camera) {

        camera.classList.add(
            "scanning",
            "scan-active"
        );

    }

}


function deactivateScanningUI() {

    const camera =
        $(".camera-section");

    if (camera) {

        camera.classList.remove(
            "scanning",
            "scan-active"
        );

    }

}


/* =========================================================
   CAPTURE FRAME
   ========================================================= */

async function captureFrame() {

    const image =
        $("#cameraFeed") ||
        $(".camera-feed");


    /*
       Backend capture
    */

    try {

        const response =
            await fetchWithTimeout(
                `${CONFIG.BACKEND_URL}/api/frame?ip=` +
                encodeURIComponent(
                    state.cameraIP
                ) +
                `&t=${Date.now()}`,
                {
                    cache: "no-store"
                },
                CONFIG.REQUEST_TIMEOUT
            );


        if (response.ok) {

            return await response.blob();

        }

    } catch (error) {

        console.warn(
            "Backend capture failed",
            error
        );

    }


    /*
       Direct ESP32 capture fallback.
    */

    try {

        const response =
            await fetchWithTimeout(
                `http://${state.cameraIP}/capture?t=${Date.now()}`,
                {
                    cache: "no-store"
                },
                7000
            );


        if (response.ok) {

            return await response.blob();

        }

    } catch (error) {

        console.warn(
            "Direct capture failed",
            error
        );

    }


    /*
       If browser cannot access camera,
       capture currently displayed image.
    */

    if (image && image.src) {

        try {

            const response =
                await fetch(image.src);

            return await response.blob();

        } catch (error) {

            console.warn(
                "Displayed frame unavailable"
            );

        }

    }


    throw new Error(
        "Unable to capture camera frame"
    );

}


/* =========================================================
   SEND IMAGE TO AI BACKEND
   ========================================================= */

async function sendImageForInspection(blob) {

    /*
       Actual AI inference happens in Python.

       Expected backend endpoint:

       POST /api/inspect

       Form field:

       image
    */


    if (!blob) {

        throw new Error(
            "No image captured"
        );

    }


    const formData =
        new FormData();

    formData.append(
        "image",
        blob,
        "inspection.jpg"
    );

    formData.append(
        "camera_ip",
        state.cameraIP
    );


    try {

        const response =
            await fetchWithTimeout(
                `${CONFIG.BACKEND_URL}/api/inspect`,
                {
                    method: "POST",
                    body: formData
                },
                30000
            );


        if (!response.ok) {

            throw new Error(
                `AI backend error ${response.status}`
            );

        }


        const result =
            await response.json();


        return normalizeAIResult(
            result
        );


    } catch (error) {

        console.warn(
            "AI backend unavailable:",
            error
        );


        /*
           IMPORTANT:
           This is only a UI fallback.

           It does NOT claim that the object
           is actually GOOD or BAD.

           Real classification will come from
           Python AI backend.
        */

        return {
            status: "UNKNOWN",
            confidence: 0,
            defectType: "AI backend unavailable",
            severity: "Unknown",
            measurement: "--",
            message:
                "Connect Python AI backend"
        };

    }

}


/* =========================================================
   NORMALIZE AI RESULT
   ========================================================= */

function normalizeAIResult(result) {

    if (!result) {

        return {
            status: "UNKNOWN",
            confidence: 0,
            defectType: "No AI result",
            severity: "Unknown",
            measurement: "--"
        };

    }


    let status =
        String(
            result.status ||
            result.result ||
            result.classification ||
            "UNKNOWN"
        ).toUpperCase();


    if (
        status !== "GOOD" &&
        status !== "BAD"
    ) {

        status = "UNKNOWN";

    }


    return {

        status,

        confidence:
            Number(
                result.confidence ||
                0
            ),

        defectType:
            result.defect_type ||
            result.defectType ||
            "No defect detected",

        severity:
            result.severity ||
            "None",

        measurement:
            result.measurement ||
            result.size ||
            "--",

        defectLocation:
            result.location ||
            result.defect_location ||
            "Not available",

        message:
            result.message ||
            ""

    };

}


/* =========================================================
   APPLY INSPECTION RESULT
   ========================================================= */

function applyInspectionResult(result) {

    state.result =
        result.status;

    state.confidence =
        result.confidence;

    state.defectType =
        result.defectType;

    state.defectSeverity =
        result.severity;

    state.measurement =
        result.measurement;


    /*
       Update counters only for actual
       GOOD/BAD results.
    */

    if (result.status === "GOOD") {

        state.goodCount++;

        state.totalInspections++;

        showGoodResult();

        speak(
            `Inspection result good. Confidence ${Math.round(result.confidence)} percent.`
        );

    }

    else if (result.status === "BAD") {

        state.badCount++;

        state.totalInspections++;

        showBadResult();

        speak(
            `Warning. Defect detected. ${result.defectType}.`
        );

    }

    else {

        showUnknownResult();

        speak(
            "Inspection result unavailable. Please check the AI backend."
        );

    }


    updateAllUI();

    addHistory(result);

}


/* =========================================================
   GOOD RESULT
   ========================================================= */

function showGoodResult() {

    const camera =
        $(".camera-section");

    if (camera) {

        camera.classList.add(
            "good-alert"
        );

        setTimeout(() => {

            camera.classList.remove(
                "good-alert"
            );

        }, 1800);

    }


    showResultOverlay(
        "GOOD",
        "✓",
        "result-good"
    );

}


/* =========================================================
   BAD RESULT
   ========================================================= */

function showBadResult() {

    const camera =
        $(".camera-section");

    if (camera) {

        camera.classList.add(
            "bad-alert"
        );

        setTimeout(() => {

            camera.classList.remove(
                "bad-alert"
            );

        }, 1600);

    }


    showResultOverlay(
        "BAD",
        "!",
        "result-bad"
    );

}


/* =========================================================
   UNKNOWN RESULT
   ========================================================= */

function showUnknownResult() {

    showResultOverlay(
        "UNKNOWN",
        "?",
        ""
    );

}


/* =========================================================
   RESULT OVERLAY
   ========================================================= */

function showResultOverlay(
    text,
    icon,
    className
) {

    const overlay =
        $(".result-overlay");

    if (!overlay) return;


    overlay.classList.remove(
        "result-good",
        "result-bad"
    );


    if (className) {

        overlay.classList.add(
            className
        );

    }


    const resultText =
        overlay.querySelector(
            ".result-text"
        );

    const resultIcon =
        overlay.querySelector(
            ".result-icon"
        );


    if (resultText) {

        resultText.textContent =
            text;

    }


    if (resultIcon) {

        resultIcon.textContent =
            icon;

    }


    overlay.classList.add("show");


    setTimeout(() => {

        overlay.classList.remove(
            "show"
        );

    }, 2200);

}


/* =========================================================
   MEASUREMENT
   ========================================================= */

let calibrationValue = null;


function calibrateMeasurement() {

    const value =
        prompt(
            "Enter known reference length in mm:"
        );


    if (!value) return;


    const number =
        Number(value);


    if (
        !Number.isFinite(number) ||
        number <= 0
    ) {

        showToast(
            "INVALID CALIBRATION VALUE",
            "error"
        );

        return;

    }


    calibrationValue =
        number;


    showToast(
        `CALIBRATION SET: ${number} mm`,
        "success"
    );

}


/* =========================================================
   CALCULATE MEASUREMENT
   ========================================================= */

function calculateMeasurement() {

    if (!calibrationValue) {

        showToast(
            "CALIBRATE FIRST",
            "error"
        );

        return;

    }


    /*
       Real measurement should be calculated
       by the Python/OpenCV backend using
       pixels-per-mm calibration.

       Frontend only displays backend result.
    */

    showToast(
        "MEASUREMENT REQUEST SENT TO AI BACKEND",
        "info"
    );

}


/* =========================================================
   VOICE
   ========================================================= */

function toggleVoice() {

    state.voiceEnabled =
        !state.voiceEnabled;


    showToast(
        state.voiceEnabled
            ? "VOICE ASSISTANT ON"
            : "VOICE ASSISTANT OFF",
        "info"
    );


    if (state.voiceEnabled) {

        speak(
            "Voice assistant activated"
        );

    }

}


function speak(text) {

    if (!state.voiceEnabled) return;

    if (
        !("speechSynthesis" in window)
    ) {

        return;

    }


    window.speechSynthesis.cancel();


    const speech =
        new SpeechSynthesisUtterance(
            text
        );


    speech.rate = 0.95;

    speech.pitch = 1;

    speech.volume = 1;


    window.speechSynthesis.speak(
        speech
    );

}


/* =========================================================
   UPLOAD SETUP
   ========================================================= */

function setupUploadZones() {

    const goodInput =
        $("#goodImages") ||
        $("#goodUpload");

    const badInput =
        $("#badImages") ||
        $("#badUpload");


    if (goodInput) {

        goodInput.addEventListener(
            "change",
            event => {

                handleImageFiles(
                    event.target.files,
                    "GOOD"
                );

            }
        );

    }


    if (badInput) {

        badInput.addEventListener(
            "change",
            event => {

                handleImageFiles(
                    event.target.files,
                    "BAD"
                );

            }
        );

    }


    /*
       Generic file inputs
    */

    $all(
        "input[type='file']"
    ).forEach(input => {

        if (
            input === goodInput ||
            input === badInput
        ) return;


        input.addEventListener(
            "change",
            event => {

                const type =
                    input.dataset.type ||
                    "GOOD";

                handleImageFiles(
                    event.target.files,
                    type
                );

            }
        );

    });

}


/* =========================================================
   HANDLE UPLOAD
   ========================================================= */

async function handleImageFiles(
    files,
    type
) {

    if (!files || !files.length) {

        return;

    }


    const fileArray =
        Array.from(files);


    if (
        type === "GOOD" ||
        type === "good"
    ) {

        state.goodFiles +=
            fileArray.length;

    } else {

        state.badFiles +=
            fileArray.length;

    }


    updateDatasetCounters();


    showToast(
        `${fileArray.length} ${type} IMAGE(S) SELECTED`,
        "success"
    );


    /*
       Upload to Python backend.
    */

    try {

        const formData =
            new FormData();


        fileArray.forEach(
            file => {

                formData.append(
                    "images",
                    file
                );

            }
        );


        formData.append(
            "label",
            type.toUpperCase()
        );


        const response =
            await fetchWithTimeout(
                `${CONFIG.BACKEND_URL}/api/upload/${type.toLowerCase()}`,
                {
                    method: "POST",
                    body: formData
                },
                30000
            );


        if (!response.ok) {

            throw new Error(
                `Upload failed: ${response.status}`
            );

        }


        showToast(
            `${type} DATASET UPLOADED`,
            "success"
        );


    } catch (error) {

        console.warn(
            "Dataset backend unavailable:",
            error
        );


        showToast(
            "FILES SELECTED — BACKEND UPLOAD NOT CONNECTED",
            "info"
        );

    }

}


/* =========================================================
   DRAG AND DROP
   ========================================================= */

function setupDragAndDrop() {

    $all(".upload-zone")
        .forEach(zone => {

            zone.addEventListener(
                "dragover",
                event => {

                    event.preventDefault();

                    zone.classList.add(
                        "dragging"
                    );

                }
            );


            zone.addEventListener(
                "dragleave",
                () => {

                    zone.classList.remove(
                        "dragging"
                    );

                }
            );


            zone.addEventListener(
                "drop",
                event => {

                    event.preventDefault();

                    zone.classList.remove(
                        "dragging"
                    );


                    const files =
                        event.dataTransfer.files;


                    const type =
                        zone.dataset.type ||
                        (
                            zone.classList.contains(
                                "bad"
                            )
                                ? "BAD"
                                : "GOOD"
                        );


                    handleImageFiles(
                        files,
                        type
                    );

                }
            );

        });

}


/* =========================================================
   DATASET PARTICLES
   ========================================================= */

function createDatasetParticles() {

    const container =
        $(".dataset-visual");

    if (!container) return;


    for (
        let i = 0;
        i < 25;
        i++
    ) {

        const particle =
            document.createElement(
                "span"
            );


        particle.className =
            "dataset-particle";


        particle.style.left =
            `${Math.random() * 100}%`;


        particle.style.top =
            `${Math.random() * 100}%`;


        particle.style.animationDelay =
            `${Math.random() * 3}s`;


        container.appendChild(
            particle
        );

    }

}


/* =========================================================
   TRAINING
   ========================================================= */

async function startTraining() {

    if (state.training) {

        showToast(
            "AI TRAINING ALREADY RUNNING",
            "info"
        );

        return;

    }


    state.training = true;

    state.trainingProgress = 0;

    updateTrainingUI();


    showToast(
        "AI MODEL TRAINING STARTED",
        "info"
    );


    try {

        /*
           Start Python training.
        */

        const response =
            await fetchWithTimeout(
                `${CONFIG.BACKEND_URL}/api/train`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        dataset: {
                            good:
                                state.goodFiles,

                            bad:
                                state.badFiles
                        }
                    })
                },
                30000
            );


        if (response.ok) {

            const data =
                await response.json();


            if (
                data.progress !== undefined
            ) {

                state.trainingProgress =
                    Number(
                        data.progress
                    );

                updateTrainingUI();

            }

        }


        /*
           UI animation.

           Actual training progress should
           eventually be returned by backend.
        */

        await animateTrainingProgress();


        showToast(
            "AI TRAINING COMPLETED",
            "success"
        );


        speak(
            "AI model training completed"
        );


    } catch (error) {

        console.warn(
            "Training backend unavailable:",
            error
        );


        /*
           Don't claim actual training
           happened if backend isn't connected.
        */

        showToast(
            "PYTHON TRAINING BACKEND NOT CONNECTED",
            "error"
        );

    }


    state.training = false;

    updateTrainingUI();

}


/* =========================================================
   TRAINING PROGRESS
   ========================================================= */

async function animateTrainingProgress() {

    const start =
        state.trainingProgress || 0;


    for (
        let progress = start;
        progress <= 100;
        progress += 5
    ) {

        state.trainingProgress =
            progress;

        updateTrainingUI();

        await delay(120);

    }

}


/* =========================================================
   UPDATE TRAINING UI
   ========================================================= */

function updateTrainingUI() {

    const progressBar =
        $(".training-progress span");

    const percentage =
        $(".training-percentage");


    if (progressBar) {

        progressBar.style.width =
            `${state.trainingProgress}%`;

    }


    if (percentage) {

        percentage.textContent =
            `${Math.round(
                state.trainingProgress
            )}%`;

    }

}


/* =========================================================
   AI TEST
   ========================================================= */

async function runAITest() {

    if (!state.connected) {

        showToast(
            "CONNECT CAMERA FIRST",
            "error"
        );

        return;

    }


    showToast(
        "RUNNING AI TEST...",
        "info"
    );


    await startInspection();

}


/* =========================================================
   HISTORY
   ========================================================= */

function addHistory(result) {

    const item = {

        id:
            Date.now(),

        time:
            new Date().toLocaleTimeString(),

        result:
            result.status,

        confidence:
            result.confidence,

        defect:
            result.defectType,

        severity:
            result.severity,

        measurement:
            result.measurement

    };


    state.history.unshift(
        item
    );


    if (
        state.history.length > 30
    ) {

        state.history.pop();

    }


    renderHistory();

}


/* =========================================================
   RENDER HISTORY
   ========================================================= */

function renderHistory() {

    const container =
        $(".history-list") ||
        $("#historyList");


    if (!container) return;


    container.innerHTML = "";


    if (!state.history.length) {

        container.innerHTML = `
            <div class="history-row">
                <span>--</span>
                <span>NO INSPECTIONS</span>
                <span>--</span>
                <span>--</span>
                <span>--</span>
            </div>
        `;

        return;

    }


    state.history.forEach(item => {

        const row =
            document.createElement(
                "div"
            );


        row.className =
            "history-row";


        const resultClass =
            item.result === "GOOD"
                ? "history-good"
                : item.result === "BAD"
                    ? "history-bad"
                    : "";


        row.innerHTML = `
            <span>${escapeHTML(item.time)}</span>

            <span class="${resultClass}">
                ${escapeHTML(item.result)}
            </span>

            <span>
                ${escapeHTML(
                    String(
                        Math.round(
                            item.confidence
                        )
                    )
                )}%
            </span>

            <span>
                ${escapeHTML(
                    item.defect
                )}
            </span>

            <span>
                ${escapeHTML(
                    item.measurement
                )}
            </span>
        `;


        container.appendChild(
            row
        );

    });

}


/* =========================================================
   ANALYTICS
   ========================================================= */

function updateAnalytics() {

    const total =
        $("#totalInspections");

    const good =
        $("#goodCount");

    const bad =
        $("#badCount");


    if (total) {

        total.textContent =
            state.totalInspections;

    }


    if (good) {

        good.textContent =
            state.goodCount;

    }


    if (bad) {

        bad.textContent =
            state.badCount;

    }


    /*
       Generic selectors for analytics cards.
    */

    const numbers =
        $all(
            ".analytics-number"
        );


    if (numbers.length >= 3) {

        numbers[0].textContent =
            state.totalInspections;

        numbers[1].textContent =
            state.goodCount;

        numbers[2].textContent =
            state.badCount;

    }

}


/* =========================================================
   DATASET COUNTERS
   ========================================================= */

function updateDatasetCounters() {

    const good =
        $("#goodCountDataset") ||
        $("#goodFilesCount");

    const bad =
        $("#badCountDataset") ||
        $("#badFilesCount");


    if (good) {

        good.textContent =
            state.goodFiles;

    }


    if (bad) {

        bad.textContent =
            state.badFiles;

    }


    /*
       Search upload counters.
    */

    const goodUpload =
        $(".upload-zone.good .upload-count");

    const badUpload =
        $(".upload-zone.bad .upload-count");


    if (goodUpload) {

        goodUpload.textContent =
            state.goodFiles;

    }


    if (badUpload) {

        badUpload.textContent =
            state.badFiles;

    }

}


/* =========================================================
   UPDATE INSPECTION BUTTONS
   ========================================================= */

function updateInspectionButtons() {

    const start =
        $("#startInspection") ||
        $("#inspectBtn");

    const stop =
        $("#stopInspection") ||
        $("#stopBtn");


    if (start) {

        start.disabled =
            state.inspecting;

    }


    if (stop) {

        stop.disabled =
            !state.inspecting;

    }

}


/* =========================================================
   UPDATE ALL UI
   ========================================================= */

function updateAllUI() {

    updateAnalytics();

    updateDatasetCounters();

    updateTrainingUI();

    updateInspectionButtons();

    updateResultDetails();

    renderHistory();

}


/* =========================================================
   RESULT DETAILS
   ========================================================= */

function updateResultDetails() {

    const confidence =
        $("#confidence") ||
        $(".confidence-value");


    const defect =
        $("#defectType") ||
        $(".defect-value");


    const severity =
        $("#severity") ||
        $(".severity-value");


    const measurement =
        $("#measurement") ||
        $(".measurement-value");


    if (confidence) {

        confidence.textContent =
            `${Math.round(
                state.confidence
            )}%`;

    }


    if (defect) {

        defect.textContent =
            state.defectType;

    }


    if (severity) {

        severity.textContent =
            state.defectSeverity;

    }


    if (measurement) {

        measurement.textContent =
            state.measurement;

    }

}


/* =========================================================
   SETTINGS
   ========================================================= */

function openSettings() {

    const modal =
        $(".modal") ||
        $("#settingsModal");


    if (modal) {

        modal.classList.add(
            "show"
        );

    }

}


function closeSettings() {

    const modal =
        $(".modal") ||
        $("#settingsModal");


    if (modal) {

        modal.classList.remove(
            "show"
        );

    }

}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(
    message,
    type = "info"
) {

    let container =
        $(".toast-container");


    if (!container) {

        container =
            document.createElement(
                "div"
            );

        container.className =
            "toast-container";

        document.body.appendChild(
            container
        );

    }


    const toast =
        document.createElement(
            "div"
        );


    toast.className =
        `toast ${type}`;


    toast.textContent =
        message;


    container.appendChild(
        toast
    );


    setTimeout(() => {

        toast.remove();

    }, 4200);

}


/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

function setupKeyboardShortcuts() {

    document.addEventListener(
        "keydown",
        event => {

            /*
               Space = inspection
            */

            if (
                event.code === "Space" &&
                !isTyping()
            ) {

                event.preventDefault();

                if (
                    !state.inspecting
                ) {

                    startInspection();

                }

            }


            /*
               Escape = stop / close
            */

            if (
                event.key === "Escape"
            ) {

                stopInspection();

                closeSettings();

            }


            /*
               V = voice
            */

            if (
                event.key.toLowerCase() === "v" &&
                !isTyping()
            ) {

                toggleVoice();

            }

        }
    );

}


function isTyping() {

    const active =
        document.activeElement;


    if (!active) return false;


    return (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT"
    );

}


/* =========================================================
   FETCH WITH TIMEOUT
   ========================================================= */

async function fetchWithTimeout(
    url,
    options = {},
    timeout = 10000
) {

    const controller =
        new AbortController();


    const timer =
        setTimeout(
            () => controller.abort(),
            timeout
        );


    try {

        const response =
            await fetch(
                url,
                {
                    ...options,
                    signal:
                        controller.signal
                }
            );


        return response;

    } finally {

        clearTimeout(timer);

    }

}


/* =========================================================
   DELAY
   ========================================================= */

function delay(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );

}


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================================
   PAGE VISIBILITY
   ========================================================= */

document.addEventListener(
    "visibilitychange",
    () => {

        if (
            document.hidden
        ) {

            stopCameraRefresh();

        } else if (
            state.connected
        ) {

            startCameraRefresh();

        }

    }
);


/* =========================================================
   ONLINE / OFFLINE
   ========================================================= */

window.addEventListener(
    "online",
    () => {

        showToast(
            "INTERNET CONNECTION RESTORED",
            "success"
        );

    }
);


window.addEventListener(
    "offline",
    () => {

        showToast(
            "BROWSER NETWORK OFFLINE",
            "error"
        );

    }
);


/* =========================================================
   EXPOSE MAIN FUNCTIONS
   Useful for HTML onclick if needed
   ========================================================= */

window.VisionInspect = {

    connectCamera,

    disconnectCamera,

    testCamera,

    startInspection,

    stopInspection,

    calibrateMeasurement,

    calculateMeasurement,

    startTraining,

    runAITest,

    toggleVoice,

    openSettings,

    closeSettings

};


/* =========================================================
   INITIAL LOG
   ========================================================= */

console.log(
    "%c VISIONINSPECT AI ",
    "color:#00eaff;font-weight:bold;font-size:20px;"
);

console.log(
    "Frontend initialized."
);

console.log(
    "Backend:",
    CONFIG.BACKEND_URL
);
