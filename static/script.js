// Toggle Sidebar
const wrapper = document.getElementById("wrapper");
const menuToggle = document.getElementById("menu-toggle");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function isMobileViewport() {
    return window.innerWidth <= 768;
}

function syncSidebarState() {
    if (!wrapper || !menuToggle) return;
    const isVisible = isMobileViewport()
        ? wrapper.classList.contains("toggled")
        : !wrapper.classList.contains("toggled");
    menuToggle.setAttribute("aria-expanded", String(isVisible));
}

function closeMobileSidebar() {
    if (!wrapper || !isMobileViewport()) return;
    wrapper.classList.remove("toggled");
    syncSidebarState();
}

if (menuToggle) {
    menuToggle.onclick = function() {
        if (!wrapper) return;
        wrapper.classList.toggle("toggled");
        syncSidebarState();
    };
}

if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeMobileSidebar);
}

window.addEventListener("resize", syncSidebarState);
syncSidebarState();

// Navigation entre les sections
const navAnalyse = document.getElementById("nav-analyse");
const navHistorique = document.getElementById("nav-historique");
const navApropos = document.getElementById("nav-apropos");

const uploadSection = document.getElementById("upload-section");
const resultsArea = document.getElementById("results-area");
const historiqueSection = document.getElementById("historique-section");
const aproposSection = document.getElementById("apropos-section");
const loader = document.getElementById("loader");

let historyCache = [];
let historyFilter = "all";
let historySearch = "";
let viewingFromHistory = false;
let currentAnalysisId = null;
let savedPatientId = "";

if (navAnalyse) {
    navAnalyse.addEventListener("click", function(e) {
        e.preventDefault();
        showSection("analyse");
        updateNavigation("nav-analyse");
        closeMobileSidebar();
    });
}

if (navHistorique) {
    navHistorique.addEventListener("click", function(e) {
        e.preventDefault();
        showSection("historique");
        updateNavigation("nav-historique");
        loadHistory();
        closeMobileSidebar();
    });
}

if (navApropos) {
    navApropos.addEventListener("click", function(e) {
        e.preventDefault();
        showSection("apropos");
        updateNavigation("nav-apropos");
        closeMobileSidebar();
    });
}

function showSection(section) {
    if (uploadSection) uploadSection.style.display = "none";
    if (resultsArea) resultsArea.style.display = "none";
    if (historiqueSection) historiqueSection.style.display = "none";
    if (aproposSection) aproposSection.style.display = "none";
    if (loader) loader.style.display = "none";

    if (section === "analyse") {
        if (uploadSection) uploadSection.style.display = "";
        viewingFromHistory = false;
    } else if (section === "resultats") {
        if (resultsArea) resultsArea.style.display = "block";
    } else if (section === "historique") {
        if (historiqueSection) historiqueSection.style.display = "block";
        viewingFromHistory = false;
    } else if (section === "apropos") {
        if (aproposSection) aproposSection.style.display = "block";
    } else if (section === "loader") {
        if (loader) loader.style.display = "block";
    }
}

function updateNavigation(activeId) {
    document.querySelectorAll(".list-group-item").forEach(item => {
        item.classList.remove("active-sidebar");
    });
    const active = document.getElementById(activeId);
    if (active) active.classList.add("active-sidebar");
}

