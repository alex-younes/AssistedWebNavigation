// Simplified DOM State Tracker - Content Script
// Tracks DOM changes and state only

// Core state variables
let isRecording = false;
let sessionId = null;
let userId = null;
let currentStateId = null;
let stateCounter = 0;
let lastDomHash = null;
let mutationObserver = null;
let previousStates = {}; // StateHash -> StateId mapping
let processingMutations = false; // Debounce flag
let lastMutationTime = 0; // Track time of last mutation processing
let pendingStateSends = {}; // Track pending state sends to prevent duplicates
let isPageLoading = false; // Track if page is in loading state
let loadingStartTime = 0; // When loading started
let loadingCheckInterval = null; // Interval for checking loading state
let lastDomSnapshot = ''; // Last DOM snapshot for comparison

// Send a message to the background script
function sendToBackground(action, data) {
    console.log(`[DOM Tracker] Sending to background: ${action}`);
    
    // Simple message passing
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action, ...data }, response => {
            if (chrome.runtime.lastError) {
                console.error('[DOM Tracker] Error sending message:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }
            
            console.log(`[DOM Tracker] Response from ${action}:`, response);
            resolve(response);
        });
    });
}

// Calculate hash of the DOM - Improved version with better precision and sensitivity
function calculateDomHash() {
    try {
        // Get the URL path
        const urlObj = new URL(window.location.href);
        const pagePath = urlObj.pathname;
        
        // Create a more detailed structural representation of the DOM with key elements
        const domFingerprint = generateEnhancedDOMFingerprint();
        
        // Combine path and fingerprint for the hash input
        const hashInput = pagePath + '_' + domFingerprint;
        
        // Create hash from the combined input
        let hash = 0;
        for (let i = 0; i < hashInput.length; i++) {
            const char = hashInput.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        // Format hash to be readable
        const baseHash = Math.abs(hash).toString(36);
        const pageId = pagePath.replace(/[^a-z0-9]/gi, '').toLowerCase();
        
        return `${baseHash}_${pageId}`;
    } catch (error) {
        console.error('[DOM Tracker] Error calculating DOM hash:', error);
        // Fallback to path-based identifier
        return `page_${window.location.pathname.replace(/[^a-z0-9]/gi, '')}`;
    }
}

// Generate a more detailed fingerprint of the DOM's structure and content
function generateEnhancedDOMFingerprint() {
    const fingerprint = [];
    
    // Capture all visible structural elements
    const mainElements = document.querySelectorAll('main, section, article, form, div[role="main"], .main-content, div.container');
    Array.from(mainElements).forEach(element => {
        const elementInfo = getElementInfo(element);
        fingerprint.push(elementInfo);
    });
    
    // Get ALL images with their attributes for more sensitivity to image changes
    const imageElements = document.querySelectorAll('img');
    const imageInfo = Array.from(imageElements).map(img => {
        const src = img.src || '';
        const alt = img.alt || '';
        const width = img.width || 0;
        const height = img.height || 0;
        const classes = Array.from(img.classList).join(' ');
        return `img:${src.substring(src.lastIndexOf('/') + 1)}:${width}x${height}:${alt}:${classes}`;
    }).join('|');
    fingerprint.push(`images:${imageInfo}`);
    
    // ENHANCED: Capture form element states with special focus on checkboxes and radio buttons
    const formElements = document.querySelectorAll('input, select, textarea');
    const formInfo = Array.from(formElements).map(el => {
        const type = el.type || el.tagName.toLowerCase();
        const id = el.id || '';
        const name = el.name || '';
        
        // Special handling for different input types to capture their state accurately
        let stateInfo = '';
        
        if (type === 'checkbox' || type === 'radio') {
            // For checkable elements, include checked state
            stateInfo = el.checked ? 'checked' : 'unchecked';
        } else if (type === 'select-one' || type === 'select-multiple') {
            // For select elements, include selected options
            const selectedOptions = Array.from(el.selectedOptions || []).map(opt => opt.value).join(',');
            stateInfo = `selected:${selectedOptions}`;
        } else {
            // For other inputs, include value hint
            stateInfo = el.value ? `value:${el.value.substring(0, 5)}` : 'empty';
        }
        
        return `${type}#${id}[name=${name}]::${stateInfo}`;
    }).join('|');
    fingerprint.push(`forms:${formInfo}`);
    
    // Capture ALL interactive elements (buttons, links, form elements) in more detail
    const interactiveElements = document.querySelectorAll('button, a, [role="button"]');
    const interactiveInfo = Array.from(interactiveElements).map(el => {
        const type = el.tagName.toLowerCase();
        const id = el.id || '';
        const classes = Array.from(el.classList).join(' ');
        const isVisible = isElementVisible(el);
        
        // For buttons and links, include text content
        const textContent = (el.textContent || '').trim().substring(0, 15);
        const disabled = el.disabled ? 'disabled' : 'enabled';
        
        return `${type}#${id}.${classes}:${isVisible}:${disabled}:${textContent}`;
    }).join('|');
    fingerprint.push(`interactive:${interactiveInfo}`);
    
    // Capture key text content from headings and text nodes
    const headings = document.querySelectorAll('h1, h2, h3');
    const headingTexts = Array.from(headings).map(h => {
        return `${h.tagName.toLowerCase()}:${h.textContent.trim().substring(0, 30)}`;
    }).join('|');
    fingerprint.push(`headings:${headingTexts}`);
    
    // Add visible content sections (paragraphs, lists) with more detail
    const contentElements = document.querySelectorAll('p, ul, ol, table, div.content');
    const contentInfo = Array.from(contentElements).slice(0, 20).map(el => {
        const type = el.tagName.toLowerCase();
        // For content elements, include a content hash based on text length and first/last chars
        const contentText = el.textContent.trim();
        const contentLength = contentText.length;
        const contentStart = contentText.substring(0, 15).replace(/\s+/g, '');
        const contentEnd = contentText.length > 15 ? 
            contentText.substring(contentText.length - 15).replace(/\s+/g, '') : '';
        const contentHash = `${contentLength}:${contentStart}:${contentEnd}`;
        return `${type}:${contentHash}`;
    }).join('|');
    fingerprint.push(`content:${contentInfo}`);
    
    // Include details about DOM size and structure
    const domStats = {
        bodyChildren: document.body.children.length,
        totalElements: document.querySelectorAll('*').length,
        forms: document.querySelectorAll('form').length,
        inputs: document.querySelectorAll('input').length,
        images: document.querySelectorAll('img').length
    };
    fingerprint.push(`stats:${JSON.stringify(domStats)}`);
    
    // Include details about CSS variables and styles that affect layout
    const computedStyle = window.getComputedStyle(document.body);
    const layoutInfo = {
        width: computedStyle.width,
        height: computedStyle.height,
        display: computedStyle.display,
        position: computedStyle.position
    };
    fingerprint.push(`layout:${JSON.stringify(layoutInfo)}`);
    
    // Count elements by type for additional structure info
    const elementCounts = {
        divs: document.querySelectorAll('div').length,
        spans: document.querySelectorAll('span').length,
        images: document.querySelectorAll('img').length,
        lists: document.querySelectorAll('ul, ol').length,
        tables: document.querySelectorAll('table').length
    };
    fingerprint.push(`counts:${JSON.stringify(elementCounts)}`);
    
    // Combine all fingerprint components
    return fingerprint.join('~');
}

// Get detailed info about a specific element
function getElementInfo(element) {
    if (!element) return '';
    
    const tagName = element.tagName.toLowerCase();
    const id = element.id || '';
    const classes = Array.from(element.classList).join('.');
    const childrenCount = element.children.length;
    
    // Get first-level children info
    const childrenInfo = Array.from(element.children).slice(0, 5).map(child => {
        return child.tagName.toLowerCase() + (child.id ? `#${child.id}` : '');
    }).join(',');
    
    // Create a signature that represents this element and its structure
    return `${tagName}#${id}.${classes}[${childrenCount}]{${childrenInfo}}`;
}

// Check if an element is visible in the viewport
function isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' && 
           element.offsetWidth > 0 && 
           element.offsetHeight > 0;
}

