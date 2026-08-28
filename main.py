import os
# Désactive les optimisations oneDNN pour éviter les logs excessifs
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

import io
import json
import re
import shutil
import tempfile
import threading
import uuid
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from PIL import Image
from pydantic import BaseModel, Field
from tensorflow import keras
from tensorflow.keras import backend as K

# Supprimer les avertissements TensorFlow standards
tf.get_logger().setLevel('ERROR')

class NoCacheStaticFiles(StaticFiles):
    """En local, évite le 304 du navigateur qui bloque les mises à jour CSS/JS."""

    def is_not_modified(self, response_headers, request_headers) -> bool:
        return False

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        try:
            response.headers["Cache-Control"] = "no-store, max-age=0"
            response.headers["Pragma"] = "no-cache"
        except Exception:
            pass
        return response


# --- CONFIGURATION ---
app = FastAPI(
    title="NeuroVision : Classification & Segmentation",
    version="2.0.0"
)

app.mount("/static", NoCacheStaticFiles(directory="static"), name="static")

# Dimensions
TAILLE_CLASSIF = (224, 224) # Taille pour le modèle de classification
TAILLE_SEGMENT = (128, 128) # Taille pour le U-Net (Segmentation)

# Noms des fichiers modèles
MODEL_CLF_PATH = "models/modele_tumeur_cerveau.h5"
MODEL_SEG_PATH = "models/segmentation.h5"
UI_VERSION = "2.2.0"

NOMS_CLASSES = ['glioma', 'meningioma', 'notumor', 'pituitary']

DATA_DIR = Path("data")
ANALYSES_DIR = DATA_DIR / "analyses"
HISTORY_FILE = DATA_DIR / "history.json"
DISPLAY_SIZE = (400, 400)
_history_lock = threading.Lock()

os.makedirs("models", exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)
ANALYSES_DIR.mkdir(parents=True, exist_ok=True)

# --- MÉTRIQUES PERSONNALISÉES (Requises pour charger U-Net) ---
def dice_coef(y_true, y_pred, smooth=100):
    y_true_f = K.flatten(y_true)
    y_pred_f = K.flatten(y_pred)
    intersection = K.sum(y_true_f * y_pred_f)
    return (2. * intersection + smooth) / (K.sum(y_true_f) + K.sum(y_pred_f) + smooth)

def iou_coef(y_true, y_pred, smooth=100):
    intersection = K.sum(K.abs(y_true * y_pred), axis=[1,2,3])
    union = K.sum(y_true,[1,2,3]) + K.sum(y_pred,[1,2,3]) - intersection
    return K.mean((intersection + smooth) / (union + smooth), axis=0)

# --- CHARGEMENT DES MODÈLES ---
model_clf = None
model_seg = None
model_load_errors = {"classification": None, "segmentation": None}

def charger_modeles():
    global model_clf, model_seg, model_load_errors
    print("🔄 Chargement des modèles IA...")

    model_clf = None
    model_seg = None
    model_load_errors = {"classification": None, "segmentation": None}

    # Un modèle absent ou illisible doit rendre le service indisponible.
    # Ne jamais remplacer silencieusement un modèle médical par un réseau aléatoire.
    if not os.path.isfile(MODEL_CLF_PATH):
        model_load_errors["classification"] = "Fichier modèle introuvable"
        print(f"❌ {MODEL_CLF_PATH} introuvable.")
    else:
        try:
            model_clf = keras.models.load_model(MODEL_CLF_PATH, compile=False)
            print("✅ Modèle Classification chargé.")
        except Exception as e:
            model_load_errors["classification"] = str(e)
            print(f"❌ Échec du chargement du modèle de classification : {e}")

    if not os.path.isfile(MODEL_SEG_PATH):
        model_load_errors["segmentation"] = "Fichier modèle introuvable"
        print(f"❌ {MODEL_SEG_PATH} introuvable.")
    else:
        try:
            model_seg = keras.models.load_model(
                MODEL_SEG_PATH,
                custom_objects={'dice_coef': dice_coef, 'iou_coef': iou_coef},
                compile=False
            )
            print("✅ Modèle Segmentation chargé.")
        except Exception as e:
            model_load_errors["segmentation"] = str(e)
            print(f"❌ Échec du chargement du modèle de segmentation : {e}")