function showHistoryLoading() {
    const container = document.getElementById("history-container");
    if (container) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Chargement...</span>
                </div>
                <p class="mb-0">Chargement de l'historique...</p>
            </div>
        `;
    }
}

function showHistoryError(message) {
    const container = document.getElementById("history-container");
    if (container) {
        container.innerHTML = `
            <div class="alert alert-danger d-flex align-items-center justify-content-between flex-wrap gap-2">
                <span><i class="fas fa-exclamation-circle me-2"></i>${escapeHtml(message)}</span>
                <button type="button" class="btn btn-sm btn-outline-danger" id="retry-history-btn">Réessayer</button>
            </div>
        `;
        const retryBtn = document.getElementById("retry-history-btn");
        if (retryBtn) retryBtn.addEventListener("click", loadHistory);
    }
}

async function loadHistory() {
    const countBadge = document.getElementById("history-count");
    const clearBtn = document.getElementById("clear-history-btn");
    showHistoryLoading();
    if (clearBtn) clearBtn.style.display = "none";

    try {
        const response = await fetch("/api/history");
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Impossible de charger l'historique.");
        }

        historyCache = data.analyses || [];
        renderHistory();
    } catch (error) {
        console.error("Erreur lors du chargement de l'historique:", error);
        historyCache = [];
        if (countBadge) countBadge.textContent = "0 analyses";
        showHistoryError(error.message || "Erreur lors du chargement de l'historique");
    }
}

function normalizeDossierQuery(value) {
    return String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
}

function formatHistoryWhen(iso) {
    if (!iso) return { label: "Date inconnue", title: "" };
    const date = new Date(iso);
    if (isNaN(date)) return { label: "Date inconnue", title: "" };
    const abs = date.toLocaleDateString("fr-FR") + " " + date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const diff = Date.now() - date.getTime();
    let label = abs;
    if (diff >= 0 && diff < 60 * 1000) label = "À l'instant";
    else if (diff < 60 * 60 * 1000) label = "Il y a " + Math.max(1, Math.floor(diff / 60000)) + " min";
    else if (diff < 24 * 60 * 60 * 1000) label = "Il y a " + Math.max(1, Math.floor(diff / 3600000)) + " h";
    else if (diff < 7 * 24 * 60 * 60 * 1000) label = "Il y a " + Math.max(1, Math.floor(diff / 86400000)) + " j";
    return { label: label, title: abs };
}

function updateFilterCounts() {
    const filters = document.getElementById("history-filters");
    if (!filters) return;
    const counts = { all: historyCache.length, glioma: 0, meningioma: 0, pituitary: 0, notumor: 0 };
    historyCache.forEach(function (analyse) {
        const cls = analyse.classification && analyse.classification.class;
        if (Object.prototype.hasOwnProperty.call(counts, cls)) counts[cls] += 1;
    });
    filters.querySelectorAll("[data-filter]").forEach(function (btn) {
        const key = btn.getAttribute("data-filter");
        const base = btn.getAttribute("data-label") || btn.textContent.replace(/\s*\(\d+\)\s*$/, "");
        btn.setAttribute("data-label", base);
        const n = counts[key] != null ? counts[key] : 0;
        btn.textContent = base + " (" + n + ")";
    });
}

function getFilteredAnalyses() {
    const query = normalizeDossierQuery(historySearch);
    return historyCache.filter((analyse) => {
        if (historyFilter !== "all" && (!analyse.classification || analyse.classification.class !== historyFilter)) {
            return false;
        }
        if (!query) return true;
        const hay = [
            analyse.patient_id,
            analyse.short_id,
            formatAnalysisRef(analyse.id, analyse.short_id),
            analyse.filename,
            analyse.id
        ].map(normalizeDossierQuery).join(" ");
        return hay.includes(query);
    });
}

function updateHistoryCount(visibleCount) {
    const countBadge = document.getElementById("history-count");
    if (!countBadge) return;
    const total = historyCache.length;
    const word = (n) => n + " analyse" + (n > 1 ? "s" : "");
    if (!total) {
        countBadge.textContent = "0 analyses";
        return;
    }
    if (visibleCount === total && !historySearch && historyFilter === "all") {
        countBadge.textContent = word(total);
        return;
    }
    countBadge.textContent = visibleCount + " / " + word(total);
}

function renderHistory() {
    const container = document.getElementById("history-container");
    const clearBtn = document.getElementById("clear-history-btn");
    if (!container) return;

    const analyses = getFilteredAnalyses();
    updateHistoryCount(analyses.length);
    updateFilterCounts();

    if (historyCache.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center py-5">
                <i class="fas fa-inbox fa-3x mb-3 text-muted"></i>
                <p class="text-muted mb-3">Aucune analyse enregistrée pour le moment.</p>
                <button type="button" class="btn btn-primary btn-sm" data-history-go-analyse>
                    <i class="fas fa-microscope me-1"></i>Lancer une analyse
                </button>
            </div>
        `;
        if (clearBtn) clearBtn.style.display = "none";
        return;
    }

    if (clearBtn) {
        clearBtn.style.display = "block";
        clearBtn.onclick = async function () {
            if (confirm("Êtes-vous sûr de vouloir vider complètement l'historique ?")) {
                try {
                    const response = await fetch("/api/history", { method: "DELETE" });
                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.error || "Suppression impossible");
                    }
                    await loadHistory();
                } catch (error) {
                    showHistoryError(error.message || "Erreur lors de la suppression de l'historique");
                }
            }
        };
    }

    if (analyses.length === 0) {
        const query = historySearch.trim();
        let message = "Aucune analyse pour ce type de tumeur.";
        if (query && historyFilter !== "all") {
            message = `Aucune analyse de ce type pour le dossier « ${query} ».`;
        } else if (query) {
            message = `Aucun dossier ne correspond à « ${query} ».`;
        }
        container.innerHTML = `
            <div class="alert alert-secondary text-center py-5">
                <i class="fas fa-search fa-2x mb-3 text-muted"></i>
                <p class="text-muted mb-3">${escapeHtml(message)}</p>
                <button type="button" class="btn btn-outline-primary btn-sm" data-history-reset>
                    Réinitialiser les filtres
                </button>
            </div>
        `;
        return;
    }

    let html = '<div class="row g-4">';
    for (const analyse of analyses) {
        const when = formatHistoryWhen(analyse.timestamp);
        const className = formatClassLabel(analyse.classification.class);
        const isTumorClass = analyse.classification.class !== "notumor";
        const confidence = Number(analyse.classification.confidence).toFixed(1);
        const tumorPercent = Number(analyse.segmentation.percentage).toFixed(2);
        const filename = analyse.filename
            ? `<small class="text-muted d-block text-truncate">${escapeHtml(analyse.filename)}</small>`
            : "";
        const patientLine = analyse.patient_id
            ? `<small class="d-block text-truncate"><i class="fas fa-folder-open me-1"></i>Dossier ${escapeHtml(analyse.patient_id)}</small>`
            : `<small class="text-muted d-block">Dossier non renseigné</small>`;
        const shortRef = formatAnalysisRef(analyse.id, analyse.short_id);
        const thumb = analyse.original_image || "";

        html += `
            <div class="col-md-6 col-lg-4">
                <div class="card h-100 history-card" data-view-id="${analyse.id}" title="Voir les détails">
                    <div class="card-header bg-light">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="me-2 overflow-hidden">
                                <small class="text-muted" title="${escapeHtml(when.title)}">${escapeHtml(when.label)} · <span class="report-ref">${escapeHtml(shortRef)}</span></small>
                                <h6 class="card-title mb-0 mt-1">${className}</h6>
                                ${patientLine}
                                ${filename}
                            </div>
                            <span class="badge ${isTumorClass ? "bg-danger" : "bg-success"}">
                                ${isTumorClass ? "Tumeur" : "Normal"}
                            </span>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="mb-3 history-thumb-wrap">
                            <img src="${thumb}" class="img-fluid rounded history-thumb" alt="Aperçu ${escapeHtml(className)}">
                        </div>
                        <div class="row g-2 text-center mb-0">
                            <div class="col-6">
                                <div class="bg-primary bg-opacity-10 p-2 rounded">
                                    <small class="text-muted d-block">Confiance</small>
                                    <strong class="text-primary">${confidence}%</strong>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="bg-danger bg-opacity-10 p-2 rounded">
                                    <small class="text-muted d-block">Masque</small>
                                    <strong class="text-danger">${tumorPercent}%</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer bg-light">
                        <button type="button" class="btn btn-sm btn-primary w-100 mb-2" data-view-id="${analyse.id}">
                            <i class="fas fa-eye me-1"></i>Voir détails
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger w-100" data-delete-id="${analyse.id}">
                            <i class="fas fa-trash me-1"></i>Supprimer
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    html += "</div>";
    container.innerHTML = html;
}

async function viewAnalysis(analysisId) {
    try {
        const response = await fetch(`/api/history/${analysisId}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || data.detail || "Analyse introuvable");
        }
        displayResults(data, { fromHistory: true });
        showSection("resultats");
        updateNavigation("nav-historique");
    } catch (error) {
        showHistoryError(error.message || "Erreur lors du chargement des détails de l'analyse");
    }
}

