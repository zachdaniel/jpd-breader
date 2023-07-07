// @reader content-script

import { showError } from '../util.js';
import { addedObserver, parseVisibleObserver } from './common.js';

const MAX_TIME_SUB = 10;

type CaptionTrack = {
    baseUrl: string;
    languageCode: string;
    kind: string;
};

interface Transcription {
    start: number;
    dur: number;
    text: string;
}

interface Transcript {
    content: Array<Transcription>;
    isAsr: boolean;
}

// async function
async function getTranscriptFromURL(url: string): Promise<Transcript | null> {
    const response = await fetch(url);
    const data = await response.text();
    const regex = /({"captionTracks":.*isTranslatable":(true|false)}])/;
    const matches = regex.exec(data);

    if (!matches?.length) throw new Error(`Could not find captions.`);

    const { captionTracks }: { captionTracks: Array<CaptionTrack> } = JSON.parse(`${matches[0]}}`);
    const subSource = captionTracks.find(track => track.languageCode === 'ja');
    if (!subSource) {
        return null;
    }

    console.log(subSource);

    if (subSource.kind === 'asr') {
        // TODO: Handle errors
        const response = await fetch(subSource.baseUrl);
        const data = await response.text();

        const subs = data
            .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', '')
            .replace('</transcript>', '')
            .split('</text>')
            .filter(line => line && line.trim())
            .map(line => {
                const startRegex = /start="([\d.]+)"/;
                const durRegex = /dur="([\d.]+)"/;

                const [, start] = startRegex.exec(line)!;
                const [, dur] = durRegex.exec(line)!;

                const htmlText = line
                    .replace(/<text.+>/, '')
                    .replace(/&amp;/gi, '&')
                    .replace(/<\/?[^>]+(>|$)/g, '');

                return {
                    start: parseFloat(start),
                    dur: parseFloat(dur),
                    text: htmlText,
                };
            });

        console.log('raw', subs);

        // Youtube gives the subtitles in chunks, and to avoid multiple calls to the jpdb api
        // we join the subtitles that are close to each other.
        const transcript = subs.reduce((acc: Transcription[], curr, index, arr) => {
            const next = index < arr.length ? arr[index + 1] : null;
            const prev = index > 0 ? arr[index - 1] : null;

            // first check if the current start is smaller than previous start + duration
            if (prev && curr.start < prev.start + prev.dur) {
                // if so, reduce the duration of the previous one
                prev.dur = curr.start - prev.start;
            }

            if (next && next.start - curr.start + curr.dur < 0.1) {
                curr.text += next.text;
                curr.dur += next.dur;
                // skip the next one
                arr.splice(index + 1, 1);
            }

            // if current duration + next one is less than MAX_TIME_SUB, join into one
            // if (next && curr.dur + next.dur <= MAX_TIME_SUB && curr.start + curr.dur <= next.start) {
            //     curr.text += next.text;
            //     curr.dur += next.dur;
            //     // skip the next one
            //     arr.splice(index + 1, 1);
            // }

            acc.push(curr);
            return acc;
        }, []);

        return {
            content: transcript,
            isAsr: true,
        };
    } else {
        // In case we implement something on non-asr subtitles
        return {
            content: [],
            isAsr: false,
        };
    }
}

class Subs {
    captionsParent: HTMLElement | null;
    jpdbCaptions: HTMLElement | null;

    videoHasJPSubs = false;
    videoID: string | null;
    transcript: Transcript | null;

    isAsr = false;
    isActive = false;

    constructor() {
        this.captionsParent = null;
        this.jpdbCaptions = null;
        this.videoID = null;
        this.transcript = null;
    }

    activate(transcript: Transcript, videoID: string) {
        this.isAsr = transcript.isAsr;
        this.transcript = transcript;
        // this.isActive = true; // Don't activate if transcripts are not asr

        if (!this.isAsr || this.captionsParent || this.jpdbCaptions) {
            return;
        }

        // add small button next to settings
        const settingsButton = document.querySelector('.ytp-settings-button') as HTMLElement;
        const jpdbButton = document.createElement('button');
        jpdbButton.setAttribute('id', 'jpdb-button');
        jpdbButton.setAttribute('class', 'ytp-button');
        jpdbButton.setAttribute('aria-pressed', 'false');
        jpdbButton.setAttribute('aria-label', 'JPDB');
        jpdbButton.setAttribute('title', 'JPDB');

        // change this to attribute
        jpdbButton.setAttribute('data-title-no-tooltip', 'JPDB');
        jpdbButton.setAttribute('aria-label', 'JPDB');
        jpdbButton.setAttribute('title', 'JPDB');

        // adjust style
        // center content (image) inside button
        jpdbButton.innerHTML = `
        <svg version="1.1" width="100%" height="100%" fill-opacity="1" viewBox="-36 72 180 1">
            <path fill="#fff" d="M84.5 10.5v13c1.915.285 3.581-.049 5-1a173.26 173.26 0 0 0 17.5-2c4.206 1.093 5.539 3.76 4 8-1.826 1.574-3.993 2.407-6.5 2.5a152.177 152.177 0 0 1-19 1.5 40.936 40.936 0 0 0 .5 9 62.459 62.459 0 0 1 19.5-1.5c2.667 2.667 2.667 5.333 0 8A3021.482 3021.482 0 0 1 59 53.5c-1.71.06-3.044-.606-4-2-.758-2.27-.591-4.436.5-6.5a68.679 68.679 0 0 1 19-2.5v-8c-7.327.705-14.66.872-22 .5-3.013-4.274-2.013-7.274 3-9a228.001 228.001 0 0 1 19-1.5c-.166-5.011 0-10.011.5-15 3.74-2.94 6.906-2.607 9.5 1z" />
            <path fill="#fff" d="M17.5 9.5c9.752.377 17.752 4.21 24 11.5-1.084 5.023-4.084 6.69-9 5l-15-9.5c-1.214-2.359-1.214-4.692 0-7z" />
            <path fill="#fff" d="M84.5 10.5c.983 3.798 1.317 7.798 1 12h4c-1.419.951-3.085 1.285-5 1v-13z" />
            <path fill="#fff" d="M37.5 29.5a40.936 40.936 0 0 1 9 .5c4.217 3.472 3.884 6.472-1 9a336.603 336.603 0 0 1-40 3c-3.11-3.889-2.444-6.889 2-9a544.56 544.56 0 0 0 30-3.5zM38.5 46.5c6.685 2.15 7.351 5.317 2 9.5a984.931 984.931 0 0 1-23 2.5c-6.144-.541-7.477-3.374-4-8.5 8.466-1.202 16.799-2.37 25-3.5z" />
            <path fill="#fff" d="M101.5 55.5c15.298-1.732 18.465 3.601 9.5 16-1.695 3.195-4.195 5.528-7.5 7-2.286-.46-3.619-1.793-4-4a27.02 27.02 0 0 1 4-8 4.458 4.458 0 0 0-1.5-2 752.88 752.88 0 0 1-42.5 5c.513 4.29-.487 8.123-3 11.5-4.298 1.46-7.298.126-9-4a293.706 293.706 0 0 0 5-19c1.667-.667 3.333-.667 5 0 .88 1.47 2.214 2.304 4 2.5a907.45 907.45 0 0 0 40-5z" />
            <path fill="#fff" d="M38.5 62.5c6.51 1.553 7.51 4.72 3 9.5-7.83.866-15.663 1.7-23.5 2.5-6.568-.194-8.068-3.027-4.5-8.5 8.466-1.202 16.799-2.37 25-3.5z" />
            <path fill="#fff" d="M92.5 106.5c1.723 1.3 3.89 1.967 6.5 2 2.361-.004 4.527-.337 6.5-1 .958-.453 1.792-1.119 2.5-2 .303-4.029.803-8.03 1.5-12 1.502-3.42 3.502-3.754 6-1 2.866 7.494 3.2 14.994 1 22.5-10.093 3.751-20.426 4.417-31 2-3.151-2.073-4.818-5.073-5-9 .653-11.51 1.487-23.01 2.5-34.5 4.7-4.324 8.2-3.49 10.5 2.5a245.928 245.928 0 0 0-1 30.5z" />
            <path fill="#fff" d="M67.5 74.5c7.38.053 9.88 3.72 7.5 11-2.461 14.956-10.295 25.956-23.5 33-2.999-1.004-4.166-3.004-3.5-6 4.418-3.747 8.084-8.08 11-13a377.24 377.24 0 0 0 8.5-25z" />
            <path fill="#fff" d="M17.5 112.5c-.473-1.406-1.473-2.073-3-2-8.423-10.342-7.756-20.175 2-29.5 14.252-6.807 24.418-2.974 30.5 11.5 1.56 13.941-4.606 21.941-18.5 24-4.158-.279-7.824-1.612-11-4zm7-26c11.193.014 15.36 5.347 12.5 16-7.656 7.268-13.99 6.268-19-3-.968-5.943 1.199-10.276 6.5-13z" />
            <path fill="#fff" d="M92.5 106.5a46.81 46.81 0 0 0 13 1c-1.973.663-4.139.996-6.5 1-2.61-.033-4.777-.7-6.5-2z" />
            <path fill="#fff" d="M14.5 110.5c1.527-.073 2.527.594 3 2-1.527.073-2.527-.594-3-2z" />
        </svg>
    `;

        jpdbButton.addEventListener('click', () => {
            const simulateToggle = () => {
                // simulate cc button press only if is not pressed
                const ccButton = document.querySelector('.ytp-subtitles-button') as HTMLElement;
                if (jpdbButton.getAttribute('aria-pressed') === 'false') {
                    if (ccButton.getAttribute('aria-pressed') === 'false') ccButton.click();
                    jpdbButton.setAttribute('aria-pressed', 'true');
                } else {
                    jpdbButton.setAttribute('aria-pressed', 'false');
                }
            };

            subs.toggle();
            simulateToggle();
        });

        settingsButton.parentElement!.insertBefore(jpdbButton, settingsButton);

        // Get captions parent element
        this.captionsParent = document.getElementById('ytp-caption-window-container') as HTMLElement;

        // display: none
        const captionWindowContainerHTML = `
            <div class="caption-window ytp-caption-window-bottom ytp-caption-window-rollup" id="jpdb-subs" dir="ltr" tabindex="0" lang="ja" draggable="true" style="touch-action: none; text-align: center; left: 50%; width: 299px; margin-left: -149.5px; bottom: 2%; display: none;">
                <span class="captions-text" style="overflow-wrap: normal; display: block;">
                    <span class="caption-visual-line" style="display: block;">
                        <span class="ytp-caption-segment" style="display: inline-block; white-space: pre-wrap; background: rgba(8, 8, 8, 0.75); font-size: 17.7778px; color: rgb(255, 255, 255); fill: rgb(255, 255, 255); font-family: &quot;YouTube Noto&quot;, Roboto, &quot;Arial Unicode Ms&quot;, Arial, Helvetica, Verdana, &quot;PT Sans Caption&quot;, sans-serif;">
                        </span>
                    </span>
                </span>
            </div>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(captionWindowContainerHTML, 'text/html');

        // Create custom subs and place it
        this.jpdbCaptions = doc.querySelector('div')!;
        this.captionsParent.appendChild(this.jpdbCaptions);

        // Hide original subs
        // const originalSubs = this.captionsParent.querySelector('div:not(#jpdb-subs)') as HTMLElement;
        // if (originalSubs) {
        //     originalSubs.style.display = 'none';
        // }
    }

    toggle() {
        if (this.isActive) {
            this.clean();
        } else {
            this.activate(this.transcript!, '');
        }
        this.isActive = !this.isActive;
    }

    clean() {
        if (this.isActive) {
            const originalSubs = this.captionsParent?.querySelector('div:not(#jpdb-subs)') as HTMLElement;
            if (originalSubs) {
                originalSubs.style.display = 'block';
            }

            this.jpdbCaptions!.style.display = 'none';
        }

        this.isAsr = false;
    }

    // Hide original captions and readjust jpdb captions style
    readjustStyle() {
        if (!this.isActive) return;
        // if (!this.videoHasJPSubs) return;

        // Find original subs, anyone except id = jpdb-subs
        const originalSubs = this.captionsParent?.querySelector('div:not(#jpdb-subs)') as HTMLElement;
        if (originalSubs) {
            originalSubs.style.display = 'none';

            // Copy style with one line
            this.jpdbCaptions!.style.cssText = originalSubs.style.cssText;
            this.jpdbCaptions!.style.display = 'block';

            // Copy font style from original subs with class ytp-caption-segment
            const originalSubsFont = originalSubs.querySelector('.ytp-caption-segment') as HTMLElement;
            if (originalSubsFont) {
                const jpdbSubsFont = this.jpdbCaptions!.querySelector('.ytp-caption-segment') as HTMLElement;
                jpdbSubsFont.style.cssText = originalSubsFont.style.cssText;
            }
        }
    }
}

let previousText = '';

let currentUrl = '';
const subs = new Subs();
let playerElement: HTMLVideoElement | null = null;

// Get every time url changes
new MutationObserver(() => {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        if (currentUrl.includes('watch?v=')) {
            observerCallback();
        }
    }
}).observe(document.body, { attributes: false, childList: true, subtree: true });

function observerCallback() {
    subs.clean();
    getTranscriptFromURL(currentUrl).then(transcript => {
        if (transcript) {
            subs.activate(transcript, '');
            console.log('subs active');
        } else {
            console.log('cant get subs');
        }
    });

    // Get current video player
    const playerElementArr = document.getElementsByTagName('video');
    if (playerElementArr.length <= 0) {
        throw new Error('No player element found');
    }

    // replace current one
    playerElement = playerElementArr[0];
}

// Video subtitles
try {
    const visible = parseVisibleObserver();

    const updateCaptions = () => {
        const captionsegment = document.querySelector('#jpdb-subs span.ytp-caption-segment') as HTMLElement;
        if (captionsegment && playerElement) {
            const currentTime: number = playerElement.currentTime;

            const curr = subs.transcript?.content.find(caption => {
                return caption.start + caption.dur > currentTime + 0.2;
            });

            if (curr && curr.text !== previousText) {
                captionsegment.innerHTML = curr.text;

                visible.observe(captionsegment.parentElement!);
                previousText = curr.text;

                // readjust style
                subs.readjustStyle();
                // captionsegment.style.fontSize = originalspan[0].style.fontSize;
            }
        }
    };

    const videosubs = addedObserver(':not(#jpdb-subs) span.ytp-caption-segment', originalspan => {
        if (!subs.isActive) return;

        if (subs.isAsr) {
            updateCaptions();
            subs.readjustStyle();
        } else {
            for (const element of originalspan) {
                visible.observe(element.parentElement!);
            }
        }
    });

    videosubs.observe(document.body, {
        subtree: true,
        childList: true,
    });
} catch (error) {
    console.log('[jpdb] video subs error:', error);
}

// Transcript box
try {
    const visible = parseVisibleObserver();

    const added = addedObserver('yt-formatted-string.ytd-transcript-segment-renderer', elements => {
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
