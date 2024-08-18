(async () => {
    'use strict';
    const $browser = globalThis.browser ?? globalThis.chrome,
        $import = path => import($browser.runtime.getURL(path));
    const { showError } = await import('/content/toast.js');
    const { addedObserver, parseVisibleObserver } = await import('/integrations/common.js');
    function shouldParse(node) {
        if (node instanceof HTMLElement) {
            return !node.matches(`[data-ttu-spoiler-img]`);
        } else {
            return true;
        }
    }
    try {
        const visible = parseVisibleObserver(shouldParse);
        const added = addedObserver('.book-content p, .book-content div.calibre1', elements => {
            for (const element of elements) {
                visible.observe(element);
            }
        });
        added.observe(document.body, {
            subtree: true,
            childList: true,
        });
    } catch (error) {
        showError(error);
    }
})();