# Charger au démarrage
charger_modeles()

# --- GESTION DE L'HISTORIQUE ---
class HistoryError(Exception):
    """Erreur de lecture ou d'écriture de l'historique."""


def _safe_analysis_id(analysis_id: str) -> str:
    try:
        return str(uuid.UUID(analysis_id))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail="Identifiant d'analyse invalide")


def _analysis_folder(analysis_id: str) -> Path:
    return ANALYSES_DIR / _safe_analysis_id(analysis_id)


def _safe_filename(name: str) -> str:
    if not name:
        return "image.png"
    return Path(name).name[:120]


def analysis_short_id(analysis_id: str) -> str:
    """Référence courte et stable, dérivée de l'UUID (ex. NV-91DD1802)."""
    raw = str(analysis_id or "").replace("-", "").upper()
    code = raw[:8] if raw else "--------"
    return f"NV-{code}"


def sanitize_patient_id(value: str) -> str:
    """Identifiant de dossier : lettres, chiffres, tirets, slash. Pas de nom libre."""
    if not value:
        return ""
    cleaned = re.sub(r"\s+", "", str(value).strip())
    cleaned = re.sub(r"[^A-Za-z0-9._/-]", "", cleaned)
    return cleaned[:64]


def charger_historique():
    """Charge l'historique depuis le fichier JSON (metadata uniquement)."""
    if not HISTORY_FILE.exists():
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            raise HistoryError("Fichier d'historique invalide (format inattendu).")
        return data
    except HistoryError:
        raise
    except json.JSONDecodeError as e:
        raise HistoryError("Fichier d'historique corrompu. Impossible de le lire.") from e
    except OSError as e:
        raise HistoryError(f"Impossible de lire l'historique: {e}") from e


def sauvegarder_historique(historique):
    """Écriture atomique (fichier temporaire + rename) pour éviter un JSON à moitié écrit."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=str(DATA_DIR), prefix="history_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(historique, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, HISTORY_FILE)
    except Exception as e:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise HistoryError(f"Impossible d'enregistrer l'historique: {e}") from e


def _with_image_urls(record: dict, include_details: bool = True) -> dict:
    """Ajoute les URLs d'images sans les embarquer dans le JSON disque."""
    analysis_id = record.get("id")
    classification = dict(record.get("classification") or {})
    if not include_details:
        classification.pop("details", None)

    segmentation = dict(record.get("segmentation") or {})
    segmentation["image"] = f"/api/history/{analysis_id}/overlay"

    return {
        "success": True,
        "id": analysis_id,
        "short_id": analysis_short_id(analysis_id),
        "timestamp": record.get("timestamp"),
        "filename": record.get("filename"),
        "patient_id": record.get("patient_id") or "",
        "classification": classification,
        "segmentation": segmentation,
        "original_image": f"/api/history/{analysis_id}/original",
    }


def enregistrer_analyse(record: dict, original_img, overlay_img):
    """Sauvegarde les PNG sur disque puis append la metadata dans history.json."""
    analysis_id = record["id"]
    folder = ANALYSES_DIR / analysis_id
    folder.mkdir(parents=True, exist_ok=True)
    try:
        original_img.convert("RGB").resize(DISPLAY_SIZE).save(folder / "original.png", "PNG")
        overlay_to_save = overlay_img if overlay_img is not None else original_img
        overlay_to_save.convert("RGB").resize(DISPLAY_SIZE).save(folder / "overlay.png", "PNG")
        with _history_lock:
            historique = charger_historique()
            historique.append(record)
            sauvegarder_historique(historique)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise


def supprimer_dossier_analyse(analysis_id: str):
    folder = ANALYSES_DIR / analysis_id
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)


# --- FONCTIONS UTILITAIRES ---

