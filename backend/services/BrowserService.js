const { chromium } = require('playwright');
const debug = require('../utils/debug');
const { BROWSER_CONFIG } = require('../config/constants');
const { JSDOM } = require('jsdom');
const db = require('../database'); // Assume you have a database module

class BrowserService {
    constructor() {
        if (BrowserService.instance) {
            return BrowserService.instance;
        }
        BrowserService.instance = this;
        
        this.browser = null;
        this.page = null;
        this.isRecording = false;
        this.isInitialized = false;
        this.recordingStartTime = null;
        this.interactions = [];
        this.totalInteractionCount = 0;
        this.reinitTimeout = null;
        this.navigationPromise = null;
    }

    async launchBrowser() {
        debug('Launching new browser...');
        this.browser = await chromium.launch({
            headless: false,
            args: ['--start-maximized']
        });
        
        const context = await this.browser.newContext(BROWSER_CONFIG);
        this.page = await context.newPage();

        // Setup navigation handling
        this.page.on('framenavigated', async () => {
            console.log('[Backend][Page] Navigation detected');
            this.isInitialized = false;
            if (this.isRecording) {
                await this.safeInitializeRecorder();
            }
        });

        return true;
    }

    async navigateToUrl(url) {
        if (!this.page) throw new Error('Browser not initialized');
        debug(`Navigating to ${url}...`);
        await this.page.goto(url, { waitUntil: 'networkidle' });
    }

    async safeEvaluate(fn, retries = 3) {
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                // Wait for any navigation to complete
                await this.page.waitForLoadState('domcontentloaded');
                return await this.page.evaluate(fn);
            } catch (error) {
                console.log(`Attempt ${i + 1} failed:`, error);
                lastError = error;
                if (!error.message.includes('Execution context was destroyed')) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        throw lastError;
    }

    async captureDom() {
        if (!this.page) throw new Error('No active browser session');
        debug('Capturing DOM state...');
        
        try {
            await this.page.waitForLoadState('domcontentloaded');
            
            const domTree = await this.safeEvaluate(() => {
                function extractDOMInfo(element) {
                    try {
                        if (!element) return null;

                        const nodeInfo = {
                            tagName: element.tagName?.toLowerCase() || 'unknown',
                            className: element.className && typeof element.className === 'string' ? 
                                element.className.trim() : undefined
                        };

                        const getDirectTextContent = (el) => {
                            return Array.from(el.childNodes)
                                .filter(node => node.nodeType === 3)
                                .map(node => node.textContent.trim())
                                .filter(text => text.length > 0)
                                .join(' ');
                        };

                        const directText = getDirectTextContent(element);
                        if (directText) {
                            nodeInfo.contentDescription = directText;
                        }

                        const children = Array.from(element.children || [])
                            .filter(child => {
                                return child.nodeType === 1 && 
                                       !['script', 'style', 'meta'].includes(child.tagName.toLowerCase());
                            })
                            .map(child => extractDOMInfo(child))
                            .filter(child => child !== null);

                        if (children.length > 0) {
                            nodeInfo.children = children;
                        }

                        return nodeInfo;
                    } catch (e) {
                        console.error('Error in extractDOMInfo:', e);
                        return null;
                    }
                }
                
                return extractDOMInfo(document.documentElement);
            });

            debug('DOM capture successful');
            return domTree;
        } catch (error) {
            debug('Error capturing DOM:', error);
            throw error;
        }
    }

    async safeInitializeRecorder() {
        if (this.reinitTimeout) {
            clearTimeout(this.reinitTimeout);
        }
        
        this.reinitTimeout = setTimeout(async () => {
            if (!this.isInitialized && this.isRecording) {
                try {
                    await this._initializeRecorder();
                } catch (error) {
                    console.error('Failed to initialize recorder:', error);
                    // Schedule another attempt if needed
                    if (this.isRecording) {
                        await this.safeInitializeRecorder();
                    }
                }
            }
            this.reinitTimeout = null;
        }, 1000);
    }