async function deleteAnalysis(analysisId) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette analyse ?")) {
        return;
    }
    try {
        const response = await fetch(`/api/history/${analysisId}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Suppression impossible");
        }
        await loadHistory();
    } catch (error) {
        showHistoryError(error.message || "Erreur lors de la suppression");
    }
}

function setupHistoryFilters() {
    const filters = document.getElementById("history-filters");
    if (!filters) return;
    filters.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-filter]");
        if (!btn) return;
        historyFilter = btn.getAttribute("data-filter") || "all";
        filters.querySelectorAll("[data-filter]").forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");
        renderHistory();
    });
}

function setupHistorySearch() {
    const input = document.getElementById("history-search-input");
    const clearBtn = document.getElementById("history-search-clear");
    if (!input) return;

    const applySearch = function () {
        historySearch = input.value || "";
        renderHistory();
    };

    input.addEventListener("input", applySearch);
    input.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            input.value = "";
            historySearch = "";
            renderHistory();
        }
    });

    if (clearBtn) {
        clearBtn.addEventListener("click", function () {
            input.value = "";
            historySearch = "";
            input.focus();
            renderHistory();
        });
    }
}

function resetHistoryFilters() {
    historyFilter = "all";
    historySearch = "";
    const input = document.getElementById("history-search-input");
    if (input) input.value = "";
    const filters = document.getElementById("history-filters");
    if (filters) {
        filters.querySelectorAll("[data-filter]").forEach(function (el) {
            el.classList.toggle("active", el.getAttribute("data-filter") === "all");
        });
    }
    renderHistory();
}

function setupHistoryListActions() {
    const container = document.getElementById("history-container");
    const section = document.getElementById("historique-section");
    if (container && !container.dataset.bound) {
        container.dataset.bound = "1";
        container.addEventListener("click", function (e) {
            if (e.target.closest("[data-history-go-analyse]")) {
                e.preventDefault();
                showSection("analyse");
                updateNavigation("nav-analyse");
                return;
            }
            if (e.target.closest("[data-history-reset]")) {
                e.preventDefault();
                resetHistoryFilters();
                return;
            }
            const del = e.target.closest("[data-delete-id]");
            if (del) {
                e.preventDefault();
                e.stopPropagation();
                deleteAnalysis(del.getAttribute("data-delete-id"));
                return;
            }
            const view = e.target.closest("[data-view-id]");
            if (view) {
                e.preventDefault();
                viewAnalysis(view.getAttribute("data-view-id"));
            }
        });
    }
    if (section && !section.dataset.bound) {
        section.dataset.bound = "1";
        section.addEventListener("click", function (e) {
            if (e.target.closest("[data-history-go-analyse]")) {
                e.preventDefault();
                showSection("analyse");
                updateNavigation("nav-analyse");
            }
        });
    }
}

function refreshOutdatedInterface() {
    const requiredIds = [
        "pred-conf-label",
        "diagnosis-meta",
        "interpretation-content",
        "original-image-caption",
        "seg-extent",
        "patient-id-input"
    ];
    if (requiredIds.every((id) => document.getElementById(id))) {
        return false;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get("nv_ui") === "2") {
        return false;
    }
    url.searchParams.set("nv_ui", "2");
    window.location.replace(url.toString());
    return true;
}

// Vérifier l'état du serveur au chargement
document.addEventListener('DOMContentLoaded', function() {
    if (refreshOutdatedInterface()) return;
    setupDragAndDrop();
    setupHistoryFilters();
    setupHistorySearch();
    setupHistoryListActions();
    setupResultActions();

    fetch('/api/health')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.status === 'ok') updateModelStatus(data);
        })
        .catch(function() {
            console.log('Serveur en cours de démarrage...');
        });
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

    const openFilePicker = function(e) {
        e.preventDefault();
        e.stopPropagation();
        fileInput.value = "";
        fileInput.click();
    };

    dropZone.addEventListener('click', openFilePicker);
    
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
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    fileInput.addEventListener('change', function() {
        const file = this.files && this.files[0];
        this.value = "";
        if (file) handleFileSelect(file);
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
    showSection("loader");
    
    // Préparer l'envoi
    const formData = new FormData();
    formData.append('file', file);

    let data;
    try {
        const response = await fetch('/api/predict', {
            method: 'POST',
            body: formData
        });

        data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || data.message || 'Erreur lors de l\'analyse');
        }
    } catch (error) {
        console.error('Erreur lors de l\'analyse:', error);
        showSection("analyse");
        alert(`Erreur d'analyse: ${error.message}`);
        return;
    }

    try {
        displayResults(data, { fromHistory: false });
        showSection("resultats");
        updateNavigation("nav-analyse");
    } catch (error) {
        console.error('Analyse terminée, mais affichage impossible:', error);
        showSection("analyse");
        alert("L'analyse a été effectuée et enregistrée dans l'historique, mais son affichage a échoué. Rechargez la page, puis ouvrez-la depuis l'historique.");
    }
}

