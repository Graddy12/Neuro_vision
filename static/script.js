// Toggle Sidebar
const wrapper = document.getElementById("wrapper");
const menuToggle = document.getElementById("menu-toggle");

if (menuToggle) {
    menuToggle.onclick = function() {
        wrapper.classList.toggle("toggled");
    };
}

// Vérifier l'état du serveur au chargement
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        if (data.status === 'ok') {
            updateModelStatus(data);
        }
    } catch (error) {
        console.log('Serveur en cours de démarrage...');
    }
    
    // Configurer le drag & drop
    setupDragAndDrop();
});

function updateModelStatus(data) {
    const clfStatus = document.getElementById('model-status-clf');
    const segStatus = document.getElementById('model-status-seg');
    
    if (clfStatus) {
        clfStatus.innerHTML = `Classification: <span class="${data.classification_loaded ? 'text-success' : 'text-warning'}">${data.classification_loaded ? '✓ Chargé' : '⚠ Mode démo'}</span>`;
    }
    
    if (segStatus) {
        segStatus.innerHTML = `Segmentation: <span class="${data.segmentation_loaded ? 'text-success' : 'text-warning'}">${data.segmentation_loaded ? '✓ Chargé' : '⚠ Mode démo'}</span>`;
    }
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('fileInput');
    
    if (!dropZone || !fileInput) return;
    
    // Cliquer sur la zone déclenche l'input fichier
    dropZone.addEventListener('click', function() {
        fileInput.click();
    });
    
    // Drag & drop
    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.style.borderColor = '#3498db';
        dropZone.style.backgroundColor = '#f0f7ff';
    });
    
    dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        dropZone.style.borderColor = '#d1d9e6';
        dropZone.style.backgroundColor = 'white';
    });
    
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.style.borderColor = '#d1d9e6';
        dropZone.style.backgroundColor = 'white';
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });
    
    // Changement de fichier via input
    fileInput.addEventListener('change', function(e) {
        if (this.files && this.files[0]) {
            handleFileSelect(this.files[0]);
        }
    });
}

async function handleFileSelect(file) {
    // Vérifier le type de fichier
    if (!file.type.match('image.*')) {
        alert('Veuillez sélectionner une image valide (JPG, PNG, etc.)');
        return;
    }
    
    // Vérifier la taille (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('L\'image est trop volumineuse. Taille maximale: 10MB');
        return;
    }
    
    // Afficher le loader
    document.querySelector('.upload-section').style.display = 'none';
    document.getElementById('loader').style.display = 'block';
    
    // Préparer l'envoi
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/predict', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayResults(data);
        } else {
            throw new Error(data.error || 'Erreur lors de l\'analyse');
        }
        
    } catch (error) {
        console.error('Erreur:', error);
        
        // Afficher une erreur
        document.getElementById('loader').style.display = 'none';
        
        alert(`Erreur d'analyse: ${error.message}\n\nLe serveur utilise peut-être des modèles factices. Vérifiez que les vrais modèles sont dans le dossier "models/".`);
        
        // Montrer la zone d'upload à nouveau
        document.querySelector('.upload-section').style.display = 'block';
    }
}

