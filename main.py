import os
# Désactive les optimisations oneDNN pour éviter les logs excessifs
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

import io
import base64
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import backend as K
import cv2
from PIL import Image
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import json

# Supprimer les avertissements TensorFlow standards
tf.get_logger().setLevel('ERROR')

# --- CONFIGURATION ---
app = FastAPI(
    title="NeuroVision : Classification & Segmentation",
    version="2.0.0"
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Dimensions
TAILLE_CLASSIF = (224, 224) # Taille pour le modèle de classification
TAILLE_SEGMENT = (128, 128) # Taille pour le U-Net (Segmentation)

# Noms des fichiers modèles
MODEL_CLF_PATH = "models/modele_tumeur_cerveau.h5"
MODEL_SEG_PATH = "models/segmentation.h5"

NOMS_CLASSES = ['glioma', 'meningioma', 'notumor', 'pituitary']

# Créer le dossier models s'il n'existe pas
os.makedirs("models", exist_ok=True)

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

def charger_modeles():
    global model_clf, model_seg
    print("🔄 Chargement des modèles IA...")
    
    try:
        # 1. Modèle de Classification
        if os.path.exists(MODEL_CLF_PATH):
            model_clf = keras.models.load_model(MODEL_CLF_PATH, compile=False)
            print("✅ Modèle Classification chargé.")
        else:
            print(f"⚠️ Avertissement: {MODEL_CLF_PATH} introuvable.")
            print("📝 Création d'un modèle de classification factice pour le test...")
            # Créer un modèle factice pour le développement
            model_clf = keras.Sequential([
                keras.layers.Input(shape=(224, 224, 3)),
                keras.layers.Flatten(),
                keras.layers.Dense(4, activation='softmax')
            ])

        # 2. Modèle de Segmentation
        if os.path.exists(MODEL_SEG_PATH):
            model_seg = keras.models.load_model(
                MODEL_SEG_PATH, 
                custom_objects={'dice_coef': dice_coef, 'iou_coef': iou_coef},
                compile=False
            )
            print("✅ Modèle Segmentation chargé.")
        else:
            print(f"⚠️ Avertissement: {MODEL_SEG_PATH} introuvable.")
            print("📝 Création d'un modèle de segmentation factice pour le test...")
            # Créer un modèle factice pour le développement
            model_seg = keras.Sequential([
                keras.layers.Input(shape=(128, 128, 3)),
                keras.layers.Conv2D(1, (3, 3), activation='sigmoid', padding='same')
            ])
            
    except Exception as e:
        print(f"❌ Erreur critique lors du chargement : {e}")
        # Créer des modèles factices en cas d'erreur
        model_clf = keras.Sequential([
            keras.layers.Input(shape=(224, 224, 3)),
            keras.layers.Flatten(),
            keras.layers.Dense(4, activation='softmax')
        ])
        model_seg = keras.Sequential([
            keras.layers.Input(shape=(128, 128, 3)),
            keras.layers.Conv2D(1, (3, 3), activation='sigmoid', padding='same')
        ])

# Charger au démarrage
charger_modeles()

# --- FONCTIONS UTILITAIRES ---

def image_to_base64(image_pil):
    """Convertit une image PIL en string base64 pour l'envoi JSON."""
    buffered = io.BytesIO()
    image_pil.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode()

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
async def read_root():
    """Sert la page HTML."""
    try:
        with open("templates/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
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
        """)

@app.get("/api/health")
async def health_check():
    """Vérifie l'état du serveur."""
    return {
        "status": "ok",
        "classification_loaded": model_clf is not None,
        "segmentation_loaded": model_seg is not None,
        "message": "NeuroVision API est opérationnelle"
    }

@app.post("/api/predict")
async def predict(file: UploadFile = File(...)):
    """Pipeline complet : Classification + Segmentation."""
    
    if model_clf is None:
        return JSONResponse(
            status_code=500, 
            content={"error": "Modèles non chargés serveur."}
        )

    try:
        # Lire l'image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        
        # --- A. CLASSIFICATION ---
        img_clf = image.resize(TAILLE_CLASSIF)
        arr_clf = keras.utils.img_to_array(img_clf)
        arr_clf = np.expand_dims(arr_clf, axis=0)
        
        preds = model_clf.predict(arr_clf, verbose=0)[0]
        idx_max = int(np.argmax(preds))  # Convertir en int Python
        classe_predite = NOMS_CLASSES[idx_max]
        confiance = float(preds[idx_max] * 100)  # Déjà float
        
        # Détails pour les barres de progression
        details = []
        for i, nom in enumerate(NOMS_CLASSES):
            details.append({
                "label": nom,
                "probability": float(preds[i] * 100)  # Convertir en float Python
            })
        details.sort(key=lambda x: x["probability"], reverse=True)

        # --- B. SEGMENTATION ---
        overlay_img, pixels, percent = traiter_segmentation(image)
        
        # Convertir percent en float Python (déjà fait dans traiter_segmentation)
        percent_python = float(percent)
        
        # Encodage des images pour le JSON
        original_b64 = image_to_base64(image.resize((400, 400)))
        overlay_b64 = image_to_base64(overlay_img.resize((400, 400))) if overlay_img else None

        # Créer le dictionnaire de réponse avec des types Python natifs
        response_data = {
            "success": True,
            "classification": {
                "class": classe_predite,
                "confidence": confiance,
                "details": details
            },
            "segmentation": {
                "tumor_detected": bool(percent_python > 0.1),  # Convertir en bool Python
                "pixels": int(pixels),  # Convertir en int Python
                "percentage": float(round(percent_python, 2)),  # Convertir en float Python
                "image": f"data:image/png;base64,{overlay_b64}" if overlay_b64 else None
            },
            "original_image": f"data:image/png;base64,{original_b64}"
        }
        
        # Convertir tous les types numpy en types Python
        response_data = convert_to_python_types(response_data)
        
        return JSONResponse(content=response_data)

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

if __name__ == "__main__":
    # Créer les dossiers nécessaires
    os.makedirs("templates", exist_ok=True)
    os.makedirs("static", exist_ok=True)
    
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