function displayResults(data, options = {}) {
    viewingFromHistory = options.fromHistory === true;

    const backBtn = document.getElementById("back-to-history-btn");
    if (backBtn) {
        backBtn.style.display = viewingFromHistory ? "inline-block" : "none";
    }

    const resultsEl = document.getElementById("results-area");
    if (resultsEl) resultsEl.classList.add("fade-in");

    const cls = data.classification;
    const seg = data.segmentation;
    const interpretation = interpretResults(data);
    currentAnalysisId = data.id || null;

    document.getElementById("pred-class").textContent = formatClassLabel(cls.class);
    document.getElementById("pred-conf").textContent = Number(cls.confidence).toFixed(1) + "%";
    document.getElementById("pred-conf-label").textContent = interpretation.confidence.label;

    const badge = document.getElementById("pred-conf");
    updateConfidenceBadge(badge, cls.confidence);
    updateDiagnosisDescription(cls.class);
    updateDiagnosisVisual(cls.class, interpretation);

    displayConfidenceBars(cls.details || []);
    renderInterpretation(interpretation);

    document.getElementById("img-original").src = data.original_image;
    if (seg && seg.image) {
        document.getElementById("img-segmentation").src = seg.image;
    }

    const caption = document.getElementById("original-image-caption");
    if (caption) {
        caption.textContent = data.filename
            ? `Fichier analysé : ${data.filename}`
            : "Image IRM cérébrale soumise pour analyse";
    }

    document.getElementById("seg-percent").textContent = Number(seg.percentage).toFixed(2) + "%";
    document.getElementById("seg-extent").textContent = interpretation.extent.label;

    const tumorAlert = document.getElementById("tumor-alert");
    const tumorAlertText = document.getElementById("tumor-alert-text");
    tumorAlert.style.display = "block";
    tumorAlert.className = `alert ${interpretation.concordance.alertClass} mt-3`;
    tumorAlertText.textContent = interpretation.concordance.short;

    const reportDate = data.timestamp ? new Date(data.timestamp) : new Date();
    document.getElementById("report-date").textContent =
        reportDate.toLocaleDateString("fr-FR") + " " + reportDate.toLocaleTimeString("fr-FR");
    document.getElementById("report-id").textContent = formatAnalysisRef(data.id, data.short_id);
    fillPatientField(data.patient_id || "");
}