    async startRecording() {
        console.log('[Backend][Recorder] Starting recording...');
        if (!this.page) throw new Error('No page available');
        
        this.recordingStartTime = new Date();
        this.isRecording = true;
        this.interactions = [];
        this.totalInteractionCount = 0;
        this.isInitialized = false;
        
        await this.safeInitializeRecorder();
        
        console.log('[Backend][Recorder] Recording started successfully');
        return {
            status: 'Recording started',
            startTime: this.recordingStartTime
        };
    }

    async stopRecording() {
        this.isRecording = false;
        if (this.reinitTimeout) {
            clearTimeout(this.reinitTimeout);
            this.reinitTimeout = null;
        }
        
        const response = {
            status: 'Recording stopped',
            totalInteractions: this.totalInteractionCount,
            interactions: this.interactions
        };
        
        this.interactions = [];
        this.totalInteractionCount = 0;
        this.recordingStartTime = null;
        
        try {
            await this.safeEvaluate(() => {
                if (window._interactionHandler) {
                    document.removeEventListener('click', window._interactionHandler, true);
                    document.removeEventListener('submit', window._interactionHandler, true);
                    delete window._interactionHandler;
                }
            });
        } catch (error) {
            console.error('Error cleaning up event listeners:', error);
        }
        
        return response;
    }

    saveInteraction(interaction) {
        if (!this.isRecording) throw new Error('Recording not started');
        this.interactions.push(interaction);
        this.totalInteractionCount++;
        return { status: 'success' };
    }

    getInteractions() {
        const interactions = [...this.interactions];
        this.interactions = [];
        return {
            interactions,
            startTime: this.recordingStartTime ? this.recordingStartTime.toISOString() : null,
            currentTime: new Date().toISOString()
        };
    }

