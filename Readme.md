# Neuro_vision

Neuro_vision est une application web basée sur **FastAPI** dédiée à la **détection** et à la **segmentation des tumeurs cérébrales** à partir d’images médicales, en s’appuyant sur des modèles de deep learning entraînés avec **TensorFlow / Keras**.

Le projet intègre deux modèles distincts :

* un modèle de **classification** (présence / type de tumeur)
* un modèle de **segmentation** (localisation précise de la tumeur sur l’image)

---

## 📁 Structure du projet

```
Neuro_vision/
├── main.py                 # Application FastAPI
├── models/                 # Modèles IA (.h5) gérés avec Git LFS
│   ├── modele_tumeur_cerveau.h5
│   └── Segmentation.h5
├── templates/
│   └── index.html          # Interface web
├── static/
│   ├── style.css
│   └── script.js
├── requirements.txt        # Dépendances Python
├── .gitattributes          # Configuration Git LFS
└── README.md
```

---

## ⚙️ Technologies utilisées

* **Backend** : FastAPI
* **IA / Deep Learning** : TensorFlow, Keras
* **Traitement d’images** : OpenCV, Pillow
* **Frontend** : HTML, CSS, JavaScript
* **Gestion des modèles lourds** : Git LFS

---

## 📦 Installation

### 1️⃣ Cloner le dépôt

```bash
git clone https://github.com/Graddy12/Neuro_vision.git
cd Neuro_vision
```

### 2️⃣ Installer Git LFS (obligatoire pour les modèles)

```bash
git lfs install
```

### 3️⃣ Créer un environnement virtuel (recommandé)

```bash
python -m venv venv
source venv/bin/activate  # Linux / Mac
venv\Scripts\activate     # Windows
```

### 4️⃣ Installer les dépendances

```bash
pip install -r requirements.txt
```

---

## 🧠 Modèles IA

Les modèles `.h5` sont volumineux et sont donc gérés via **Git LFS**.

Si les modèles ne sont pas présents après le clonage :

```bash
git lfs pull
```

Les fichiers attendus sont :

* `models/modele_tumeur_cerveau.h5`
* `models/Segmentation.h5`

---

## 🚀 Lancer l’application

```bash
uvicorn main:app --reload
```

Puis ouvrir dans le navigateur :

```
http://127.0.0.1:8000
```

---

## 🔌 Fonctionnalités principales

* Upload d’images médicales
* Prédiction de la présence d’une tumeur cérébrale
* Segmentation de la tumeur (masque)
* Interface web simple et interactive
* API REST exploitable pour intégration externe

---

## 📌 Bonnes pratiques intégrées

* Séparation claire code / modèles / statique
* Chargement contrôlé des modèles IA
* Dépôt Git compatible déploiement cloud
* Gestion propre des fichiers lourds via Git LFS

---

## 🛣️ Évolutions prévues

* Authentification utilisateur
* Historique des prédictions
* Déploiement cloud (Render / VPS / Docker)
* Optimisation mémoire (lazy loading des modèles)
* Support DICOM

---

## 👤 Auteur

**Graddy Matangila**
Projet IA – Vision par ordinateur & Santé

---

## ⚠️ Avertissement

Ce projet est destiné à un usage **éducatif et expérimental**. Il ne remplace en aucun cas un diagnostic médical professionnel.