const TUMOR_PROFILES = {
    glioma: {
        subtitle: "Tumeur primitive se développant à partir des cellules gliales",
        about: "Les gliomes naissent dans le tissu de soutien du cerveau. Ils sont souvent intra-axiaux (dans le parenchyme) et peuvent être plus ou moins infiltrants selon le grade, que cette analyse ne détermine pas.",
        clues: [
            "Localisation habituelle : hémisphères cérébraux, parfois tronc cérébral",
            "Aspect typique : lésion dans le tissu cérébral, parfois mal limitée",
            "Cette IA ne distingue pas le grade (bas grade vs glioblastome)"
        ],
        overlayHint: "Le voile rouge marque la zone que le modèle de segmentation considère comme anormale. Un gliome infiltrant peut dépasser cette zone visible."
    },
    meningioma: {
        subtitle: "Tumeur généralement extra-axiale, issue des méninges",
        about: "Les méningiomes se développent à partir des enveloppes du cerveau. Ils sont souvent d'évolution lente et extra-axiaux (à la surface), mais seul un médecin peut confirmer la nature et le grade.",
        clues: [
            "Localisation habituelle : convexité, faux du cerveau, base du crâne",
            "Aspect typique : masse bien limitée, souvent à la périphérie du cerveau",
            "La taille et le retentissement (œdème, compression) ne sont pas évalués ici"
        ],
        overlayHint: "Le masque rouge devrait plutôt se situer en périphérie si le modèle localise un méningiome. Un masque au centre du cerveau est un signal de prudence."
    },
    pituitary: {
        subtitle: "Lésion de la région sellaire (glande hypophyse)",
        about: "Les tumeurs hypophysaires se situent à la base du cerveau, dans la selle turcique. Elles peuvent rester localisées ou s'étendre vers le chiasma optique. Cette analyse ne mesure ni les hormones ni la vision.",
        clues: [
            "Localisation habituelle : base du cerveau, sur la ligne médiane",
            "À relier cliniquement à des signes endocriniens ou visuels, non lus par l'IA",
            "La distinction adénome / autre lésion sellaire n'est pas faite ici"
        ],
        overlayHint: "Un masque cohérent se situe plutôt en bas et au centre de l'image. Un masque très étendu ou excentré invite à relire l'image."
    },
    notumor: {
        subtitle: "Aucune classe tumorale retenue par le classifieur",
        about: "Le modèle de classification n'a pas retenu de gliome, de méningiome ni de lésion hypophysaire. Cela n'exclut pas une autre pathologie (accident vasculaire, infection, artefact, mauvaise coupe).",
        clues: [
            "Résultat à relire si l'image est floue, recadrée ou n'est pas une IRM cérébrale",
            "Une IRM normale n'est confirmée que par un radiologue",
            "L'absence de tumeur classée ≠ absence de toute anomalie"
        ],
        overlayHint: "Idéalement, peu ou pas de zone rouge. Un masque malgré un classifieur « normal » est une discordance à signaler."
    }
};

