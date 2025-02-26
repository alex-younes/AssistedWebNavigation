(function() {
    // Create a message channel for communication
    const channel = new BroadcastChannel('interaction-recorder');
    
    function sendInteraction(interaction) {
        channel.postMessage({
            type: 'RECORDED_INTERACTION',
            interaction: interaction
        });
    }
    
    function recordInteraction(event) {
        const element = event.target;
        
        function getXPath(element) {
            if (!element) return '';
            if (element.id) return `//*[@id="${element.id}"]`;
            
            const parts = [];
            while (element && element.nodeType === 1) {
                let index = 1;
                let sibling = element.previousSibling;
                
                while (sibling) {
                    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                        index++;
                    }
                    sibling = sibling.previousSibling;
                }
                
                const tagName = element.tagName.toLowerCase();
                parts.unshift(`${tagName}[${index}]`);
                element = element.parentNode;
            }
            
            return '/' + parts.join('/');
        }

        const interaction = {
            type: event.type,
            element: {
                tagName: element.tagName.toLowerCase(),
                id: element.id,
                className: element.className,
                text: element.textContent?.trim(),
                value: element.value,
                href: element.href,
                xpath: getXPath(element)
            },
            timestamp: new Date().toISOString()
        };

        sendInteraction(interaction);
        console.log('Interaction recorded:', interaction);
    }

    // Add event listeners
    document.addEventListener('click', recordInteraction, true);
    document.addEventListener('input', recordInteraction, true);
    document.addEventListener('keydown', recordInteraction, true);
    document.addEventListener('submit', recordInteraction, true);

    // Notify that recorder is initialized
    sendInteraction({ type: 'RECORDER_INITIALIZED' });
    console.log('Interaction recorder initialized');
})(); 