def traiter_segmentation(image_pil):
    """Effectue la segmentation et crée l'overlay."""
    if model_seg is None:
        return None, 0, 0

    try:
        # 1. Prétraitement
        img_small = image_pil.resize(TAILLE_SEGMENT)
        img_array = np.array(img_small) / 255.0
        if len(img_array.shape) == 2:  # Si image en niveaux de gris
            img_array = np.stack([img_array]*3, axis=-1)
        img_input = np.expand_dims(img_array, axis=0)

        # 2. Prédiction
        pred = model_seg.predict(img_input, verbose=0)[0]
        
        # Si la prédiction a plusieurs canaux, prendre le premier
        if len(pred.shape) == 3 and pred.shape[-1] > 1:
            pred = pred[:, :, 0]
            
        mask = (pred > 0.5).astype(np.uint8)  # 0 ou 1

        # 3. Calculs
        total_pixels = TAILLE_SEGMENT[0] * TAILLE_SEGMENT[1]
        tumor_pixels = np.sum(mask)
        tumor_percent = (tumor_pixels / total_pixels) * 100

        # 4. Création de l'image Overlay (Rouge)
        # Redimensionner le masque à la taille de l'image originale
        mask_resized = cv2.resize(mask.astype(np.float32), 
                                 image_pil.size, 
                                 interpolation=cv2.INTER_NEAREST)
        
        # Convertir l'image originale en array numpy
        original_array = np.array(image_pil.convert('RGB'))
        
        # Créer le calque rouge
        heatmap = np.zeros_like(original_array)
        heatmap[:, :, 0] = 255  # Canal Rouge à fond

        # Appliquer le masque au calque rouge
        if len(mask_resized.shape) == 2:
            mask_resized = mask_resized[..., np.newaxis]
        
        heatmap = heatmap * mask_resized
        
        # Superposition
        overlay = cv2.addWeighted(original_array.astype(np.uint8), 0.7, 
                                 heatmap.astype(np.uint8), 0.3, 0)
        
        return Image.fromarray(overlay), int(tumor_pixels), float(tumor_percent)
        
    except Exception as e:
        print(f"Erreur lors de la segmentation: {e}")
        return image_pil, 0, 0.0