function interpretResults(data) {
    const cls = data.classification || {};
    const seg = data.segmentation || {};
    const className = cls.class || "notumor";
    const confidence = Number(cls.confidence) || 0;
    const percent = Number(seg.percentage) || 0;
    const tumorClass = className !== "notumor";
    const maskHit = Boolean(seg.tumor_detected);
    const profile = TUMOR_PROFILES[className] || TUMOR_PROFILES.notumor;

    const details = (cls.details || []).slice().sort((a, b) => b.probability - a.probability);
    const second = details[1];
    const gap = second ? confidence - Number(second.probability) : 100;

    let confidenceLevel = "elevee";
    let confidenceLabel = "Confiance élevée";
    let confidenceText = `Le classifieur est assez tranché (${confidence.toFixed(1)} %).`;
    if (confidence < 70) {
        confidenceLevel = "faible";
        confidenceLabel = "Confiance faible";
        confidenceText = `La prédiction est peu assurée (${confidence.toFixed(1)} %). Le résultat est à prendre comme une hypothèse fragile.`;
    } else if (confidence < 85) {
        confidenceLevel = "moderee";
        confidenceLabel = "Confiance modérée";
        confidenceText = `La prédiction est plausible (${confidence.toFixed(1)} %) mais pas tranchée.`;
    }
    if (second && gap < 15) {
        confidenceText += ` L'écart avec « ${formatClassLabel(second.label)} » n'est que de ${gap.toFixed(1)} points : hésitation possible entre ces deux classes.`;
        if (confidenceLevel === "elevee") {
            confidenceLevel = "moderee";
            confidenceLabel = "Confiance à nuancer";
        }
    } else if (second) {
        confidenceText += ` L'alternative la plus proche est « ${formatClassLabel(second.label)} » (${Number(second.probability).toFixed(1)} %).`;
    }

    let extentKey = "aucune";
    let extentLabel = "Absente";
    let extentText = "Le modèle de segmentation n'a presque rien marqué sur l'image.";
    if (percent >= 20) {
        extentKey = "etendue";
        extentLabel = "Étendue";
        extentText = `Une large part de l'image (${percent.toFixed(1)} %) est marquée. Cela peut correspondre à une lésion volumineuse, à un masque trop généreux, ou à un artefact.`;
    } else if (percent >= 8) {
        extentKey = "moderee";
        extentLabel = "Modérée";
        extentText = `La zone marquée est nette (${percent.toFixed(1)} % de l'image). C'est une étendue intermédiaire, à recouper avec la localisation du voile rouge.`;
    } else if (percent >= 2) {
        extentKey = "limitee";
        extentLabel = "Limitée";
        extentText = `La zone marquée reste limitée (${percent.toFixed(1)} % de l'image), plutôt focale.`;
    } else if (percent >= 0.1) {
        extentKey = "focale";
        extentLabel = "Focale";
        extentText = `Seul un petit foyer est marqué (${percent.toFixed(2)} %). Cela peut être une lésion débutante autant qu'un bruit de prédiction.`;
    }

    let concordance;
    if (tumorClass && maskHit) {
        concordance = {
            level: "ok",
            title: "Lecture cohérente",
            alertClass: "alert-danger",
            short: `Les deux modèles s'accordent : classe « ${formatClassLabel(className)} » et zone anormale visible (${percent.toFixed(2)} % de l'image).`,
            text: "Le classifieur retient une tumeur et le masque localise une zone. C'est le scénario le plus lisible, sans garantir que le type ou les contours soient exacts."
        };
    } else if (!tumorClass && !maskHit) {
        concordance = {
            level: "ok",
            title: "Lecture cohérente",
            alertClass: "alert-success",
            short: "Les deux modèles s'accordent : pas de classe tumorale, pas de zone marquée.",
            text: "Classification et segmentation vont dans le même sens. Cela ne remplace pas une lecture radiologique : d'autres anomalies peuvent échapper à ces modèles."
        };
    } else if (tumorClass && !maskHit) {
        concordance = {
            level: "warn",
            title: "Discordance : type sans localisation",
            alertClass: "alert-warning",
            short: `Le classifieur retient « ${formatClassLabel(className)} », mais la segmentation ne dessine presque rien.`,
            text: "Le type est proposé sans zone nette. Causes possibles : lésion trop petite, contraste faible, coupe peu informative, ou classifieur trop confiant. À relire avec prudence."
        };
    } else {
        concordance = {
            level: "warn",
            title: "Discordance : masque sans classe tumorale",
            alertClass: "alert-warning",
            short: `Une zone est marquée (${percent.toFixed(2)} %), alors que le classifieur conclut « aucune tumeur ».`,
            text: "Le masque a réagi, le classifieur non. Cela peut être un artefact, une autre anomalie, ou une hésitation du classifieur. Ne pas ignorer le masque, ne pas en faire un diagnostic."
        };
    }

    const classLabel = formatClassLabel(className);
    let synthesis;
    if (!tumorClass && !maskHit) {
        synthesis = `Sur cette image, l'IA n'identifie pas de tumeur parmi les quatre classes apprises (gliome, méningiome, hypophysaire, absence). La confiance du classifieur est ${confidenceLabel.toLowerCase()} (${confidence.toFixed(1)} %).`;
    } else if (tumorClass) {
        synthesis = `L'hypothèse principale est un ${classLabel.toLowerCase()}, avec ${confidenceLabel.toLowerCase()} (${confidence.toFixed(1)} %). ${extentText}`;
    } else {
        synthesis = `Le classifieur ne retient pas de tumeur, mais une zone représentant ${percent.toFixed(2)} % de l'image a été marquée. ${concordance.text}`;
    }

    return {
        className,
        classLabel,
        profile,
        confidence: { level: confidenceLevel, label: confidenceLabel, text: confidenceText, gap, second },
        extent: { key: extentKey, label: extentLabel, text: extentText, percent },
        concordance,
        synthesis
    };
}