    async _initializeRecorder() {
        if (!this.page || !this.isRecording) return;
        if (this.isInitialized) return;
        
        console.log('[Backend][Recorder] Starting initialization');
        
        try {
            // Wait for page to be ready
            await this.page.waitForLoadState('domcontentloaded');
            
            // Setup recorder
            await this.safeEvaluate(() => {
                console.log('Browser: Starting recorder setup');
                
                function getXPath(element) {
                    if (!element) return '';
                    if (element.id) return `//*[@id="${element.id}"]`;
                    
                    let path = '';
                    while (element && element.nodeType === 1) {
                        let index = 1;
                        let sibling = element.previousSibling;
                        while (sibling) {
                            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                                index++;
                            }
                            sibling = sibling.previousSibling;
                        }
                        path = `/${element.tagName.toLowerCase()}[${index}]${path}`;
                        element = element.parentNode;
                    }
                    return path;
                }

                if (window._interactionHandler) {
                    document.removeEventListener('click', window._interactionHandler, true);
                    document.removeEventListener('submit', window._interactionHandler, true);
                }

                window._interactionHandler = function(event) {
                    if (event.isTrusted === false) {
                        console.log('Browser: Skipping non-user event');
                        return;
                    }

                    const target = event.target;
                    const details = {
                        tagName: target.tagName.toLowerCase(),
                        id: target.id || '',
                        className: target.className || '',
                        text: target.textContent?.trim() || '',
                        value: target.value || '',
                        href: target.href || '',
                        type: target.type || '',
                        xpath: getXPath(target)
                    };

                    const interaction = {
                        type: event.type,
                        element: details,
                        timestamp: new Date().toISOString()
                    };

                    const isNavigation = 
                        target.tagName === 'A' ||
                        target.closest('a') ||
                        (target.form && event.type === 'submit');

                    try {
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', 'http://localhost:3001/api/saveInteraction', !isNavigation);
                        xhr.setRequestHeader('Content-Type', 'application/json');
                        xhr.send(JSON.stringify({ interaction }));
                    } catch (error) {
                        console.error('Browser: Error sending interaction:', error);
                    }
                };

                document.addEventListener('click', window._interactionHandler, true);
                document.addEventListener('submit', window._interactionHandler, true);
                
                console.log('Browser: Recorder setup complete');
            });

            this.isInitialized = true;
            console.log('[Backend][Recorder] Initialization complete');
            
        } catch (error) {
            console.error('[Backend][Recorder] Initialization failed:', error);
            this.isInitialized = false;
            throw error;
        }
    }

    async closeBrowser() {
        if (this.browser) {
            if (this.reinitTimeout) {
                clearTimeout(this.reinitTimeout);
                this.reinitTimeout = null;
            }
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.isInitialized = false;
        }
    }

    /**
     * Analyze DOM content without launching a browser
     * @param {string} url Original URL of the page
     * @param {string} domContent HTML content of the page
     * @param {object} metadata Additional metadata about the capture
     */
    static async analyzeDOMContent(url, domContent, metadata = {}) {
        try {
            // Create a virtual DOM using the provided HTML content
            const dom = new JSDOM(domContent, {
                url: url,
                contentType: "text/html",
                includeNodeLocations: true,
                storageQuota: 10000000
            });
            
            // You can now use the DOM for analysis
            const document = dom.window.document;
            
            // Extract useful information
            const title = document.title;
            const links = Array.from(document.querySelectorAll('a')).map(a => ({
                text: a.textContent,
                href: a.href
            }));
            const forms = Array.from(document.querySelectorAll('form')).length;
            const images = Array.from(document.querySelectorAll('img')).length;
            
            // Store the interaction in your database
            const interaction = {
                url,
                title,
                timestamp: metadata.timestamp || new Date().toISOString(),
                stats: {
                    links: links.length,
                    forms,
                    images
                },
                metadata
            };
            
            await this.saveInteraction(interaction);
            
            return {
                interaction,
                elements: {
                    links,
                    forms,
                    images
                }
            };
        } catch (error) {
            console.error('Error analyzing DOM:', error);
            throw error;
        }
    }
    
    /**
     * Save interaction to database
     */
    static async saveInteraction(interaction) {
        // Implement database storage logic
        // This is a placeholder - replace with your actual database implementation
        if (!global.interactions) {
            global.interactions = [];
        }
        global.interactions.push(interaction);
        return interaction;
    }
    
    /**
     * Get all stored interactions
     */
    static async getInteractions() {
        // Implement database retrieval logic
        // This is a placeholder - replace with your actual database implementation
        return global.interactions || [];
    }

    // New method to analyze DOM content received from the extension
    async analyzeDOMContent(url, domContent, metadata = {}) {
        console.log('[Backend][BrowserService] Analyzing DOM content from extension');
        
        try {
            // Create a JSDOM instance from the HTML content
            const dom = new JSDOM(domContent.html);
            const document = dom.window.document;
            
            // Extract the DOM tree using a similar approach to captureDom
            const extractDOMInfo = (element) => {
                if (!element) return null;

                const nodeInfo = {
                    tagName: element.tagName?.toLowerCase() || 'unknown',
                    className: element.className && typeof element.className === 'string' ? 
                        element.className.trim() : undefined
                };

                // Get direct text content
                const textNodes = Array.from(element.childNodes)
                    .filter(node => node.nodeType === 3) // Text nodes
                    .map(node => node.textContent.trim())
                    .filter(text => text.length > 0)
                    .join(' ');
                
                if (textNodes.length > 0) {
                    nodeInfo.contentDescription = textNodes;
                }

                // Extract children
                const children = Array.from(element.children || [])
                    .filter(child => {
                        return child.nodeType === 1 && 
                                !['script', 'style', 'meta'].includes(child.tagName.toLowerCase());
                    })
                    .map(child => extractDOMInfo(child))
                    .filter(child => child !== null);

                if (children.length > 0) {
                    nodeInfo.children = children;
                }

                return nodeInfo;
            };
            
            // Extract DOM tree
            const domTree = extractDOMInfo(document.documentElement);
            
            // Create a session ID for this analysis
            const sessionId = `ext-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
            
            // Return analysis results
            return {
                sessionId,
                url,
                title: document.title || 'Unknown',
                timestamp: new Date().toISOString(),
                domTree,
                metadata: {
                    ...metadata,
                    source: 'extension',
                    analyzed: true
                }
            };
        } catch (error) {
            console.error('[Backend][BrowserService] Error analyzing DOM content:', error);
            throw new Error(`Failed to analyze DOM content: ${error.message}`);
        }
    }
}

// Create and export a singleton instance
const browserService = new BrowserService();
module.exports = browserService;