# Fonction pour convertir les types numpy en types Python natifs
def convert_to_python_types(obj):
    """Convertit récursivement les types numpy en types Python natifs."""
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, dict):
        return {key: convert_to_python_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_python_types(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(convert_to_python_types(item) for item in obj)
    else:
        return obj

# --- ROUTES API ---

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Sert la page HTML."""
    no_cache_headers = {
        "Cache-Control": "no-store, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-NeuroVision-UI-Version": UI_VERSION,
    }
    if request.query_params.get("nv_ui") == UI_VERSION:
        no_cache_headers["Clear-Site-Data"] = '"cache"'
    try:
        with open("templates/index.html", "r", encoding="utf-8") as f:
            html = f.read().replace("__NEUROVISION_UI_VERSION__", UI_VERSION)
            return HTMLResponse(content=html, headers=no_cache_headers)
    except FileNotFoundError:
        # Si le fichier n'existe pas, renvoyer une page simple
        return HTMLResponse(content="""
        <!DOCTYPE html>
        <html>
        <head>
            <title>NeuroVision</title>
            <meta http-equiv="refresh" content="0; url=/static/index.html">
        </head>
        <body>
            <p>Redirection vers l'interface...</p>
        </body>
        </html>
        """, headers=no_cache_headers)

@app.get("/api/health")
async def health_check():
    """Vérifie que les deux vrais modèles Keras sont disponibles."""
    classification_loaded = model_clf is not None
    segmentation_loaded = model_seg is not None
    ready = classification_loaded and segmentation_loaded
    payload = {
        "status": "ok" if ready else "degraded",
        "ready": ready,
        "ui_version": UI_VERSION,
        "classification_loaded": model_clf is not None,
        "segmentation_loaded": model_seg is not None,
        "real_models": ready,
        "fallback_models": False,
        "models": {
            "classification": {
                "filename": Path(MODEL_CLF_PATH).name,
                "size_bytes": Path(MODEL_CLF_PATH).stat().st_size if Path(MODEL_CLF_PATH).is_file() else 0,
                "loaded": classification_loaded,
                "error": model_load_errors["classification"],
            },
            "segmentation": {
                "filename": Path(MODEL_SEG_PATH).name,
                "size_bytes": Path(MODEL_SEG_PATH).stat().st_size if Path(MODEL_SEG_PATH).is_file() else 0,
                "loaded": segmentation_loaded,
                "error": model_load_errors["segmentation"],
            },
        },
        "message": (
            "NeuroVision utilise les deux modèles Keras réels"
            if ready
            else "Un ou plusieurs modèles Keras réels sont indisponibles"
        ),
    }
    return JSONResponse(status_code=200 if ready else 503, content=payload)

def executer_pipeline(contents: bytes, filename: str):
    """Classification + segmentation + sauvegarde (exécuté hors boucle asyncio)."""
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    img_clf = image.resize(TAILLE_CLASSIF)
    arr_clf = keras.utils.img_to_array(img_clf)
    arr_clf = np.expand_dims(arr_clf, axis=0)

    preds = model_clf.predict(arr_clf, verbose=0)[0]
    idx_max = int(np.argmax(preds))
    classe_predite = NOMS_CLASSES[idx_max]
    confiance = float(preds[idx_max] * 100)

    details = []
    for i, nom in enumerate(NOMS_CLASSES):
        details.append({
            "label": nom,
            "probability": float(preds[i] * 100)
        })
    details.sort(key=lambda x: x["probability"], reverse=True)

    overlay_img, pixels, percent = traiter_segmentation(image)
    percent_python = float(percent)
    analysis_id = str(uuid.uuid4())

    record = convert_to_python_types({
        "id": analysis_id,
        "timestamp": datetime.now().isoformat(),
        "filename": _safe_filename(filename),
        "patient_id": "",
        "classification": {
            "class": classe_predite,
            "confidence": confiance,
            "details": details
        },
        "segmentation": {
            "tumor_detected": bool(percent_python > 0.1),
            "pixels": int(pixels),
            "percentage": float(round(percent_python, 2))
        }
    })
    enregistrer_analyse(record, image, overlay_img)
    return _with_image_urls(record, include_details=True)


@app.post("/api/predict")
async def predict(file: UploadFile = File(...)):
    """Pipeline complet : Classification + Segmentation."""

    if model_clf is None or model_seg is None:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "Les modèles IA réels ne sont pas disponibles sur le serveur.",
            },
        )

    try:
        contents = await file.read()
        payload = await run_in_threadpool(executer_pipeline, contents, file.filename)
        return JSONResponse(content=payload)
    except HistoryError as e:
        print(f"Erreur historique: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e),
                "success": False,
                "message": "L'analyse a réussi mais n'a pas pu être enregistrée dans l'historique."
            }
        )
    except Exception as e:
        print(f"Erreur serveur: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e),
                "success": False,
                "message": "Erreur lors du traitement de l'image"
            }
        )


@app.get("/api/history")
async def get_history():
    """Liste les analyses (metadata + URLs, sans images embarquées), plus récent d'abord."""
    try:
        with _history_lock:
            historique = charger_historique()
        analyses = [
            _with_image_urls(item, include_details=False)
            for item in reversed(historique)
        ]
        return JSONResponse(content={"analyses": analyses})
    except HistoryError as e:
        print(f"Erreur historique: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "analyses": []}
        )


@app.get("/api/history/{analysis_id}/original")
async def get_history_original(analysis_id: str):
    path = _analysis_folder(analysis_id) / "original.png"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image originale introuvable")
    return FileResponse(path, media_type="image/png")


@app.get("/api/history/{analysis_id}/overlay")
async def get_history_overlay(analysis_id: str):
    path = _analysis_folder(analysis_id) / "overlay.png"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image de segmentation introuvable")
    return FileResponse(path, media_type="image/png")


@app.get("/api/history/{analysis_id}")
async def get_analysis(analysis_id: str):
    """Récupère une analyse spécifique (metadata + URLs d'images)."""
    analysis_id = _safe_analysis_id(analysis_id)
    try:
        with _history_lock:
            historique = charger_historique()
    except HistoryError as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    for analyse in historique:
        if analyse.get("id") == analysis_id:
            return JSONResponse(content=_with_image_urls(analyse, include_details=True))
    return JSONResponse(
        status_code=404,
        content={"error": "Analyse non trouvée"}
    )


class PatientIdPayload(BaseModel):
    patient_id: str = Field(default="", max_length=80)


@app.patch("/api/history/{analysis_id}/patient")
async def update_patient_id(analysis_id: str, payload: PatientIdPayload):
    """Associe (ou met à jour) l'identifiant de dossier patient d'une analyse."""
    analysis_id = _safe_analysis_id(analysis_id)
    patient_id = sanitize_patient_id(payload.patient_id)
    try:
        with _history_lock:
            historique = charger_historique()
            found = False
            for analyse in historique:
                if analyse.get("id") == analysis_id:
                    analyse["patient_id"] = patient_id
                    found = True
                    break
            if not found:
                return JSONResponse(
                    status_code=404,
                    content={"error": "Analyse non trouvée", "success": False}
                )
            sauvegarder_historique(historique)
        return JSONResponse(content={
            "success": True,
            "id": analysis_id,
            "patient_id": patient_id,
            "message": "Dossier patient enregistré" if patient_id else "Dossier patient retiré"
        })
    except HistoryError as e:
        return JSONResponse(status_code=500, content={"error": str(e), "success": False})


@app.delete("/api/history/{analysis_id}")
async def delete_analysis(analysis_id: str):
    """Supprime une analyse et ses images."""
    analysis_id = _safe_analysis_id(analysis_id)
    try:
        with _history_lock:
            historique = charger_historique()
            historique_updated = [a for a in historique if a.get("id") != analysis_id]
            if len(historique) == len(historique_updated):
                return JSONResponse(
                    status_code=404,
                    content={"error": "Analyse non trouvée"}
                )
            sauvegarder_historique(historique_updated)
        supprimer_dossier_analyse(analysis_id)
        return JSONResponse(content={"success": True, "message": "Analyse supprimée"})
    except HistoryError as e:
        return JSONResponse(status_code=500, content={"error": str(e), "success": False})


@app.delete("/api/history")
async def clear_history():
    """Vide complètement l'historique et supprime les images associées."""
    try:
        with _history_lock:
            sauvegarder_historique([])
        if ANALYSES_DIR.exists():
            shutil.rmtree(ANALYSES_DIR, ignore_errors=True)
        ANALYSES_DIR.mkdir(parents=True, exist_ok=True)
        return JSONResponse(content={"success": True, "message": "Historique vidé"})
    except HistoryError as e:
        return JSONResponse(status_code=500, content={"error": str(e), "success": False})


GITHUB_REPO_URL = "https://github.com/Graddy12/Neuro_vision"


@app.get("/{full_path:path}")
async def redirect_pasted_external_url(full_path: str):
    """Chrome peut transformer un lien GitHub en chemin relatif : /https://github.com/..."""
    normalized = full_path.strip().rstrip("/")
    allowed = {
        "https://github.com/Graddy12/Neuro_vision",
        "https://github.com/Graddy12/Neuro_vision.git",
        "http://github.com/Graddy12/Neuro_vision",
    }
    if normalized in allowed:
        return RedirectResponse(GITHUB_REPO_URL, status_code=302)
    raise HTTPException(status_code=404, detail="Page introuvable")

if __name__ == "__main__":
    os.makedirs("templates", exist_ok=True)
    os.makedirs("static", exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ANALYSES_DIR.mkdir(parents=True, exist_ok=True)
    
    print("🚀 Lancement du serveur NeuroVision...")
    print("📊 Interface disponible sur: http://localhost:8000")
    print("🔧 API disponible sur: http://localhost:8000/api/predict")
    print("💡 Pour tester: envoyez une requête POST avec une image à /api/predict")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info"
    )