function updateDiagnosisVisual(className, interpretation) {
    const icon = document.getElementById("diagnosis-icon");
    if (icon) {
        icon.className = "diagnosis-icon " + (className === "notumor" ? "bg-success" : "bg-danger");
        icon.innerHTML = className === "notumor"
            ? '<i class="fas fa-check"></i>'
            : '<i class="fas fa-stethoscope"></i>';
    }

    const meta = document.getElementById("diagnosis-meta");
    if (meta) {
        const badgeClass = interpretation.concordance.level === "ok"
            ? (className === "notumor" ? "bg-success" : "bg-danger")
            : "bg-warning text-dark";
        meta.innerHTML = `
            <span class="badge ${badgeClass}">${escapeHtml(interpretation.concordance.title)}</span>
            <span class="badge bg-light text-dark border ms-1 report-ref" id="diagnosis-ref">${escapeHtml(formatAnalysisRef(currentAnalysisId))}</span>
        `;
    }
}

function renderInterpretation(interp) {
    const root = document.getElementById("interpretation-content");
    if (!root) return;

    const secondLine = interp.confidence.second
        ? `<li>Deuxième hypothèse : <strong>${escapeHtml(formatClassLabel(interp.confidence.second.label))}</strong> (${Number(interp.confidence.second.probability).toFixed(1)} %).</li>`
        : "";

    const clues = interp.profile.clues.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const tone = interp.concordance.level === "ok"
        ? (interp.className === "notumor" ? "interp-ok" : "interp-tumor")
        : "interp-warn";

    root.innerHTML = `
        <div class="interp-synthesis ${tone}">
            <h4 class="mb-2">En langage clair</h4>
            <p class="mb-0">${escapeHtml(interp.synthesis)}</p>
        </div>

        <div class="row g-3 mt-1">
            <div class="col-md-4">
                <div class="interp-box">
                    <div class="interp-box-label">Confiance du classifieur</div>
                    <div class="interp-box-value">${escapeHtml(interp.confidence.label)}</div>
                    <p class="small text-muted mb-0">${escapeHtml(interp.confidence.text)}</p>
                </div>
            </div>
            <div class="col-md-4">
                <div class="interp-box">
                    <div class="interp-box-label">Étendue du masque</div>
                    <div class="interp-box-value">${escapeHtml(interp.extent.label)}</div>
                    <p class="small text-muted mb-0">${escapeHtml(interp.extent.text)}</p>
                </div>
            </div>
            <div class="col-md-4">
                <div class="interp-box">
                    <div class="interp-box-label">Cohérence des deux IA</div>
                    <div class="interp-box-value">${escapeHtml(interp.concordance.title)}</div>
                    <p class="small text-muted mb-0">${escapeHtml(interp.concordance.text)}</p>
                </div>
            </div>
        </div>

        <div class="interp-block mt-4">
            <h5><i class="fas fa-brain me-2 text-primary"></i>Ce que signifie « ${escapeHtml(interp.classLabel)} »</h5>
            <p>${escapeHtml(interp.profile.about)}</p>
            <ul class="mb-0">${clues}${secondLine}</ul>
        </div>

        <div class="interp-block mt-4">
            <h5><i class="fas fa-eye me-2 text-danger"></i>Comment lire les images</h5>
            <p class="mb-2">${escapeHtml(interp.profile.overlayHint)}</p>
            <p class="mb-0 text-muted small">Le pourcentage n'est pas un volume tumoral : c'est la part de l'image (redimensionnée) marquée par le modèle. La couleur rouge est un calque d'aide, pas un contour chirurgical.</p>
        </div>
    `;
}