function displayResults(data) {
    // Cacher le loader
    document.getElementById('loader').style.display = 'none';
    
    // Afficher la zone des résultats avec animation
    const resultsArea = document.getElementById('results-area');
    resultsArea.style.display = 'block';
    resultsArea.classList.add('fade-in');
    
    // 1. Classification
    const cls = data.classification;
    document.getElementById('pred-class').textContent = formatClassLabel(cls.class);
    document.getElementById('pred-conf').textContent = cls.confidence.toFixed(1) + '%';
    
    // Mettre à jour la couleur de la confiance
    const badge = document.getElementById('pred-conf');
    updateConfidenceBadge(badge, cls.confidence);
    
    // Mettre à jour la description
    updateDiagnosisDescription(cls.class);
    
    // 2. Afficher les barres de probabilité
    displayConfidenceBars(cls.details);
    
    // 3. Images
    document.getElementById('img-original').src = data.original_image;
    
    if (data.segmentation.image) {
        document.getElementById('img-segmentation').src = data.segmentation.image;
    }
    
    // 4. Statistiques de segmentation
    const seg = data.segmentation;
    document.getElementById('seg-percent').textContent = seg.percentage.toFixed(2) + '%';
    document.getElementById('seg-pixels').textContent = seg.pixels.toLocaleString();
    
    // 5. Afficher l'alerte tumorale si nécessaire
    const tumorAlert = document.getElementById('tumor-alert');
    const tumorAlertText = document.getElementById('tumor-alert-text');
    
    if (cls.class !== 'notumor' && seg.tumor_detected) {
        tumorAlert.style.display = 'block';
        tumorAlertText.textContent = `Tumeur détectée: ${formatClassLabel(cls.class)} avec ${seg.percentage.toFixed(2)}% de surface affectée`;
        tumorAlert.className = 'alert alert-danger mt-3';
    } else if (cls.class === 'notumor' && !seg.tumor_detected) {
        tumorAlert.style.display = 'block';
        tumorAlertText.textContent = 'Aucune tumeur détectée. Résultat normal.';
        tumorAlert.className = 'alert alert-success mt-3';
    } else {
        tumorAlert.style.display = 'none';
    }
    
    // 6. Info Rapport (pour l'impression)
    const now = new Date();
    document.getElementById('report-date').textContent = 
        now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR');
    document.getElementById('report-id').textContent = 
        Math.floor(Math.random() * 10000).toString().padStart(4, '0');
}

function formatClassLabel(className) {
    const labels = {
        'glioma': 'Gliome',
        'meningioma': 'Méningiome',
        'notumor': 'Aucune Tumeur',
        'pituitary': 'Tumeur Hypophysaire'
    };
    return labels[className] || className;
}

function updateDiagnosisDescription(className) {
    const descriptions = {
        'glioma': 'Tumeur cérébrale primitive se développant à partir des cellules gliales',
        'meningioma': 'Tumeur se développant à partir des méninges (enveloppes du cerveau)',
        'notumor': 'Structure cérébrale normale sans anomalie détectée',
        'pituitary': 'Tumeur de la glande hypophyse (située à la base du cerveau)'
    };
    
    const descElement = document.getElementById('diagnosis-description');
    if (descElement) {
        descElement.textContent = descriptions[className] || 'Classification par réseau de neurones convolutifs';
    }
}

function updateConfidenceBadge(badge, confidence) {
    // Réinitialiser les classes
    badge.className = 'confidence-badge';
    
    // Ajouter la classe appropriée
    if (confidence > 90) {
        badge.style.background = 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)';
    } else if (confidence > 70) {
        badge.style.background = 'linear-gradient(135deg, #f39c12 0%, #f1c40f 100%)';
    } else {
        badge.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
    }
}

function displayConfidenceBars(details) {
    const container = document.getElementById('confidence-bars');
    container.innerHTML = '';
    
    details.forEach(item => {
        const barItem = document.createElement('div');
        barItem.className = 'confidence-bar-item';
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'confidence-label';
        
        const labelSpan = document.createElement('span');
        labelSpan.textContent = formatClassLabel(item.label);
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'confidence-value';
        valueSpan.textContent = item.probability.toFixed(1) + '%';
        
        labelDiv.appendChild(labelSpan);
        labelDiv.appendChild(valueSpan);
        
        const progressDiv = document.createElement('div');
        progressDiv.className = 'confidence-progress';
        
        const fillDiv = document.createElement('div');
        fillDiv.className = 'confidence-fill';
        fillDiv.style.width = '0%'; // Commence à 0 pour l'animation
        
        progressDiv.appendChild(fillDiv);
        
        barItem.appendChild(labelDiv);
        barItem.appendChild(progressDiv);
        container.appendChild(barItem);
        
        // Animer la barre après un délai
        setTimeout(() => {
            fillDiv.style.width = item.probability + '%';
        }, 100);
    });
}

// Téléchargement de rapport (simulé)
document.getElementById('download-report')?.addEventListener('click', function() {
    alert('Fonctionnalité PDF en cours de développement. Utilisez "Imprimer" pour le moment.');
});

// Gestion de la touche Escape pour réinitialiser
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('results-area').style.display === 'block') {
        if (confirm('Voulez-vous recommencer une nouvelle analyse ?')) {
            location.reload();
        }
    }
});

// Initialiser le tooltip Bootstrap
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
});