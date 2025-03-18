export const truncateText = (text, maxLength) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
};

export const getNodeLabel = (node) => {
    if (!node) return '';
    
    const parts = [];
    
    // Handle tag name - always add it
    parts.push(node.tagName);
    
    // Add ID if it exists and is meaningful
    if (node.id && node.id.length < 20) {
        parts.push(`#${node.id}`);
    }
    
    // Only add class if it exists, is meaningful, and not too long
    if (node.className && 
        !node.className.includes('container') && 
        !node.className.includes('wrapper') &&
        node.className.length < 25) {
        parts.push(`.${node.className.split(' ')[0]}`); // Only use first class to avoid clutter
    }
    
    // Special handling for specific elements
    if (node.tagName === 'a' && node.contentDescription) {
        // For links, show a shortened version of the link text
        const linkText = truncateText(node.contentDescription, 20);
        return `${node.tagName} - "${linkText}"`;
    }
    
    if (node.tagName === 'button' && node.contentDescription) {
        // For buttons, show the button text
        const buttonText = truncateText(node.contentDescription, 15);
        return `${node.tagName} - "${buttonText}"`;
    }
    
    if (node.tagName === 'img' && node.alt) {
        // For images, show alt text if available
        return `${node.tagName} - ${node.alt}`;
    }
    
    if (node.tagName === 'input') {
        // For inputs, show type and placeholder if available
        const inputInfo = node.type ? `type="${node.type}"` : '';
        return `${node.tagName} ${inputInfo}`;
    }
    
    if (node.tagName === '#text' && node.contentDescription) {
        // For text nodes, just show the text content
        return `"${truncateText(node.contentDescription, 25)}"`;
    }
    
    // For other elements with short meaningful text content
    if (node.contentDescription && 
        node.contentDescription.length < 30 &&
        node.contentDescription.trim() &&
        !/^\s*[\r\n]+\s*$/.test(node.contentDescription) && // Skip just whitespace/newlines
        !node.contentDescription.includes(node.tagName) &&
        !node.contentDescription.includes(node.className)) {
        
        // If text is short enough and meaningful, add it
        parts.push(`"${truncateText(node.contentDescription, 25)}"`);
    }
    
    return parts.join(' ');
};

export const getCustomNodeProps = () => ({
    nodeSvgShape: {
        shape: 'circle',
        shapeProps: {
            r: 6,
            fill: '#555'
        }
    },
    textProps: {
        x: 10,
        dy: ".31em",
        textAnchor: "start",
        style: {
            fontSize: "11px",
            fontFamily: "Arial, sans-serif",
            fontWeight: "300",
            letterSpacing: "0.5px",
            fill: "#333",
            paintOrder: "stroke",
            stroke: "white",
            strokeWidth: "0px"
        }
    }
});

export const transformDOMToTree = (domContent) => {
    if (!domContent || !domContent.html) {
        console.log('No HTML content found');
        return null;
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(domContent.html, 'text/html');
        
        // Simple recursive function to build the tree
        function createNode(element) {
            // Skip comments
            if (element.nodeType === 8) {
                return null;
            }
            
            // Skip empty text nodes
            if (element.nodeType === 3 && !element.textContent.trim()) {
                return null;
            }
            
            // Skip script and style tags
            if (element.nodeType === 1 && 
                (element.tagName.toLowerCase() === 'script' || 
                 element.tagName.toLowerCase() === 'style')) {
                return null;
            }
            
            // Basic node structure
            const node = {
                tagName: element.nodeType === 1 ? element.tagName.toLowerCase() : '#text',
                children: []
            };
            
            // Add content description for text nodes
            if (element.nodeType === 3) {
                node.contentDescription = element.textContent.trim();
            } else if (element.textContent) {
                node.contentDescription = element.textContent.trim();
            }
            
            // Handle id attribute
            if (element.nodeType === 1 && element.id) {
                node.id = element.id;
            }
            
            // Safely handle className
            if (element.nodeType === 1 && element.hasAttribute && element.hasAttribute('class')) {
                const classValue = element.getAttribute('class');
                if (classValue && classValue.trim()) {
                    node.className = classValue.trim();
                }
            }
            
            // Handle element-specific attributes
            if (element.nodeType === 1) {
                // For images, capture alt and src
                if (element.tagName.toLowerCase() === 'img') {
                    node.alt = element.getAttribute('alt') || '';
                    // Just store the filename part of the src to avoid long URLs
                    const src = element.getAttribute('src') || '';
                    if (src) {
                        const srcParts = src.split('/');
                        node.src = srcParts[srcParts.length - 1];
                    }
                }
                
                // For inputs, capture type, placeholder, and value
                if (element.tagName.toLowerCase() === 'input') {
                    node.type = element.getAttribute('type') || 'text';
                    node.placeholder = element.getAttribute('placeholder') || '';
                    if (node.type !== 'password') { // Don't include password values
                        node.value = element.getAttribute('value') || '';
                    }
                }
                
                // For links, capture href
                if (element.tagName.toLowerCase() === 'a') {
                    const href = element.getAttribute('href') || '';
                    if (href && !href.startsWith('javascript:')) {
                        node.href = href;
                    }
                }
                
                // For buttons, capture type
                if (element.tagName.toLowerCase() === 'button') {
                    node.buttonType = element.getAttribute('type') || '';
                }
            }
            
            // Set the name property using getNodeLabel
            node.name = getNodeLabel(node);
            
            // Handle children
            if (element.childNodes && element.childNodes.length > 0) {
                // Limit children to a reasonable number to avoid excessive nodes
                const maxChildren = 50;
                let childCount = 0;
                
                for (let i = 0; i < element.childNodes.length && childCount < maxChildren; i++) {
                    const childNode = createNode(element.childNodes[i]);
                    if (childNode) {
                        node.children.push(childNode);
                        childCount++;
                    }
                }
                
                // If we limited the children, add a note
                if (element.childNodes.length > maxChildren) {
                    node.children.push({
                        name: `... ${element.childNodes.length - maxChildren} more children`,
                        tagName: "more",
                        children: []
                    });
                }
            }
            
            return node;
        }
        
        return createNode(doc.documentElement);
    } catch (error) {
        console.error('Error transforming DOM to tree:', error);
        return null;
    }
};