function setupResultActions() {
    const backBtn = document.getElementById("back-to-history-btn");
    if (backBtn) {
        backBtn.addEventListener("click", function () {
            showSection("historique");
            updateNavigation("nav-historique");
            loadHistory();
        });
    }

    const newBtn = document.getElementById("new-analysis-btn");
    if (newBtn) {
        newBtn.addEventListener("click", async function () {
            await savePatientIdIfNeeded();
            const fileInput = document.getElementById("fileInput");
            if (fileInput) fileInput.value = "";
            currentAnalysisId = null;
            fillPatientField("");
            showSection("analyse");
            updateNavigation("nav-analyse");
        });
    }

    const printBtn = document.getElementById("print-report-btn");
    if (printBtn) {
        printBtn.addEventListener("click", async function () {
            await savePatientIdIfNeeded();
            window.print();
        });
    }

    const savePatientBtn = document.getElementById("save-patient-btn");
    if (savePatientBtn) {
        savePatientBtn.addEventListener("click", function () {
            savePatientIdIfNeeded({ force: true });
        });
    }

    const patientInput = document.getElementById("patient-id-input");
    if (patientInput) {
        patientInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                savePatientIdIfNeeded({ force: true });
            }
        });
    }
}

function fillPatientField(patientId) {
    savedPatientId = patientId || "";
    const input = document.getElementById("patient-id-input");
    if (input) input.value = savedPatientId;
    const reportPatient = document.getElementById("report-patient-id");
    if (reportPatient) {
        reportPatient.textContent = savedPatientId || "Non renseigné";
    }
    setPatientFeedback("");
}

function setPatientFeedback(message, type) {
    const el = document.getElementById("patient-save-feedback");
    if (!el) return;
    if (!message) {
        el.textContent = "";
        el.className = "small mt-2";
        return;
    }
    const cls = type === "error" ? "text-danger" : "text-success";
    el.className = `small mt-2 ${cls}`;
    el.textContent = message;
}

async function savePatientIdIfNeeded(options = {}) {
    const input = document.getElementById("patient-id-input");
    const value = input ? input.value.trim() : "";
    const force = options.force === true;
    if (!currentAnalysisId) {
        if (force) setPatientFeedback("Aucune analyse à associer.", "error");
        return false;
    }
    if (!force && value === savedPatientId) {
        return true;
    }
    try {
        const response = await fetch(`/api/history/${currentAnalysisId}/patient`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patient_id: value })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || data.detail || "Enregistrement impossible");
        }
        savedPatientId = data.patient_id || "";
        if (input) input.value = savedPatientId;
        const reportPatient = document.getElementById("report-patient-id");
        if (reportPatient) {
            reportPatient.textContent = savedPatientId || "Non renseigné";
        }
        setPatientFeedback(
            savedPatientId
                ? `Dossier ${savedPatientId} associé à cette analyse.`
                : "Dossier patient retiré de cette analyse.",
            "ok"
        );
        return true;
    } catch (error) {
        setPatientFeedback(error.message || "Erreur lors de l'enregistrement du dossier.", "error");
        return false;
    }
}

function formatAnalysisRef(analysisId, shortId) {
    if (shortId) return shortId;
    const raw = String(analysisId || "").replace(/-/g, "").toUpperCase();
    return raw ? `NV-${raw.slice(0, 8)}` : "NV---------";
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

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function updateDiagnosisDescription(className) {
    const descElement = document.getElementById('diagnosis-description');
    if (descElement) {
        const profile = TUMOR_PROFILES[className];
        descElement.textContent = profile
            ? profile.subtitle
            : 'Classification par réseau de neurones convolutifs';
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
    if (!details || !details.length) {
        return;
    }
    
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
    if (e.key === 'Escape' && wrapper && isMobileViewport() && wrapper.classList.contains("toggled")) {
        closeMobileSidebar();
        return;
    }
    if (e.key === 'Escape' && resultsArea && resultsArea.style.display === 'block') {
        if (viewingFromHistory) {
            showSection("historique");
            updateNavigation("nav-historique");
            loadHistory();
            return;
        }
        if (confirm('Voulez-vous recommencer une nouvelle analyse ?')) {
            const fileInput = document.getElementById("fileInput");
            if (fileInput) fileInput.value = "";
            showSection("analyse");
            updateNavigation("nav-analyse");
        }
    }
});

try {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach(function (tooltipTriggerEl) {
        new bootstrap.Tooltip(tooltipTriggerEl);
    });
} catch (e) {
    // Bootstrap optionnel
}
