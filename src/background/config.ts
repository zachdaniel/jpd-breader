import { DeckId } from '../types.js';

export type Keybind = { key: string; code: string; modifiers: string[] } | null;
// Common types shared across both content and background scripts

export const CURRENT_SCHEMA_VERSION = 1;

export type Config = {
    schemaVersion: number;

    apiToken: string | null;

    miningDeckId: DeckId | null;
    forqDeckId: DeckId | null;
    blacklistDeckId: DeckId | null;
    neverForgetDeckId: DeckId | null;

    contextWidth: number;
    forqOnMine: boolean;

    customWordCSS: string;
    customPopupCSS: string;

    showPopupOnHover: boolean;
    touchscreenSupport: boolean;
    disableFadeAnimation: boolean;

    showPopupKey: Keybind;
    addKey: Keybind;
    dialogKey: Keybind;
    blacklistKey: Keybind;
    neverForgetKey: Keybind;
    nothingKey: Keybind;
    somethingKey: Keybind;
    hardKey: Keybind;
    goodKey: Keybind;
    easyKey: Keybind;
};

export const defaultConfig: Config = {
    schemaVersion: CURRENT_SCHEMA_VERSION,

    apiToken: null,

    miningDeckId: null,
    forqDeckId: 'forq',
    blacklistDeckId: 'blacklist',
    neverForgetDeckId: 'never-forget',
    contextWidth: 1,
    forqOnMine: true,

    customWordCSS: '',
    customPopupCSS: '',

    showPopupOnHover: false,
    touchscreenSupport: false,
    disableFadeAnimation: false,

    showPopupKey: { key: 'Shift', code: 'ShiftLeft', modifiers: [] },
    addKey: null,
    dialogKey: null,
    blacklistKey: null,
    neverForgetKey: null,
    nothingKey: null,
    somethingKey: null,
    hardKey: null,
    goodKey: null,
    easyKey: null,
};

export function migrateSchema(config: Config) {
    if (config.schemaVersion === 0) {
        // Keybinds changed from string to object
        // We don't have all the information required to turn them into objects
        // Just delete them and let users re-enter them
        for (const key of [
            'showPopupKey',
            'blacklistKey',
            'neverForgetKey',
            'nothingKey',
            'somethingKey',
            'hardKey',
            'goodKey',
            'easyKey',
        ] as const) {
            config[key] = defaultConfig[key];
        }

        config.schemaVersion = 1;
    }
}

export async function loadConfig(): Promise<Config> {
    let config = defaultConfig;

    for (const [key, _value] of Object.entries(config)) {
        const configKey = 'jpdb-config-' + key;
        if (Object.hasOwn(localStorage, configKey)) {
            const value = await crossBrowserStorageGet(configKey);
            (config as any)[key] = value;
        }
    }

    console.log(config);

    config.schemaVersion = config.schemaVersion || 0;
    migrateSchema(config);

    // If the schema version is not the current version after applying all migrations, use the default config.
    if (config.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        config = defaultConfig;
    }

    console.log(config);
    return config;
}

export function crossBrowserStorageGet<T = any>(key: string): Promise<T | undefined> {
    if (typeof chrome !== 'undefined' && (chrome as any).storage && (chrome as any).storage.local) {
        // Chrome
        return new Promise<T>(resolve => {
            ((chrome as any).storage.local as any).get(key, (result: { [key: string]: any }) => {
                resolve(result[key] as T);
            });
        });
    } else if (typeof browser !== 'undefined' && (browser as any).storage && (browser as any).storage.local) {
        // Firefox
        return (browser as any).storage.local.get(key).then((result: { [key: string]: T }) => result[key]);
    } else {
        // Safari
        const value = localStorage.getItem(key);
        return Promise.resolve(value ? (JSON.parse(value) as T) : undefined);
    }
}

export async function saveConfig(config: Config): Promise<void> {
    console.log(config);
    for (const [key, value] of Object.entries(config)) {
        crossBrowserStorageSet('jpdb-config-' + key, value);
    }
}

function crossBrowserStorageSet(key: any, value: any) {
    if (typeof chrome !== 'undefined' && (chrome as any).storage && (chrome as any).storage.local) {
        // Chrome
        return new Promise(resolve => {
            (chrome as any).storage.local.set({ [key]: value }, resolve);
        });
    } else if (typeof browser !== 'undefined' && (browser as any).storage && (browser as any).storage.local) {
        // Firefox
        return (browser as any).storage.local.set({ [key]: value });
    } else {
        // Safari
        localStorage.setItem(key, JSON.stringify(value));
        return Promise.resolve();
    }
}
