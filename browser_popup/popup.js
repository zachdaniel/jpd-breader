import { browser, nonNull } from '../util.js';
import { jsxCreateElement } from '../jsx.js';
import { loadConfig } from '../background/config.js';
let config;
async function initConfig() {
    config = await loadConfig();
}
initConfig();
async function parsePage(tab) {
    // Parse the page
    await browser.tabs.insertCSS(tab.id, { file: '/content/word.css', cssOrigin: 'author' });
    if (config.customWordCSS) await browser.tabs.insertCSS(tab.id, { code: config.customWordCSS, cssOrigin: 'author' });
    browser.tabs.executeScript(tab.id, { file: '/integrations/parse_selection.js' });
    // Close the popup
    setTimeout(() => window.close(), 10);
}
nonNull(document.querySelector('#settings-link')).addEventListener('click', () => {
    setTimeout(() => window.close(), 10);
});
browser.tabs.query({ active: true }, tabs => {
    const buttonContainer = nonNull(document.querySelector('article'));
    for (const tab of tabs) {
        buttonContainer.append(
            jsxCreateElement('button', { onclick: () => parsePage(tab) }, `Parse "${tab.title ?? 'Untitled'}"`),
        );
    }
});
