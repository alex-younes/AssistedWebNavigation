export const truncateText = (text, maxLength) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
};

export const getNodeLabel = (node) => {
    const parts = [];
    parts.push(node.tagName);
    
    // Only add class if it exists and is meaningful
    if (node.className && !node.className.includes('container')) {
        parts.push(`.${node.className}`);
    }
    
    // Handle links differently - just show their text content
    if (node.tagName === 'a' && node.contentDescription) {
        return `${node.tagName} - ${node.contentDescription}`;
    }
    
    // For other elements, only add content if it's not redundant
    if (node.contentDescription && 
        !node.contentDescription.includes(node.tagName) &&
        !node.contentDescription.includes(node.className)) {
        parts.push(`- ${truncateText(node.contentDescription, 30)}`);
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