// Create a DOM state snapshot
function createDomState() {
    const url = window.location.href;
    const hash = calculateDomHash();
    
    // Default to new state, but background script will determine if it's really new based on hash
    const isNewState = true; 
    
    // Create a simple state ID - background script will replace with proper sequential ID or reuse existing
    const stateId = 'state_temp';
    console.log(`[DOM Tracker] Creating state with hash: ${hash}`);
    
    // Capture the current DOM immediately
    const currentDom = document.documentElement.outerHTML;
    
    // Create the state object with the captured DOM
    const state = createStateObject(stateId, url, hash, isNewState);
    
    // Ensure the DOM is included in the state
    state.dom = currentDom;
    
    // Log the state for debugging
    console.log(`[DOM Tracker] Created state with DOM size: ${state.dom.length} bytes`);
    
    currentStateId = stateId; // This will be replaced by background script's ID
    
    return { state, isNewState };
}

// Check if page is still loading by comparing DOM snapshots
function checkLoadingState() {
    if (!isRecording) return;
    
    const currentDom = document.documentElement.outerHTML;
    
    // If DOM has changed since last check, page is still loading
    if (currentDom !== lastDomSnapshot) {
        isPageLoading = true;
        lastDomSnapshot = currentDom;
    } else {
        // If no changes for a while, page is done loading
        isPageLoading = false;
        if (loadingCheckInterval) {
            clearInterval(loadingCheckInterval);
            loadingCheckInterval = null;
        }
    }
}

