// Initializer for tag search UI: preloads taginfo CSV and wires fallback execute behavior
$(document).ready(function() {
    console.log('tag_search_init: DOM ready, initializing tag search support');

    // Preload taginfo datasets to enable predictive search ASAP
    try {
        if (window.initTaginfoAPI && !window.taginfoData.loaded) {
            console.log('tag_search_init: calling initTaginfoAPI');
            window.initTaginfoAPI();
        }
        if (window.initTaginfoAPIYes && !window.taginfoDataYes.loaded) {
            console.log('tag_search_init: calling initTaginfoAPIYes');
            window.initTaginfoAPIYes();
        }
    } catch (e) {
        console.warn('tag_search_init: error preloading taginfo', e);
    }

    // Try to initialize key/value searchers even if other scripts deferred them
    try {
        if (typeof window.initKeySearch === 'function') {
            console.log('tag_search_init: calling initKeySearch()');
            window.initKeySearch();
        }
        if (typeof window.initValueSearch === 'function') {
            console.log('tag_search_init: calling initValueSearch()');
            window.initValueSearch();
        }
    } catch (e) {
        console.warn('tag_search_init: error calling initKeySearch/initValueSearch', e);
    }

    // Ensure execute buttons are visible (some pages might hide them by CSS)
    $('#execute-key-query-btn').show();
    $('#clear-key-search-btn').show();
    $('#execute-query-btn').show();
    $('#clear-search-btn').show();

    // Fallback handler for value execute button: if value input contains key=value or a selected key exists,
    // call the global executeTagQuery function (defined in value_search.js)
    $('#execute-query-btn').on('click.tagsearchinit', function(e) {
        console.log('tag_search_init: execute-query-btn clicked (fallback handler)');
        // If value_search.js's internal handler already handled it, this will be a duplicate; guard using a small timeout
        setTimeout(function() {
            try {
                const valInput = $('#value-search');
                const raw = (valInput.val() || '').trim();
                const selectedKey = valInput.data('selectedKey');

                console.log('tag_search_init: value raw=', raw, 'selectedKey=', selectedKey);

                if (!raw && !selectedKey) return; // nothing to do

                // If raw contains '=' parse key=value
                if (raw.includes('=')) {
                    const parts = raw.split('=');
                    const key = parts.shift().trim();
                    const value = parts.join('=').trim();
                    console.log('tag_search_init: parsed key=', key, 'value=', value);
                    if (key && typeof window.executeTagQuery === 'function') {
                        // Show spinner immediately (fallback) if available
                        try { if (window.loading && typeof window.loading.show === 'function') window.loading.show(); else $('#spinner').show(); } catch(e) {}
                        window.executeTagQuery(key, value);
                        return;
                    }
                }

                // If a selectedKey exists, use it
                if (selectedKey && raw && typeof window.executeTagQuery === 'function') {
                    try { if (window.loading && typeof window.loading.show === 'function') window.loading.show(); else $('#spinner').show(); } catch(e) {}
                    window.executeTagQuery(selectedKey, raw);
                    return;
                }

                // If no key available but raw looks like a key (no '=') allow generic key query via executeGenericKeyQuery
                if (!raw.includes('=') && typeof window.executeGenericKeyQuery === 'function') {
                    try { if (window.loading && typeof window.loading.show === 'function') window.loading.show(); else $('#spinner').show(); } catch(e) {}
                    window.executeGenericKeyQuery(raw);
                    return;
                }
            } catch (err) {
                console.warn('tag_search_init: fallback handler error', err);
            }
        }, 50);
    });

    // Also wire the key execute button to support direct input like "key" or "key=value" when internal state
    $('#execute-key-query-btn').on('click.tagsearchinit', function() {
        console.log('tag_search_init: execute-key-query-btn clicked (fallback handler)');
        try {
            const raw = ($('#key-search').val() || '').trim();
            if (!raw) return;
            // If the internal handler in key_search.js already picks up clicks, it will run; as fallback, call generic executor if available
            if (typeof window.executeGenericKeyQuery === 'function') {
                try { if (window.loading && typeof window.loading.show === 'function') window.loading.show(); else $('#spinner').show(); } catch(e) {}
                window.executeGenericKeyQuery(raw);
            }
        } catch (err) {
            console.warn('tag_search_init: key execute fallback error', err);
        }
    });
});
