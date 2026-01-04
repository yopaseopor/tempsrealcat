// Global translations object - will be populated by loading language files
let translations = {};
let currentLanguage = 'ca';

function loadLanguageFile(lang) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `assets/js/translations_${lang}.js`;
        script.onload = () => {
            // The loaded script should set window.translations_{lang}
            const langTranslations = window[`translations_${lang}`];
            if (langTranslations) {
                translations[lang] = langTranslations;
                resolve();
            } else {
                reject(new Error(`Language file for ${lang} did not define translations`));
            }
        };
        script.onerror = () => reject(new Error(`Failed to load language file for ${lang}`));
        document.head.appendChild(script);
    });
}

async function setLanguage(lang) {
    try {
        // Load language file if not already loaded
        if (!translations[lang]) {
            await loadLanguageFile(lang);
        }

        currentLanguage = lang;
        localStorage.setItem('language', lang);
        updateLanguage();
        // Also update POI names when language changes
        updatePOINames();
        // Update route button translations when language changes
        if (typeof updateRouteButtonTranslations === 'function') {
            updateRouteButtonTranslations();
        }
    } catch (error) {
        console.error('Error loading language:', error);
        // Fallback to default language
        if (lang !== 'ca') {
            setLanguage('ca');
        }
    }
}

function getTranslation(key) {
    return translations[currentLanguage]?.[key] || key;
}

// Get localized name from OSM tags based on current language
function getLocalizedName(tags) {
    if (!tags) return '';

    var lang = currentLanguage || 'ca';

    // Try language-specific name first, then fall back to default name
    switch(lang) {
        case 'en':
            return tags['name:en'] || tags.name || '';
        case 'es':
            return tags['name:es'] || tags.name || '';
        case 'ca':
            return tags['name:ca'] || tags.name || '';
        default:
            return tags.name || '';
    }
}

function updateLanguage() {
    // Update all elements with data-i18n attributes
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = getTranslation(key);
        if (translation) {
            element.textContent = translation;
        }
    });
}

function updatePOINames() {
    // Update POI names in the pois object
    for (const poiKey in pois) {
        if (pois[poiKey]) {
            const translationKey = `poi_${poiKey}`;
            const translatedName = getTranslation(translationKey);
            if (translatedName && translatedName !== translationKey) {
                pois[poiKey].name = translatedName;
            }
        }
    }

    // Rebuild the POI checkboxes with new names
    if (typeof show_pois_checkboxes === 'function') {
        show_pois_checkboxes();
    }
}

// Initialize language
document.addEventListener('DOMContentLoaded', function() {
    const savedLang = localStorage.getItem('language') || 'ca';
    setLanguage(savedLang);
});