// Start loading state detection
function startLoadingDetection() {
    isPageLoading = true;
    loadingStartTime = Date.now();
    lastDomSnapshot = document.documentElement.outerHTML;
    
    // Check every 10ms for DOM changes
    if (loadingCheckInterval) {
        clearInterval(loadingCheckInterval);
    }
    
    loadingCheckInterval = setInterval(checkLoadingState, 10);
    
    // Stop checking after 5 seconds (5000ms) to prevent infinite checking
    setTimeout(() => {
        if (loadingCheckInterval) {
            clearInterval(loadingCheckInterval);
            loadingCheckInterval = null;
            isPageLoading = false;
        }
    }, 5000);
}

// Create state object with all required fields
const createStateObject = (stateId, url, hash, isNewState) => {
    // Get current DOM metrics
    const domSize = document.documentElement.outerHTML.length;
    const elementCount = document.getElementsByTagName('*').length;
    const formElements = document.getElementsByTagName('form').length;
    const visibleElements = Array.from(document.getElementsByTagName('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }).length;

    // Get current URL and path
    const currentUrl = url || window.location.href;
    const urlPath = window.location.pathname;
    const urlHash = window.location.hash;
    const urlSearch = window.location.search;

    // Get page title
    const pageTitle = document.title;

    // Get resource information
    const performanceEntries = performance.getEntriesByType('resource');
    const resourceCount = performanceEntries.length;
    const resourceTypes = performanceEntries.reduce((acc, resource) => {
        const type = resource.initiatorType || 'other';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    // Get network information
    const networkInfo = {
        effectiveType: navigator.connection ? navigator.connection.effectiveType : 'unknown',
        downlink: navigator.connection ? navigator.connection.downlink : 0,
        rtt: navigator.connection ? navigator.connection.rtt : 0
    };

    // Get current DOM
    const currentDom = document.documentElement.outerHTML;

    // Calculate load time
    const loadTime = Math.max(0, performance.timing.loadEventEnd - performance.timing.navigationStart);

    // Create loading info
    const loadingInfo = {
        isNavigation: false,
        isInitial: false,
        isReload: false,
        isFinalState: false,
        isPartOfLoading: isPageLoading,
        loadTime: loadTime,
        resourceCount: resourceCount,
        resourceTypes: resourceTypes,
        errorCount: 0,
        networkInfo: networkInfo,
        timestamp: new Date().toISOString()
    };

    // Create mutation info
    const mutationInfo = {
        count: 0,
        types: [],
        timestamp: new Date().toISOString()
    };

    // Create metrics
    const metrics = {
        domSize: domSize,
        elementCount: elementCount,
        formElements: formElements,
        visibleElements: visibleElements
    };

    // Create the complete state object
    return {
        stateId: stateId || `state_${Date.now()}`,
        sessionId: sessionId,
        userId: userId,
        url: currentUrl,
        pathname: urlPath,
        urlHash: urlHash,
        urlSearch: urlSearch,
        title: pageTitle,
        timestamp: new Date().toISOString(),
        isNewState: isNewState !== undefined ? isNewState : true,
        stateNumber: 0, // Will be assigned by background script
        hash: hash || generateHash(currentDom),
        dom: currentDom,
        metrics: metrics,
        loadingInfo: loadingInfo,
        mutationInfo: mutationInfo
    };
};

// Process mutations and create a new state with debouncing
function processMutations(mutations) {
    if (!isRecording) return;
    
    const now = Date.now();
    
    // Keep a short debounce time for responsiveness
    if (processingMutations || (now - lastMutationTime < 100)) {
        console.log('[DOM Tracker] Queuing mutation processing - fast debounce');
        
        // Queue another check if we're not already processing
        if (!processingMutations) {
            setTimeout(() => processMutations(mutations), 50);
        }
        return;
    }
    
    // Set debounce flags
    processingMutations = true;
    lastMutationTime = now;
    
    // Process immediately for responsive detection
    try {
        console.log(`[DOM Tracker] Processing mutations - ${mutations.length} changes`);
        
        // Filter meaningful mutations
        const significantMutations = mutations.filter(mutation => {
            // Always consider childList changes significant
            if (mutation.type === 'childList') return true;
            
            // For attribute changes, only consider certain attributes significant
            if (mutation.type === 'attributes') {
                const significantAttrs = ['src', 'href', 'class', 'id', 'style', 'value', 'checked', 'selected', 'disabled'];
                return significantAttrs.includes(mutation.attributeName);
            }
            
            // Consider all characterData changes significant
            return mutation.type === 'characterData';
        });
        
        if (significantMutations.length === 0) {
            console.log('[DOM Tracker] No significant mutations found, skipping state creation');
            processingMutations = false;
            return;
        }
        
        // Calculate current hash
        const currentHash = calculateDomHash();
        
        console.log(`[DOM Tracker] Current hash: ${currentHash}, Last hash: ${lastDomHash}`);
        console.log(`[DOM Tracker] Known states:`, Object.keys(previousStates));
        
        // Only create a new state if the hash is different from the last one
        if (currentHash !== lastDomHash) {
            console.log(`[DOM Tracker] DOM hash changed due to mutation: ${lastDomHash} -> ${currentHash}`);
            
            // CRITICAL: Check if we've already seen this hash during this session
            if (previousStates[currentHash]) {
                console.log(`[DOM Tracker] *** DUPLICATE STATE DETECTED *** DOM returned to previously seen state with hash: ${currentHash}, reusing stateId: ${previousStates[currentHash]}`);
                
                // Just update the last hash but don't create a new state
                lastDomHash = currentHash;
                currentStateId = previousStates[currentHash];
                processingMutations = false;
                return;
            }
            
            // Check for pending state sends with the same hash to prevent duplicates
            if (pendingStateSends[currentHash]) {
                console.log(`[DOM Tracker] *** DUPLICATE SEND PREVENTED *** Already sending state with hash: ${currentHash}`);
                processingMutations = false;
                return;
            }
            
            // This is a genuinely new state we haven't seen before
            const { state, isNewState } = createDomState();
            state.hash = currentHash; // Ensure hash is consistent
            
            // Add information about what changed
            state.mutationInfo = {
                count: significantMutations.length,
                types: [...new Set(significantMutations.map(m => m.type))],
                timestamp: now
            };
            
            // Mark this hash as pending to prevent duplicate sends
            pendingStateSends[currentHash] = true;
            
            // Wait for the lock to be released if there's a pending state creation
            // This helps prevent race conditions where multiple states are created at once
            sendToBackground('recordState', {
                state: state
            })
            .then(response => {
                console.log(`[DOM Tracker] Background response for recordState:`, response);
                
                if (response && response.isDuplicate) {
                    console.log(`[DOM Tracker] *** DUPLICATE DETECTED BY BACKGROUND *** Hash ${currentHash} already exists as ${response.stateId}`);
                    previousStates[currentHash] = response.stateId;
                    currentStateId = response.stateId;
                } 
                else if (response && response.stateId) {
                    // Update our map with the real stateId from the server
                    previousStates[currentHash] = response.stateId;
                    currentStateId = response.stateId;
                    console.log(`[DOM Tracker] Added to previousStates: ${currentHash} -> ${response.stateId}`);
                } else {
                    console.warn('[DOM Tracker] Did not receive valid stateId from background script');
                }
                
                // Only update lastDomHash to the current hash after we've processed the state
                lastDomHash = currentHash;
            })
            .catch(error => {
                console.error('[DOM Tracker] Error getting stateId from background:', error);
            })
            .finally(() => {
                // Clear the pending flag with a minimum possible delay
                setTimeout(() => {
                    delete pendingStateSends[currentHash];
                }, 1); // minimum practical value (browsers treat <1ms as 1ms minimum)
            });
            
            console.log(`[DOM Tracker] Created state due to DOM change with hash: ${currentHash}`);
        } else {
            console.log('[DOM Tracker] DOM changed but hash remains the same, no new state needed');
        }
    } catch (error) {
        console.error('[DOM Tracker] Error processing mutations:', error);
    } finally {
        // Clear debounce flag
        processingMutations = false;
    }
}

// Set up DOM mutation observer to detect changes
function setupMutationObserver() {
    if (mutationObserver) {
        mutationObserver.disconnect();
    }
    
    // Configuration for the observer (observe everything with higher sensitivity)
    const config = {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
        attributeOldValue: true,  // Capture old attribute values
        characterDataOldValue: true  // Capture old text values
    };
    
    // Create an observer instance with immediate processing
    mutationObserver = new MutationObserver(mutations => {
        if (!isRecording) return;
        
        if (mutations.length > 0) {
            console.log(`[DOM Tracker] DOM changed: ${mutations.length} mutations detected`);
            
            // Start processing immediately
            processMutations(mutations);
        }
    });
    
    // Start observing the entire document with the configured parameters
    mutationObserver.observe(document.documentElement, config);
    
    console.log('[DOM Tracker] Mutation observer set up with enhanced sensitivity');
    
    return mutationObserver;
}

// Set up reload detection
function setupReloadDetection() {
    // Add a session storage flag to detect reloads
    if (sessionStorage.getItem('pageLoadCount')) {
        // If pageLoadCount exists, this is a reload or back/forward navigation
        const count = parseInt(sessionStorage.getItem('pageLoadCount') || '0');
        sessionStorage.setItem('pageLoadCount', (count + 1).toString());
        sessionStorage.setItem('isReload', 'true');
        console.log('[DOM Tracker] Page reload detected (load count: ' + (count + 1) + ')');
            } else {
        // First time loading this page
        sessionStorage.setItem('pageLoadCount', '1');
        sessionStorage.setItem('isReload', 'false');
        console.log('[DOM Tracker] First page load detected');
    }
    
    // Clear reload flag on unload to help detect back/forward navigation
    window.addEventListener('beforeunload', () => {
        sessionStorage.setItem('lastPageUrl', window.location.href);
    });
}

// Track URL/page changes
function setupNavigationTracking() {
    // Listen for URL changes
    window.addEventListener('popstate', () => {
        console.log('[DOM Tracker] Navigation detected (popstate)');
        handleNavigation();
    });
    
    // For single-page apps and other navigation methods
    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        console.log('[DOM Tracker] Navigation detected (pushState)');
        handleNavigation();
    };
    
    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        console.log('[DOM Tracker] Navigation detected (replaceState)');
        handleNavigation();
    };
}

// Handle navigation events
function handleNavigation() {
    if (!isRecording) return;
    
    const url = window.location.href;
    console.log(`[DOM Tracker] Page changed to: ${url}`);
    
    // Reset hash for this new page load
    lastDomHash = null;
    
    // Start loading detection
    startLoadingDetection();
    
    // Set loading state
    isPageLoading = true;
    loadingStartTime = Date.now();
    
    console.log('[DOM Tracker] Page is now in loading state');
    
    // Create a new state for the new page after a delay to allow loading to complete
    setTimeout(() => {
        try {
            // Calculate hash once and reuse it
            const currentHash = calculateDomHash();
            console.log(`[DOM Tracker] Navigation state hash: ${currentHash}`);
            
            const { state, isNewState } = createDomState();
            state.hash = currentHash; // Ensure hash is consistent
            state.isNavigation = true; // Mark this as a navigation event
            
            // This is critical - send the isNavigation flag at the top level of the message
            sendToBackground('recordState', {
                state: state,
                isNavigation: true
            })
            .then(response => {
                console.log(`[DOM Tracker] Background response for navigation state:`, response);
                
                if (response && response.stateId) {
                    // Update our map with the real stateId from the server
                    previousStates[currentHash] = response.stateId;
                    currentStateId = response.stateId;
                    console.log(`[DOM Tracker] Added navigation state to previousStates: ${currentHash} -> ${response.stateId}`);
                    
                    // Always update lastDomHash to the current hash
                    lastDomHash = currentHash;
                } else {
                    console.warn('[DOM Tracker] Did not receive valid stateId from background script for navigation');
                }
            })
            .catch(error => {
                console.error('[DOM Tracker] Error getting stateId for navigation state:', error);
            });
            
            console.log(`[DOM Tracker] Created state after navigation with hash: ${currentHash}`);
        } catch (error) {
            console.error('[DOM Tracker] Error handling navigation state:', error);
        }
    }, 500); // Short delay to allow page to settle
}

// Set up form element change detection
function setupFormChangeDetection() {
    console.log('[DOM Tracker] Setting up form element change detection');
    
    // Capture all form element interactions
    document.addEventListener('change', (event) => {
        if (!isRecording) return;
        
        const target = event.target;
        
        // Check if this is a form element
        if (target.tagName === 'INPUT' || 
            target.tagName === 'SELECT' || 
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'CHECKBOX' ||
            target.tagName === 'RADIO') {
            
            console.log(`[DOM Tracker] Form element changed: ${target.tagName}#${target.id || ''}.${target.className || ''} type=${target.type || 'unknown'}`);
            
            // Artificially trigger DOM state capture after a short delay
            // This ensures form changes are captured even if they don't trigger mutations
            setTimeout(() => {
                forceCaptureState('form-interaction', target);
            }, 50);
        }
    }, true);
    
    // Also capture click events on buttons and checkable elements
    document.addEventListener('click', (event) => {
        if (!isRecording) return;
        
        const target = event.target;
        const isInteractive = 
            target.tagName === 'BUTTON' ||
            target.tagName === 'A' ||
            (target.tagName === 'INPUT' && (target.type === 'checkbox' || target.type === 'radio')) ||
            target.role === 'button' ||
            target.getAttribute('role') === 'button';
            
        if (isInteractive) {
            console.log(`[DOM Tracker] Interactive element clicked: ${target.tagName}#${target.id || ''}.${target.className || ''} type=${target.type || 'unknown'}`);
            
            // Add a short delay to allow any DOM changes to complete before capturing
            setTimeout(() => {
                forceCaptureState('interactive-click', target);
            }, 50);
        }
    }, true);
}

// Force a state capture for user interactions
function forceCaptureState(trigger, element) {
    try {
        console.log(`[DOM Tracker] Force capturing state for: ${trigger} on element:`, element);
        
        // Calculate current hash
        const currentHash = calculateDomHash();
        
        console.log(`[DOM Tracker] Interaction hash: ${currentHash}, Last hash: ${lastDomHash}`);
        
        // Check for pending state sends with the same hash to prevent duplicates
        if (pendingStateSends[currentHash]) {
            console.log(`[DOM Tracker] *** DUPLICATE INTERACTION SEND PREVENTED *** Already sending state with hash: ${currentHash}`);
            return;
        }
        
        // Create a state object regardless of whether it's a duplicate or not
        const { state, isNewState } = createDomState();
        state.hash = currentHash;
        
        // Add information about the interaction
        state.interactionInfo = {
            trigger: trigger,
            elementType: element.tagName.toLowerCase(),
            elementId: element.id || '',
            elementClass: element.className || '',
            elementType: element.type || '',
            timestamp: Date.now()
        };
        
        // If we've seen this hash before, mark it appropriately
        if (previousStates[currentHash]) {
            console.log(`[DOM Tracker] *** DUPLICATE STATE DETECTED *** for interaction, reusing stateId: ${previousStates[currentHash]}`);
            
            // Mark this as a duplicate so the background script knows to reuse the ID
            state.isDuplicate = true;
            state.originalStateId = previousStates[currentHash];
        }
        
        // Mark this hash as pending to prevent duplicate sends
        pendingStateSends[currentHash] = true;
        
        // Always send to background - let it handle whether to create a new record with isNewState=false
        sendToBackground('recordState', {
            state: state,
            isInteraction: true,  // Mark this as coming from a user interaction
            isDuplicate: previousStates[currentHash] ? true : false,
            reusedStateId: previousStates[currentHash] || null
        })
        .then(response => {
            console.log(`[DOM Tracker] Background response for interaction state:`, response);
            
            if (response && response.stateId) {
                // Always update the map and current state ID
                previousStates[currentHash] = response.stateId;
                currentStateId = response.stateId;
                
                if (response.isDuplicate) {
                    console.log(`[DOM Tracker] Recorded duplicate interaction with existing stateId: ${response.stateId}`);
                } else {
                    console.log(`[DOM Tracker] Added new interaction state: ${currentHash} -> ${response.stateId}`);
                }
            } else {
                console.warn('[DOM Tracker] Did not receive valid stateId from background script');
            }
            
            // Always update the last hash
            lastDomHash = currentHash;
        })
        .catch(error => {
            console.error('[DOM Tracker] Error getting stateId for interaction state:', error);
        })
        .finally(() => {
            // Clear the pending flag with a minimum possible delay
            setTimeout(() => {
                delete pendingStateSends[currentHash];
            }, 1); // minimum practical value (browsers treat <1ms as 1ms minimum)
        });
        
        console.log(`[DOM Tracker] Processed interaction state with hash: ${currentHash}`);
    } catch (error) {
        console.error('[DOM Tracker] Error forcing state capture:', error);
    }
}

// Start recording
function startRecording(newSessionId, newUserId) {
    if (isRecording) return;
    
    sessionId = newSessionId;
    userId = newUserId;
    
    // Reset state tracking
    previousStates = {};
    lastDomHash = null;
    
    // Set up DOM tracking
    setupMutationObserver();
    setupNavigationTracking();
    setupFormChangeDetection(); // Add form change detection
    
    // Start loading detection
    startLoadingDetection();
    
    // Create initial state
    const currentHash = calculateDomHash();
    const { state, isNewState } = createDomState();
    state.hash = currentHash; // Ensure consistent hash
    state.isNewState = true; // Always mark as new state
    
    // Send initial state and get the real stateId back
    sendToBackground('recordState', {
        state: state,
        isInitial: true
    })
    .then(response => {
        console.log(`[DOM Tracker] Background response for initial state:`, response);
        
        if (response && response.isDuplicate) {
            console.log(`[DOM Tracker] *** DUPLICATE INITIAL STATE DETECTED *** Hash ${currentHash} already exists as ${response.stateId}`);
            previousStates[currentHash] = response.stateId;
        }
        else if (response && response.stateId) {
            // Update our map with the real stateId from the server
            previousStates[currentHash] = response.stateId;
            currentStateId = response.stateId;
            console.log(`[DOM Tracker] Updated initial state tracking with server-assigned ID: ${response.stateId}`);
        } else {
            console.warn('[DOM Tracker] Did not receive valid stateId from background script');
        }
        
        // Always update lastDomHash to the current hash
        lastDomHash = currentHash;
    })
    .catch(error => {
        console.error('[DOM Tracker] Error capturing initial state ID:', error);
    });
    
    console.log(`[DOM Tracker] Started recording with session ${sessionId}`);
    console.log(`[DOM Tracker] Initial state created with hash: ${currentHash}`);
    
    isRecording = true;
}

// Stop recording
function stopRecording() {
        if (!isRecording) return;
        
    // Stop the mutation observer
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }
    
    isRecording = false;
    console.log(`[DOM Tracker] Stopped recording session ${sessionId}`);
}

// Initialize when the content script loads
function initialize() {
    console.log('[DOM Tracker] Content script initializing...');
    
    // Set up reload detection
    setupReloadDetection();
    
    // Check if we should already be recording
    chrome.runtime.sendMessage({ action: 'getStatus' }, response => {
        console.log('[DOM Tracker] Got status from background:', response);
        
        if (response && response.recordingStatus === 'recording') {
            console.log('[DOM Tracker] Auto-starting recording based on existing session');
            startRecording(response.currentSessionId, response.userId);
        }
    });
    
    // Create initial state when page is fully loaded
    window.addEventListener('load', () => {
        console.log('[DOM Tracker] Page fully loaded');
    if (isRecording) {
            // Calculate hash once and reuse it
            const currentHash = calculateDomHash();
            console.log(`[DOM Tracker] Page load state hash: ${currentHash}`);
            
            // Check if this is a reload
            const isReload = sessionStorage.getItem('isReload') === 'true';
            
            // Capture initial page state
            const { state, isNewState } = createDomState();
            state.hash = currentHash; // Ensure hash is consistent
            
            // Mark the state based on the load type
            if (isReload) {
                state.isReload = true;
                console.log('[DOM Tracker] Setting isReload flag for state');
            } else {
                state.isInitial = true;
                console.log('[DOM Tracker] Setting isInitial flag for state');
            }
            
            // IMPORTANT: Pass the flags at the top level of the message
            sendToBackground('recordState', {
                state: state,
                isInitial: !isReload,
                isReload: isReload
            })
            .then(response => {
                console.log(`[DOM Tracker] Background response for page load state:`, response);
                
                if (response && response.stateId) {
                    // Update our map with the real stateId from the server
                    previousStates[currentHash] = response.stateId;
                    currentStateId = response.stateId;
                    console.log(`[DOM Tracker] Updated page load state tracking with server-assigned ID: ${response.stateId}`);
                    
                    // Always update lastDomHash to the current hash
                    lastDomHash = currentHash;
                    
                    // Reset the reload flag now that we've handled it
                    if (isReload) {
                        sessionStorage.setItem('isReload', 'false');
                    }
                }
            })
            .catch(error => {
                console.error('[DOM Tracker] Error getting stateId for page load state:', error);
            });
            
            const loadType = isReload ? "RELOAD" : "INITIAL LOAD";
            console.log(`[DOM Tracker] Page ${loadType} state created with hash: ${currentHash}`);
        }
    });
}

// Start the content script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
    } else {
    // Page already loaded
    initialize();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[DOM Tracker] Received message from background:', message);
    
    try {
        if (message.action === 'startRecording') {
            startRecording(message.sessionId, message.userId);
            sendResponse({ success: true });
            return true;
        } 
        
        if (message.action === 'stopRecording') {
            stopRecording();
            sendResponse({ success: true });
            return true;
        } 
        
        if (message.action === 'getStatus') {
            sendResponse({
                isRecording,
                sessionId,
                currentStateId
            });
            return true;
        }
        
        // Default response
        sendResponse({ success: false, error: 'Unknown action' });
    } catch (error) {
        console.error('[DOM Tracker] Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }
    
    return true;
}); 