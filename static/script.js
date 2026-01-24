// Toggle Sidebar
const wrapper = document.getElementById("wrapper");
const menuToggle = document.getElementById("menu-toggle");

if (menuToggle) {
    menuToggle.onclick = function() {
        wrapper.classList.toggle("toggled");
    };
}

// Navigation entre les sections
const navAnalyse = document.getElementById("nav-analyse");
const navHistorique = document.getElementById("nav-historique");
const navApropos = document.getElementById("nav-apropos");

const uploadSection = document.getElementById("upload-section");
const resultsArea = document.getElementById("results-area");
const historiqueSection = document.getElementById("historique-section");
const aproposSection = document.getElementById("apropos-section");

if (navAnalyse) {
    navAnalyse.addEventListener("click", function(e) {
        e.preventDefault();
        showSection("analyse");
        updateNavigation("nav-analyse");
    });
}

if (navHistorique) {
    navHistorique.addEventListener("click", function(e) {
        e.preventDefault();
        showSection("historique");
        updateNavigation("nav-historique");
        loadHistory();
    });
}

if (navApropos) {
    navApropos.addEventListener("click", function(e) {
        e.preventDefault();
        showSection("apropos");
        updateNavigation("nav-apropos");
    });
}

function showSection(section) {
    if (uploadSection) uploadSection.style.display = 'none';
    if (resultsArea) resultsArea.style.display = 'none';
    if (historiqueSection) historiqueSection.style.display = 'none';
    if (aproposSection) aproposSection.style.display = 'none';
    
    if (section === "analyse") {
        if (uploadSection) uploadSection.style.display = 'block';
    } else if (section === "historique") {
        if (historiqueSection) historiqueSection.style.display = 'block';
    } else if (section === "apropos") {
        if (aproposSection) aproposSection.style.display = 'block';
    }
}

function updateNavigation(activeId) {
    document.querySelectorAll(".list-group-item").forEach(item => {
        item.classList.remove("active-sidebar");
    });
    const active = document.getElementById(activeId);
    if (active) active.classList.add("active-sidebar");
}

async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        const analyses = data.analyses || [];
        
        const container = document.getElementById("history-container");
        const countBadge = document.getElementById("history-count");
        const clearBtn = document.getElementById("clear-history-btn");
        
        countBadge.textContent = analyses.length + " analyse" + (analyses.length > 1 ? "s" : "");
        
        if (analyses.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info text-center py-5">
                    <i class="fas fa-inbox fa-3x mb-3 text-muted"></i>
                    <p class="text-muted mb-0">Aucune analyse enregistrée pour le moment.</p>
                </div>
            `;
            if (clearBtn) clearBtn.style.display = 'none';
        } else {
            let html = '<div class="row g-4">';
            
            // Afficher en ordre inverse (plus récent d'abord)
            for (let i = analyses.length - 1; i >= 0; i--) {
                const analyse = analyses[i];
                const date = new Date(analyse.timestamp);
                const dateStr = date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});
                const className = formatClassLabel(analyse.classification.class);
                const confidence = analyse.classification.confidence.toFixed(1);
                const tumorPercent = analyse.segmentation.percentage.toFixed(2);
                
                html += `
                    <div class="col-md-6 col-lg-4">
                        <div class="card h-100 history-card">
                            <div class="card-header bg-light">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div>
                                        <small class="text-muted">${dateStr}</small>
                                        <h6 class="card-title mb-0 mt-1">${className}</h6>
                                    </div>
                                    <span class="badge ${analyse.segmentation.tumor_detected ? 'bg-danger' : 'bg-success'}">
                                        ${analyse.segmentation.tumor_detected ? 'Tumeur' : 'Normal'}
                                    </span>
                                </div>
                            </div>
                            <div class="card-body">
                                <div class="mb-3">
                                    <img src="${analyse.original_image}" class="img-fluid rounded mb-2" style="max-height: 200px; object-fit: cover;">
                                </div>
                                <div class="row g-2 text-center mb-3">
                                    <div class="col-6">
                                        <div class="bg-primary bg-opacity-10 p-2 rounded">
                                            <small class="text-muted d-block">Confiance</small>
                                            <strong class="text-primary">${confidence}%</strong>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="bg-danger bg-opacity-10 p-2 rounded">
                                            <small class="text-muted d-block">Surface</small>
                                            <strong class="text-danger">${tumorPercent}%</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="card-footer bg-light">
                                <button class="btn btn-sm btn-primary w-100 mb-2" onclick="viewAnalysis('${analyse.id}')">
                                    <i class="fas fa-eye me-1"></i>Voir détails
                                </button>
                                <button class="btn btn-sm btn-outline-danger w-100" onclick="deleteAnalysis('${analyse.id}')">
                                    <i class="fas fa-trash me-1"></i>Supprimer
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            html += '</div>';
            container.innerHTML = html;
            
            if (clearBtn) {
                clearBtn.style.display = 'block';
                clearBtn.onclick = async function() {
                    if (confirm("Êtes-vous sûr de vouloir vider complètement l'historique ?")) {
                        await fetch('/api/history', {method: 'DELETE'});
                        loadHistory();
                    }
                };
            }
        }
    } catch (error) {
        console.error("Erreur lors du chargement de l'historique:", error);
        const container = document.getElementById("history-container");
        if (container) {
            container.innerHTML = '<div class="alert alert-danger">Erreur lors du chargement de l\'historique</div>';
        }
    }
}

async function viewAnalysis(analysisId) {
    try {
        const response = await fetch(`/api/history/${analysisId}`);
        const data = await response.json();
        
        // Afficher les résultats comme si c'était une nouvelle analyse
        displayResults(data);
        showSection("analyse");
        updateNavigation("nav-analyse");
        
    } catch (error) {
        alert("Erreur lors du chargement des détails de l'analyse");
    }
}

async function deleteAnalysis(analysisId) {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette analyse ?")) {
        try {
            const response = await fetch(`/api/history/${analysisId}`, {method: 'DELETE'});
            if (response.ok) {
                loadHistory();
            }
        } catch (error) {
            alert("Erreur lors de la suppression");
        }
    }
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